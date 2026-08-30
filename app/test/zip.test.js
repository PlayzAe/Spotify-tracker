import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { Store } from '../src/engine/store.js';
import { ingestUpload, classifyArchive, looksLikeZip, readZipInto, OUTCOME } from '../src/engine/zip.js';
import {
  play, makeZip, makeAccountDataZip, makeReadmeOnlyZip, notAZip, file, jsonFile,
} from './fixtures.js';

describe('archive classification (DE-2 / DE-3)', () => {
  it('accepts a normal export', () => {
    expect(classifyArchive([
      'my_spotify_data/Spotify Extended Streaming History/Streaming_History_Audio_2024.json',
      'my_spotify_data/Spotify Extended Streaming History/ReadMeFirst.pdf',
    ]).outcome).toBe(OUTCOME.OK);
  });

  it('names the wrong export instead of failing generically', () => {
    expect(classifyArchive(['my_spotify_data/Playlist1.json', 'my_spotify_data/YourLibrary.json']).outcome)
      .toBe(OUTCOME.WRONG_EXPORT);
  });

  it('detects a ReadMe-only zip as its own case', () => {
    expect(classifyArchive(['my_spotify_data/ReadMeFirst_ExtendedStreamingHistory.pdf']).outcome)
      .toBe(OUTCOME.README_ONLY);
  });

  it('ignores mac resource forks when deciding readme-only', () => {
    expect(classifyArchive([
      '__MACOSX/._ReadMe.pdf', '.DS_Store', 'my_spotify_data/',
      'my_spotify_data/ReadMeFirst_ExtendedStreamingHistory.pdf',
    ]).outcome).toBe(OUTCOME.README_ONLY);
  });

  it('treats a video-only export as no history', () => {
    expect(classifyArchive(['x/Streaming_History_Video_2024.json']).outcome).toBe(OUTCOME.NO_HISTORY);
  });

  it('treats an empty archive as no history', () => {
    expect(classifyArchive([]).outcome).toBe(OUTCOME.NO_HISTORY);
  });
});

describe('magic-number check', () => {
  it('accepts real zip signatures and rejects anything else', () => {
    expect(looksLikeZip(makeZip([play()]))).toBe(true);
    expect(looksLikeZip(notAZip())).toBe(false);
    expect(looksLikeZip(new Uint8Array([]))).toBe(false);
    expect(looksLikeZip(new Uint8Array([0x50]))).toBe(false);
    expect(looksLikeZip(strToU8('%PDF-1.4').buffer)).toBe(false);
  });
});

describe('streaming a real archive', () => {
  it('parses nested entries and ignores readme and video', async () => {
    const store = new Store();
    const res = await readZipInto(store, makeZip([play(), play({ ts: '2024-05-02T10:00:00Z' })]));
    expect(res.outcome).toBe(OUTCOME.OK);
    expect(store.stats.filesParsed).toBe(1);   // video file never inflated
    expect(store.stats.records).toBe(2);
  });

  it('continues past a corrupt file and records the skip (DE-8)', async () => {
    const store = new Store();
    await readZipInto(store, makeZip([play()], { corrupt: true }));
    expect(store.stats.records).toBe(1);
    expect(store.stats.filesSkipped).toHaveLength(1);
    expect(store.stats.filesSkipped[0].reason).toMatch(/json/i);
  });

  it('merges multiple history files inside one archive', async () => {
    const store = new Store();
    await readZipInto(store, makeZip([play()], { second: [play({ ts: '2024-07-01T10:00:00Z' })] }));
    expect(store.stats.filesParsed).toBe(2);
    expect(store.stats.records).toBe(2);
  });

  it('reports progress as files complete', async () => {
    const store = new Store();
    const seen = [];
    await readZipInto(store, makeZip([play()], { second: [play({ ts: '2024-07-01T10:00:00Z' })] }),
      (p) => seen.push(p));
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.at(-1).records).toBe(2);
    expect(seen.at(-1).current).toMatch(/^Streaming_History_Audio_/);
  });

  it('handles a file whose contents are a JSON object rather than a list', async () => {
    const store = new Store();
    const buf = zipSync({ 'x/Streaming_History_Audio_2024.json': strToU8('{"not":"a list"}') }).buffer;
    await readZipInto(store, buf);
    expect(store.stats.records).toBe(0);
    expect(store.stats.filesSkipped[0].reason).toMatch(/list of plays/);
  });
});

describe('whole-upload handling', () => {
  it('accepts the zip exactly as Spotify sends it', async () => {
    const store = new Store();
    const outcome = await ingestUpload(store, [file('my_spotify_data.zip', makeZip([play()]))]);
    expect(outcome).toBe(OUTCOME.OK);
    expect(store.stats.records).toBe(1);
  });

  it('accepts several zips and de-duplicates the overlap', async () => {
    const store = new Store();
    const a = play({ ts: '2024-01-01T10:00:00Z' });
    const b = play({ ts: '2024-01-02T10:00:00Z' });
    const outcome = await ingestUpload(store, [
      file('part1.zip', makeZip([a, b])),
      file('part2.zip', makeZip([b, play({ ts: '2024-01-03T10:00:00Z' })])),
    ]);
    expect(outcome).toBe(OUTCOME.OK);
    expect(store.stats.records).toBe(3);
    expect(store.stats.duplicates).toBe(1);
  });

  it('accepts loose json files', async () => {
    const store = new Store();
    const outcome = await ingestUpload(store, [jsonFile('Streaming_History_Audio_2024.json', [play()])]);
    expect(outcome).toBe(OUTCOME.OK);
    expect(store.stats.records).toBe(1);
  });

  it('accepts a zip that was renamed without the .zip extension', async () => {
    const store = new Store();
    expect(await ingestUpload(store, [file('export', makeZip([play()]))])).toBe(OUTCOME.OK);
  });

  it('names the Account Data mistake', async () => {
    const store = new Store();
    expect(await ingestUpload(store, [file('my_spotify_data.zip', makeAccountDataZip())]))
      .toBe(OUTCOME.WRONG_EXPORT);
  });

  it('names the ReadMe-only case', async () => {
    const store = new Store();
    expect(await ingestUpload(store, [file('my_spotify_data.zip', makeReadmeOnlyZip())]))
      .toBe(OUTCOME.README_ONLY);
  });

  it('rejects a file that is not an archive at all', async () => {
    const store = new Store();
    expect(await ingestUpload(store, [file('notes.txt', notAZip())])).toBe(OUTCOME.NOT_AN_ARCHIVE);
  });

  it('reports an export whose history files are empty', async () => {
    const store = new Store();
    expect(await ingestUpload(store, [file('my_spotify_data.zip', makeZip([]))]))
      .toBe(OUTCOME.EMPTY_HISTORY);
  });

  it('does not throw on a truncated archive', async () => {
    const full = new Uint8Array(makeZip([play()]));
    const store = new Store();
    await expect(ingestUpload(store, [file('broken.zip', full.slice(0, Math.floor(full.length / 2)).buffer)]))
      .resolves.toBeDefined();
  });

  it('salvages the good archive when one of several is broken', async () => {
    const store = new Store();
    const outcome = await ingestUpload(store, [
      file('broken.zip', notAZip()),
      file('good.zip', makeZip([play()])),
    ]);
    expect(outcome).toBe(OUTCOME.OK);
    expect(store.stats.records).toBe(1);
  });

  it('handles an empty upload', async () => {
    const store = new Store();
    expect(await ingestUpload(store, [])).toBe(OUTCOME.NOT_AN_ARCHIVE);
  });
});

describe('end-to-end through the store', () => {
  it('produces a queryable result from a raw archive', async () => {
    const store = new Store();
    await ingestUpload(store, [file('my_spotify_data.zip', makeZip([
      play({ ts: '2020-01-01T10:00:00Z', ms_played: 200000 }),
      play({ ts: '2024-01-01T10:00:00Z', ms_played: 300000, master_metadata_track_name: 'Other' }),
    ]))]);
    store.finalize();
    const q = store.query();
    expect(q.plays).toBe(2);
    expect(q.totalMs).toBe(500000);
    expect(store.years()).toEqual([2024, 2023, 2022, 2021, 2020]);
    expect(q.tracks[0].title).toBe('Other');
  });
});
