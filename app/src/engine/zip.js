/**
 * Archive handling: decide what an upload actually is, then stream only what we need.
 * Kept separate from Store so both can be unit-tested independently.
 */
import { Unzip, AsyncUnzipInflate } from 'fflate';
import { isAudioHistory, isAccountDataMarker, isReadme, isVideoHistory, basename } from './normalize.js';

export const OUTCOME = {
  OK: 'OK',
  WRONG_EXPORT: 'WRONG_EXPORT',   // they downloaded "Account data"
  README_ONLY: 'README_ONLY',     // history wasn't included in the request
  NO_HISTORY: 'NO_HISTORY',       // nothing recognisable at all
  NOT_AN_ARCHIVE: 'NOT_AN_ARCHIVE',
  EMPTY_HISTORY: 'EMPTY_HISTORY', // valid files, zero plays inside
};

/**
 * Classify an archive from its entry names alone — before decompressing anything.
 * DE-2 requires this to fire *before* a full parse so the user isn't made to wait
 * for a useless result.
 */
export function classifyArchive(names) {
  const audio = names.filter(isAudioHistory);
  if (audio.length) return { outcome: OUTCOME.OK, audio };
  if (names.some(isAccountDataMarker)) return { outcome: OUTCOME.WRONG_EXPORT, audio: [] };
  const meaningful = names.filter((n) => !/\/$/.test(n) && !/^__MACOSX\//.test(n) && !/\.DS_Store$/.test(n));
  if (meaningful.length && meaningful.every(isReadme)) return { outcome: OUTCOME.README_ONLY, audio: [] };
  if (names.some(isVideoHistory)) return { outcome: OUTCOME.NO_HISTORY, audio: [] };
  return { outcome: OUTCOME.NO_HISTORY, audio: [] };
}

/** Cheap magic-number check so a renamed .txt doesn't reach the inflater. */
export function looksLikeZip(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u.length < 4) return false;
  // PK\x03\x04 (normal), PK\x05\x06 (empty), PK\x07\x08 (spanned)
  return u[0] === 0x50 && u[1] === 0x4b &&
    ((u[2] === 3 && u[3] === 4) || (u[2] === 5 && u[3] === 6) || (u[2] === 7 && u[3] === 8));
}

/**
 * Stream a zip into a Store. Only entries whose BASENAME matches
 * Streaming_History_Audio_*.json are inflated — everything else, including the
 * 1.6 MB ReadMe PDF, is skipped without being decompressed at all.
 */
export function readZipInto(store, buffer, onProgress) {
  return new Promise((resolve, reject) => {
    if (!looksLikeZip(buffer)) { resolve({ outcome: OUTCOME.NOT_AN_ARCHIVE, names: [] }); return; }

    const dec = new TextDecoder();
    const names = [];
    let pending = 0, pushed = false, settled = false;

    const finish = () => {
      if (settled || !pushed || pending > 0) return;
      settled = true;
      const cls = classifyArchive(names);
      resolve({ outcome: cls.outcome, names });
    };

    const unzip = new Unzip();
    unzip.register(AsyncUnzipInflate);

    unzip.onfile = (file) => {
      names.push(file.name);
      if (!isAudioHistory(file.name)) return; // never call start() -> never inflated

      pending++;
      const chunks = [];
      let size = 0;
      file.ondata = (err, chunk, final) => {
        if (err) {
          store.stats.filesSkipped.push({ name: basename(file.name), reason: 'could not be unpacked' });
          pending--; finish(); return;
        }
        if (chunk && chunk.length) { chunks.push(chunk); size += chunk.length; }
        if (final) {
          const merged = new Uint8Array(size);
          let off = 0;
          for (const c of chunks) { merged.set(c, off); off += c.length; }
          chunks.length = 0;
          try {
            store.ingestFileText(file.name, dec.decode(merged));
            onProgress?.({ files: store.stats.filesParsed, records: store.stats.records, current: basename(file.name) });
          } catch (e) {
            store.stats.filesSkipped.push({ name: basename(file.name), reason: 'unreadable' });
          }
          pending--; finish();
        }
      };
      try { file.start(); }
      catch { store.stats.filesSkipped.push({ name: basename(file.name), reason: 'could not be unpacked' }); pending--; }
    };

    try {
      unzip.push(new Uint8Array(buffer), true);
      pushed = true;
      finish();
    } catch (e) {
      // fflate throws synchronously on a truncated or corrupt archive.
      // One unreadable file must never abort a multi-file upload, so this
      // resolves as an outcome rather than rejecting.
      if (!settled) {
        settled = true;
        store.stats.filesSkipped.push({ name: 'archive', reason: 'archive is incomplete or corrupt' });
        resolve({ outcome: names.some(isAudioHistory) ? OUTCOME.OK : OUTCOME.NOT_AN_ARCHIVE, names });
      }
    }
  });
}

/**
 * Handle a whole upload: any mix of zips and loose json, in any order.
 * Multiple zips are merged; duplicates across them are dropped by the Store.
 */
export async function ingestUpload(store, files, onProgress) {
  let sawArchive = false, sawAudio = false;
  let wrongExport = false, readmeOnly = false;

  for (const f of files) {
    const isZipName = /\.zip$/i.test(f.name);
    const isJsonName = /\.json$/i.test(f.name);

    if (isZipName || looksLikeZip(f.buffer)) {
      sawArchive = true;
      const res = await readZipInto(store, f.buffer, onProgress);
      if (res.outcome === OUTCOME.OK) sawAudio = true;
      if (res.outcome === OUTCOME.WRONG_EXPORT) wrongExport = true;
      if (res.outcome === OUTCOME.README_ONLY) readmeOnly = true;
    } else if (isJsonName) {
      const text = new TextDecoder().decode(f.buffer);
      if (isAudioHistory(f.name) || !isAccountDataMarker(f.name)) {
        const before = store.stats.records;
        const ok = store.ingestFileText(f.name, text);
        if (ok) { sawAudio = true; onProgress?.({ files: store.stats.filesParsed, records: store.stats.records, current: basename(f.name) }); }
        if (ok && store.stats.records === before && store.stats.records === 0) sawAudio = true;
      } else {
        wrongExport = true;
      }
    } else {
      store.stats.filesSkipped.push({ name: basename(f.name), reason: 'not a zip or json file' });
    }
  }

  if (!sawAudio) {
    if (wrongExport) return OUTCOME.WRONG_EXPORT;
    if (readmeOnly) return OUTCOME.README_ONLY;
    if (!sawArchive && !files.some((f) => /\.json$/i.test(f.name))) return OUTCOME.NOT_AN_ARCHIVE;
    return OUTCOME.NO_HISTORY;
  }
  if (store.stats.records === 0) return OUTCOME.EMPTY_HISTORY;
  return OUTCOME.OK;
}
