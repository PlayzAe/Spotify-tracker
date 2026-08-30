/**
 * Thin message wrapper. All logic lives in store.js and zip.js so it can be
 * unit-tested in Node without a Worker or a DOM.
 *
 * This file makes ZERO network requests, and must continue to. Cover-art
 * lookups are a frontend concern — keeping them out is what makes the
 * "nothing leaves your device" claim verifiable in the Network tab.
 */
import { Store } from './store.js';
import { ingestUpload, OUTCOME } from './zip.js';

let store = null;

self.onmessage = async ({ data }) => {
  const post = (type, payload) => self.postMessage({ type, ...payload });

  if (data.cmd === 'ingest') {
    const t0 = performance.now();
    store = new Store();
    try {
      const outcome = await ingestUpload(store, data.files, (p) => post('progress', p));
      if (outcome !== OUTCOME.OK) {
        post('failed', { reason: outcome, summary: store.summary() });
        return;
      }
      store.finalize();
      post('done', {
        tookMs: Math.round(performance.now() - t0),
        summary: store.summary(),
        result: store.query(data.initialQuery || {}),
      });
    } catch (err) {
      post('failed', { reason: 'PARSE_ERROR', message: String(err?.message || err) });
    }
    return;
  }

  if (data.cmd === 'query') {
    if (!store) { post('failed', { reason: 'NO_DATA' }); return; }
    try {
      post('queried', { result: store.query(data.opts || {}), token: data.token });
    } catch (err) {
      post('failed', { reason: 'QUERY_ERROR', message: String(err?.message || err) });
    }
  }
};
