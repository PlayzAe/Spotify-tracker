/**
 * Team presence chips.
 *
 * Structure and motion follow the reference portfolio closely: a pill chip
 * that scales on hover, and a card that rises in slowly above it with a
 * banner, a squircle avatar overlapping it, and a spinning album disc. The
 * palette is ours (pine), not the reference's lime.
 *
 * One person has Discord (live status via Lanyard's PUBLIC endpoint), the
 * other has GitHub only, and the card adapts rather than showing empty slots.
 *
 * PRIVACY: the only outbound request here fetches OUR status. It sends nothing
 * about the viewer — no identifier, no listening data. No API key is involved;
 * Lanyard's read endpoint is public and their docs forbid keys in a frontend.
 */

const LANYARD = 'https://api.lanyard.rest/v1/users/';
const CDN = 'https://cdn.discordapp.com';

/* ══════════ pure helpers (unit-tested) ══════════ */

/** Animated avatars start with `a_` and must be requested as .gif. */
export function discordAvatarUrl(userId, hash, size = 160) {
  if (!userId || !hash) return null;
  const ext = String(hash).startsWith('a_') ? 'gif' : 'png';
  return `${CDN}/avatars/${userId}/${hash}.${ext}?size=${size}`;
}

/** The cosmetic frame some accounts wear around their avatar. */
export const decorationUrl = (asset) =>
  asset ? `${CDN}/avatar-decoration-presets/${asset}.png?size=160` : null;

/** Custom-status emoji — animated ones are gifs. */
export function emojiUrl(emoji) {
  if (!emoji || !emoji.id) return null;
  return `${CDN}/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}?size=32`;
}

/** The little server tag some profiles carry, e.g. "ZYK". */
export function guildTagUrl(guild) {
  if (!guild || !guild.identity_guild_id || !guild.badge) return null;
  return `${CDN}/guild-tag-badges/${guild.identity_guild_id}/${guild.badge}.png?size=32`;
}

export const STATUS = {
  online: { label: 'Online', tone: 'online' },
  idle: { label: 'Idle', tone: 'idle' },
  dnd: { label: 'Do not disturb', tone: 'dnd' },
  offline: { label: 'Offline', tone: 'offline' },
};
export const statusInfo = (s) => STATUS[s] || STATUS.offline;

/** Discord activity types. 4 is the custom status, which is handled apart. */
export const ACTIVITY = {
  0: { verb: 'Playing', icon: 'game' },
  1: { verb: 'Streaming', icon: 'stream' },
  2: { verb: 'Listening to', icon: 'music' },
  3: { verb: 'Watching', icon: 'watch' },
  5: { verb: 'Competing in', icon: 'game' },
};

/** Elapsed / total progress through a track, clamped to 0..1. */
export function trackProgress(ts, now = Date.now()) {
  if (!ts || !ts.start || !ts.end || ts.end <= ts.start) return null;
  const span = ts.end - ts.start;
  const done = Math.min(span, Math.max(0, now - ts.start));
  return { ratio: done / span, elapsed: done, total: span };
}

export function mmss(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Which devices they are signed in on. */
export function devicesOf(d) {
  const out = [];
  if (d.active_on_discord_desktop) out.push('Desktop');
  if (d.active_on_discord_mobile) out.push('Mobile');
  if (d.active_on_discord_web) out.push('Web');
  return out;
}

/** Everything the card can show, pulled out of Lanyard's payload. Never throws. */
export function readPresence(payload) {
  const d = payload && payload.success && payload.data ? payload.data : null;
  if (!d) return null;
  const u = d.discord_user || {};
  const acts = Array.isArray(d.activities) ? d.activities : [];
  const custom = acts.find((a) => a.type === 4) || null;
  const game = acts.find((a) => a.type === 0 || a.type === 1 || a.type === 3 || a.type === 5) || null;
  const sp = d.listening_to_spotify && d.spotify ? d.spotify : null;

  return {
    id: u.id || null,
    username: u.username || null,
    name: u.global_name || u.display_name || u.username || 'Unknown',
    avatar: discordAvatarUrl(u.id, u.avatar),
    decoration: decorationUrl(u.avatar_decoration_data && u.avatar_decoration_data.asset),
    guildTag: u.primary_guild && u.primary_guild.identity_enabled
      ? { tag: u.primary_guild.tag || '', icon: guildTagUrl(u.primary_guild) } : null,
    status: d.discord_status || 'offline',
    statusLabel: statusInfo(d.discord_status).label,
    tone: statusInfo(d.discord_status).tone,
    devices: devicesOf(d),
    custom: custom ? { text: custom.state || '', emoji: emojiUrl(custom.emoji) } : null,
    game: game ? {
      verb: (ACTIVITY[game.type] || ACTIVITY[0]).verb,
      icon: (ACTIVITY[game.type] || ACTIVITY[0]).icon,
      name: game.name || '', details: game.details || '', state: game.state || '',
    } : null,
    spotify: sp ? {
      song: sp.song || '',
      // Spotify joins multiple artists with "; ".
      artist: String(sp.artist || '').split(';').map((x) => x.trim()).filter(Boolean).join(', '),
      album: sp.album || '',
      art: sp.album_art_url || null,
      url: sp.track_id ? `https://open.spotify.com/track/${sp.track_id}` : null,
      timestamps: sp.timestamps || null,
    } : null,
  };
}

/** Fetch one profile. Resolves to null on any failure — this is decoration. */
export async function fetchPresence(userId, { signal } = {}) {
  try {
    const res = await fetch(LANYARD + encodeURIComponent(userId), { signal });
    if (!res.ok) return null;
    return readPresence(await res.json());
  } catch {
    return null;
  }
}

/* ══════════ rendering ══════════ */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ICONS = {
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  game: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><rect x="2" y="6" width="20" height="12" rx="5"/>',
  stream: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
  watch: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
};
const svg = (name, cls = '') =>
  `<svg class="${cls}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.music}</svg>`;

function spotifyBlock(sp) {
  if (!sp) return '';
  const p = trackProgress(sp.timestamps);
  return `
    <div class="pc-sec">
      <div class="pc-sec-h pc-spotify">${svg('music', 'pc-bounce')}<span>Listening to Spotify</span></div>
      <a class="pc-media" ${sp.url ? `href="${esc(sp.url)}" target="_blank" rel="noopener noreferrer"` : ''}>
        ${sp.art ? `<img class="pc-disc" src="${esc(sp.art)}" alt="">` : '<span class="pc-disc pc-disc-empty"></span>'}
        <span class="pc-media-t">
          <strong>${esc(sp.song)}</strong>
          <span>by ${esc(sp.artist)}</span>
          ${sp.album ? `<span class="pc-album">on ${esc(sp.album)}</span>` : ''}
        </span>
      </a>
      ${p ? `<div class="pc-prog"><i style="--p:${p.ratio.toFixed(4)}"></i></div>
        <div class="pc-times"><span>${mmss(p.elapsed)}</span><span>${mmss(p.total)}</span></div>` : ''}
    </div>`;
}

function gameBlock(g) {
  if (!g) return '';
  return `
    <div class="pc-sec">
      <div class="pc-sec-h">${svg(g.icon, 'pc-bounce')}<span>${esc(g.verb)}</span></div>
      <div class="pc-media">
        <span class="pc-media-t"><strong>${esc(g.name)}</strong>
          ${g.details ? `<span>${esc(g.details)}</span>` : ''}
          ${g.state ? `<span class="pc-album">${esc(g.state)}</span>` : ''}</span>
      </div>
    </div>`;
}

export function personCard(person, live) {
  const avatar = (live && live.avatar) || person.githubAvatar;
  // A GitHub-only teammate is shown as active rather than a grey "offline",
  // which would read as "gone" when it only means "not on Discord".
  const tone = live ? live.tone : (person.discordId ? 'offline' : 'online');
  const name = live ? live.name : person.name;
  const handle = live ? `@${live.username}` : `@${person.github}`;
  const statusLine = live ? live.statusLabel : (person.discordId ? 'Offline' : 'Active on GitHub');

  return `
    <div class="pc-card" role="dialog" aria-label="Contact ${esc(person.name)}">
      <div class="pc-banner"></div>
      <div class="pc-body">
        <div class="pc-row">
          <span class="pc-av-wrap">
            <img class="pc-av" src="${esc(avatar)}" alt="" width="76" height="76" loading="lazy">
            ${live && live.decoration ? `<img class="pc-deco" src="${esc(live.decoration)}" alt="" aria-hidden="true">` : ''}
            <span class="pc-dot pc-${tone}"></span>
          </span>
          <a class="pc-cta" href="${person.discordId
              ? `https://discord.com/users/${esc(person.discordId)}`
              : `https://github.com/${esc(person.github)}`}"
             target="_blank" rel="noopener noreferrer">
            ${person.discordId ? 'Message' : 'Follow'}
          </a>
        </div>

        <div class="pc-id">
          <h4>${esc(name)}
            ${live && live.guildTag && live.guildTag.tag
              ? `<span class="pc-tag">${live.guildTag.icon
                  ? `<img src="${esc(live.guildTag.icon)}" alt="">` : ''}${esc(live.guildTag.tag)}</span>` : ''}
          </h4>
          <span class="pc-handle">${esc(handle)}</span>
          <p class="pc-state">${esc(statusLine)}${live && live.devices.length
            ? ` · ${esc(live.devices.join(', '))}` : ''}</p>
          <p class="pc-role">${esc(person.role)}</p>
        </div>

        ${live && live.custom && (live.custom.text || live.custom.emoji) ? `
          <div class="pc-custom">
            ${live.custom.emoji ? `<img class="pc-emoji" src="${esc(live.custom.emoji)}" alt="">` : ''}
            <span>${esc(live.custom.text)}</span>
          </div>` : ''}

        ${live ? spotifyBlock(live.spotify) : ''}
        ${live && !live.spotify ? gameBlock(live.game) : ''}

        <div class="pc-links">
          <a href="https://github.com/${esc(person.github)}" target="_blank" rel="noopener noreferrer"
             aria-label="${esc(person.name)} on GitHub">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 8.8 21.5c.5.1.7-.2.7-.5v-1.7C6.7 19.9 6.1 18 6.1 18c-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>
            <span>${esc(person.github)}</span>
          </a>
        </div>
      </div>
    </div>`;
}

export function personChip(person, live) {
  const avatar = (live && live.avatar) || person.githubAvatar;
  const tone = live ? live.tone : (person.discordId ? 'offline' : 'online');
  const playing = live && live.spotify;
  const gaming = live && !playing && live.game;
  const sub = playing ? 'Music live'
    : gaming ? live.game.name.slice(0, 18)
    : live ? live.statusLabel
    : person.discordId ? 'Discord' : 'GitHub';
  const badge = playing ? svg('music', 'pc-bounce')
    : gaming ? svg(live.game.icon, 'pc-bounce') : '';

  return `
    <button class="pc-chip" aria-expanded="false" aria-label="Contact ${esc(person.name)}">
      <span class="pc-chip-av">
        <img src="${esc(avatar)}" alt="" width="34" height="34">
        ${badge ? `<span class="pc-chip-badge">${badge}</span>` : `<span class="pc-dot pc-${tone}"></span>`}
      </span>
      <span class="pc-chip-t">
        <span class="pc-chip-n">${esc(person.short || person.name)}</span>
        <span class="pc-chip-s pc-${tone}-t">${esc(sub)}</span>
      </span>
    </button>`;
}

export const TEAM = {
  moses: {
    name: 'Moses', short: 'Moses', role: 'Backend & data systems engineer',
    github: 'PlayzAe',
    githubAvatar: 'https://avatars.githubusercontent.com/u/122820824?s=200&v=4',
    discordId: '590254065330552836',
  },
  timileyin: {
    name: 'Oluwatimileyin', short: 'Timileyin', role: 'Interface architect',
    github: 'adeboyetimileyin77t-prog',
    githubAvatar: 'https://avatars.githubusercontent.com/u/276239723?s=200&v=4',
    discordId: null,
  },
};

/**
 * Mount a chip + card. Polls only while the tab is visible.
 * Hover is handled in CSS; this only keeps the data fresh and wires the tap
 * fallback for touch devices, where there is no hover to rely on.
 */
export function mountPresence(el, person, { poll = 45000 } = {}) {
  if (!el) return () => {};
  let live = null;
  let timer = null;

  const setOpen = (open) => {
    el.classList.toggle('open', open);
    // `closed` suppresses the hover rule for as long as the pointer stays
    // inside, so a click-to-dismiss is not instantly undone by :hover.
    el.classList.toggle('closed', !open);
    el.querySelector('.pc-chip')?.setAttribute('aria-expanded', String(open));
  };

  const paint = () => {
    const wasOpen = el.classList.contains('open');
    el.innerHTML = personCard(person, live) + personChip(person, live);
    el.querySelector('.pc-chip').onclick = (e) => {
      e.stopPropagation();
      setOpen(!el.classList.contains('open'));
    };
    el.querySelector('.pc-chip').setAttribute('aria-expanded', String(wasOpen));
  };

  // `first` always runs. Skipping it while the tab is hidden meant a page
  // opened in a background tab kept the fallback chip forever, because the
  // initial load and the poll shared one guard. Only the poll should skip.
  const refresh = async ({ first = false } = {}) => {
    if (!person.discordId) return;
    if (!first && document.hidden) return;
    const next = await fetchPresence(person.discordId);
    if (next) { live = next; paint(); }
  };

  paint();
  refresh({ first: true });
  if (person.discordId) {
    timer = setInterval(refresh, poll);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
  // Clicking anywhere else dismisses it, the way a popover should behave.
  document.addEventListener('click', (e) => {
    if (!el.contains(e.target) && el.classList.contains('open')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.classList.contains('open')) setOpen(false);
  });
  // Leaving the chip clears the hover-suppression so hover works again next time.
  el.addEventListener('mouseleave', () => {
    if (!el.classList.contains('open')) el.classList.remove('closed');
  });
  return () => clearInterval(timer);
}
