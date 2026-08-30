/* Guardrails for the Web Interface Guidelines pass.
 *
 * These read the shipped CSS and HTML as text on purpose. Every rule here
 * was a real defect at some point, and each one is the kind that comes back
 * silently during a later edit — a `transition: all` reintroduced by a
 * copy-paste, an input dropped back under 16px. Asserting on the source is
 * what makes them stay fixed. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/style.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');

/** Strip comments so prose about a rule never satisfies a test for it. */
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('motion stays on the compositor', () => {
  it('never uses transition: all', () => {
    // `all` silently animates layout properties added later, which is how a
    // hover state turns into a per-frame reflow without anyone noticing.
    expect(code).not.toMatch(/transition:\s*all\b/);
  });

  it('never transitions a property that triggers layout', () => {
    const offenders = [];
    for (const m of code.matchAll(/transition:([^;}]+)[;}]/g)) {
      const props = m[1].split(',').map((p) => p.trim().split(/\s+/)[0]);
      for (const p of props) {
        if (/^(width|height|top|left|right|bottom|margin|padding|stroke-width)$/.test(p)) offenders.push(p);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('offers a reduced-motion variant', () => {
    expect(code).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});

describe('touch and mobile input', () => {
  it('lifts inputs to 16px on phones so iOS Safari does not auto-zoom', () => {
    // Below 16px, focusing an input rescales the whole viewport and never
    // fully restores it — the root cause of "I cannot scroll properly".
    const mq = code.match(/@media \(max-width: 860px\) \{[\s\S]*?font-size: 16px/);
    expect(mq).not.toBeNull();
  });

  it('sets touch-action and a tap highlight that matches the palette', () => {
    expect(code).toMatch(/touch-action:\s*manipulation/);
    expect(code).toMatch(/-webkit-tap-highlight-color/);
  });
});

describe('browser surfaces are themed, not inherited', () => {
  it.each([
    ['selection', /::selection/],
    ['caret', /caret-color/],
    ['form accent', /accent-color/],
    ['scrollbar', /scrollbar-color/],
    ['underline offset', /text-underline-offset/],
  ])('themes the %s', (_label, re) => {
    expect(code).toMatch(re);
  });
});

describe('theming resolves in all three viewer states', () => {
  it('defines the palette on bare :root, and again for both dark signals', () => {
    expect(code).toMatch(/:root\s*\{[^}]*--pine:/);
    expect(code).toMatch(/:root\[data-theme="dark"\]/);
    expect(code).toMatch(/prefers-color-scheme:\s*dark/);
  });

  it('guards the media-query dark block so an explicit light choice wins', () => {
    expect(code).toMatch(/:root:not\(\[data-theme="light"\]\)/);
  });

  it('paints an explicit background on body rather than borrowing the host', () => {
    expect(code).toMatch(/body\s*\{[^}]*background:\s*var\(--paper\)/);
  });
});

describe('theme toggle and browser chrome', () => {
  const main = readFileSync(join(root, 'src/main.js'), 'utf8');

  it('resolves the effective theme before flipping it', () => {
    // Reading only data-theme makes the first click a no-op for anyone who
    // never set a preference and is already on the theme it flips to.
    expect(main).toMatch(/matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches/);
    expect(main).not.toMatch(/getAttribute\('data-theme'\) === 'light' \? 'dark' : 'light'/);
  });

  it('points theme-color at the page background, not the accent', () => {
    const metas = [...html.matchAll(/<meta name="theme-color" content="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
    expect(metas.length).toBeGreaterThan(0);
    // #156152 is the accent; the browser paints its chrome with this value.
    expect(metas).not.toContain('#156152');
    expect(metas.map((c) => c.toUpperCase())).toContain('#F1F0EA');
  });

  it('keeps theme-color in step with the toggle', () => {
    expect(main).toMatch(/syncThemeColor/);
  });
});

describe('accessibility', () => {
  it('offers a skip link as the first focusable element', () => {
    expect(html).toMatch(/<a class="skip" href="#main">/);
    expect(html).toMatch(/<main id="main"/);
    expect(code).toMatch(/\.skip:focus-visible/);
  });

  it('clears the sticky header when an anchor is jumped to', () => {
    expect(code).toMatch(/scroll-margin-top/);
  });

  it('announces the recomputed result to a screen reader', () => {
    expect(html).toMatch(/id="r-note"[^>]*aria-live="polite"/);
  });

  it('gives every icon-only button an accessible name', () => {
    for (const tag of html.match(/<button\b[^>]*>/g) || []) {
      const hasText = /aria-label=|aria-labelledby=/.test(tag);
      // Buttons with visible text are named by their content; the ones this
      // guards are the icon-only controls in the header.
      if (/class="icon-btn"/.test(tag)) expect(hasText).toBe(true);
    }
  });
});

describe('no generated-UI defaults crept back', () => {
  it('has no kicker or eyebrow above a heading', () => {
    expect(html).not.toMatch(/class="[^"]*\b(eyebrow|sec-tag)\b/);
    expect(code).not.toMatch(/\.(eyebrow|sec-tag)\s*\{/);
  });

  it('has no thick coloured side-tab border', () => {
    expect(code).not.toMatch(/border-(left|right):\s*[2-9]\d*px\s+solid\s+var\(--(pine|mint)\)/);
  });

  it('does not use one of the fonts every generated page converges on', () => {
    for (const f of ['Inter', 'Roboto', 'Fraunces', 'Geist', 'Plus Jakarta', 'Space Grotesk']) {
      expect(code).not.toContain(`'${f}`);
    }
  });

  it('self-hosts both faces so the engine still makes zero network calls', () => {
    // The privacy claim on the front page is only true if nothing — fonts
    // included — is fetched from a third party at runtime.
    expect(code).not.toMatch(/@import|fonts\.googleapis|fonts\.gstatic/);
    for (const m of code.matchAll(/src:\s*url\(([^)]+)\)/g)) {
      expect(m[1]).toMatch(/^'\/fonts\//);
    }
  });
});

describe('markup is well formed', () => {
  /** Blank out quoted attribute values so their contents are never read as
   *  markup. The favicon is an inline SVG inside a data: URI, and its own
   *  attributes otherwise look like duplicates on the <link>. */
  const hollow = (tag) => tag.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  const visibleText = html.replace(/<[a-z!/][^"'>]*(?:(?:"[^"]*"|'[^']*')[^"'>]*)*>/gi, ' ');

  it('never repeats an attribute on one element, which drops the second', () => {
    // A duplicate attribute is not an error the browser reports: it keeps the
    // first and silently discards the rest, so the style you wrote second
    // simply never applies.
    for (const tag of html.match(/<[a-z][^>]*>/gi) || []) {
      const names = [...hollow(tag).matchAll(/(?:^|\s)([a-z-]+)=/gi)].map((m) => m[1].toLowerCase());
      expect(new Set(names).size, tag.slice(0, 90)).toBe(names.length);
    }
  });

  it('uses the ellipsis character rather than three periods in visible copy', () => {
    expect(visibleText).not.toMatch(/\.\.\./);
  });

  it('uses typographic quotes in prose', () => {
    expect(visibleText).not.toMatch(/"[a-z]/i);
    expect(visibleText).not.toMatch(/[a-z]'[a-z]/i);
  });
});
