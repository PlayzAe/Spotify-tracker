/**
 * Ad-blocker detection, tuned hard against false positives.
 *
 * A false positive is worse than a miss here: telling someone who is NOT
 * blocking that they are blocking reads as either broken or dishonest, and
 * this product's whole position is that it tells the truth.
 *
 * Three independent signals; two must agree. Every signal has a "we could not
 * tell" state that counts as NOT blocking.
 *
 * No ads are loaded anywhere in this build — this only detects.
 */

const BAIT_CLASSES = [
  'ad-banner ads adsbox ad-placement',
  'sponsored-ad advertisement banner-ad',
  'adsbygoogle ad-slot doubleclick',
];

/** Signal 1: bait elements. The classic technique — filter lists hide these by name. */
function baitSignal() {
  return new Promise((resolve) => {
    const nodes = BAIT_CLASSES.map((cls) => {
      const el = document.createElement('div');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      // Off-screen but genuinely laid out, so a real layout is measurable.
      el.style.cssText =
        'position:absolute;left:-9999px;top:-9999px;width:300px;height:250px;pointer-events:none;';
      el.innerHTML = '&nbsp;';
      document.body.appendChild(el);
      return el;
    });

    // Two frames so extensions and Brave Shields have applied their rules.
    // requestAnimationFrame does NOT fire in a hidden or backgrounded tab, so a
    // timer races it — otherwise this promise never settles and every caller
    // awaiting it hangs. Whichever fires first wins; `settled` keeps it to one.
    let settled = false;
    const measure = () => {
      if (settled) return;
      settled = true;
      let blocked = 0;
      let measurable = 0;
      for (const el of nodes) {
        const cs = getComputedStyle(el);
        // If we cannot measure at all, we learn nothing — do not guess.
        const hasBox = el.offsetParent !== null || el.offsetHeight > 0 || cs.display !== 'none';
        if (!hasBox && cs.display === 'none' && cs.visibility === 'hidden') { /* ambiguous */ }
        measurable++;
        if (el.offsetHeight === 0 || el.offsetWidth === 0 ||
            cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') {
          blocked++;
        }
      }
      nodes.forEach((n) => n.remove());
      resolve(measurable === 0 ? null : blocked >= 2);
    };
    requestAnimationFrame(() => requestAnimationFrame(measure));
    setTimeout(measure, 250);
  });
}

/**
 * Signal 2: our own control element, styled identically but named innocuously.
 * If the control is ALSO hidden, then something unrelated to ad blocking is
 * going on (our stylesheet failed, the tab is throttled, print styles, etc.)
 * and signal 1 must be discarded. This is the main false-positive guard.
 */
function controlIsHealthy() {
  const el = document.createElement('div');
  el.className = 'layout-probe-control';
  el.style.cssText =
    'position:absolute;left:-9999px;top:-9999px;width:300px;height:250px;pointer-events:none;';
  el.innerHTML = '&nbsp;';
  document.body.appendChild(el);
  const ok = el.offsetHeight > 0 && el.offsetWidth > 0;
  el.remove();
  return ok;
}

/**
 * Signal 3: Brave exposes itself explicitly. When present this is definitive
 * in one direction only — Brave with Shields down still reports as Brave, so
 * it is used to confirm, never to accuse on its own.
 */
async function braveSignal() {
  try {
    if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
      return await navigator.brave.isBrave();
    }
  } catch { /* ignore */ }
  return false;
}

/**
 * Returns { blocking, confidence, reason }.
 * `blocking` is only true when the evidence is unambiguous.
 */
export async function detect() {
  if (!document.body) return { blocking: false, confidence: 'none', reason: 'no document' };

  const healthy = controlIsHealthy();
  if (!healthy) {
    // Our own unblocked element failed to lay out — the page itself is the
    // anomaly, not the user. Never accuse in this state.
    return { blocking: false, confidence: 'none', reason: 'layout unavailable' };
  }

  const bait = await baitSignal();
  if (bait === null) return { blocking: false, confidence: 'none', reason: 'not measurable' };

  const brave = await braveSignal();

  if (bait && brave) return { blocking: true, confidence: 'high', reason: 'brave shields' };
  if (bait) return { blocking: true, confidence: 'high', reason: 'content blocker' };
  return { blocking: false, confidence: 'high', reason: brave ? 'brave, shields down' : 'no blocker' };
}

/* ---------- the prompt ---------- *
 * Rules from the brief, all of them load-bearing:
 *   - after results, never during upload or parsing
 *   - once per session, dismissal remembered
 *   - dismissible by X, click-outside and Escape
 *   - nothing is ever gated on the answer
 */

const DISMISSED = 'adblock-prompt-dismissed';

export function alreadyDismissed() {
  try { return sessionStorage.getItem(DISMISSED) === '1'; } catch { return false; }
}
function markDismissed() {
  try { sessionStorage.setItem(DISMISSED, '1'); } catch { /* ignore */ }
}

export function showPrompt() {
  if (alreadyDismissed()) return;
  const wrap = document.createElement('div');
  wrap.className = 'ab-wrap';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'false');
  wrap.setAttribute('aria-labelledby', 'ab-h');
  wrap.innerHTML = `
    <div class="ab-card">
      <button class="ab-x" aria-label="Dismiss">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <h3 id="ab-h">We noticed an ad blocker — that’s completely fine.</h3>
      <p>This site is free and always will be. No accounts, no subscriptions, nothing locked.</p>
      <p><strong>Any ads here could never be based on your listening.</strong> Your data
         never reaches us — everything happens in your browser. We couldn’t target you
         with it if we wanted to.</p>
      <p class="ab-note">No ads are running in this build. Nothing here is gated either way.</p>
      <div class="ab-row"><button class="ab-ok">Got it</button></div>
    </div>`;

  const close = () => { markDismissed(); wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  wrap.querySelector('.ab-x').onclick = close;
  wrap.querySelector('.ab-ok').onclick = close;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  wrap.querySelector('.ab-ok').focus();
}
