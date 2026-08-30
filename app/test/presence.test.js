import { describe, it, expect } from 'vitest';
import {
  discordAvatarUrl, decorationUrl, emojiUrl, guildTagUrl, statusInfo,
  trackProgress, mmss, devicesOf, readPresence, personCard, personChip, TEAM, ACTIVITY,
} from '../src/ui/presence.js';

/* The exact payload shape Lanyard returns, taken from a live response. */
const PAYLOAD = {
  success: true,
  data: {
    discord_user: {
      avatar: 'a_0af6409b7541f33d012d2257f5f44efc',
      avatar_decoration_data: { asset: 'a_a19b7e105ab06eb1f366a3db6d5651fa' },
      discriminator: '0',
      display_name: '! Moses',
      global_name: '! Moses',
      id: '590254065330552836',
      primary_guild: {
        badge: '5e362696fc3bf5afe297c812fc9c60cb',
        identity_enabled: true,
        identity_guild_id: '1454941182785224798',
        tag: 'ZYK',
      },
      username: 'playzae',
    },
    activities: [
      { id: 'custom', name: 'Custom Status', type: 4,
        state: 'I larp as someone that can code when I cannot',
        emoji: { animated: true, id: '1517931475448631446', name: 'YaYYY' } },
      { id: 'spotify:1', name: 'Spotify', type: 2, details: "Can't Play No Playa", state: 'ISVVC' },
    ],
    discord_status: 'dnd',
    active_on_discord_desktop: true,
    active_on_discord_mobile: false,
    active_on_discord_web: false,
    listening_to_spotify: true,
    spotify: {
      album: 'North Mass Maniac',
      album_art_url: 'https://i.scdn.co/image/ab67616d0000b27348d87da5b552181dbbc8c90c',
      artist: 'ISVVC',
      song: "Can't Play No Playa",
      timestamps: { start: 1788053102329, end: 1788053255232 },
      track_id: '6mVHYR8pSmn5uguc5g9c3n',
    },
  },
};

describe('discord CDN urls', () => {
  it('asks for a gif when the avatar is animated', () => {
    // Animated hashes start with a_ and serve a still frame as .png.
    expect(discordAvatarUrl('1', 'a_abc')).toContain('.gif');
    expect(discordAvatarUrl('1', 'abc')).toContain('.png');
  });

  it('returns null rather than a broken url when data is missing', () => {
    expect(discordAvatarUrl(null, 'abc')).toBeNull();
    expect(discordAvatarUrl('1', null)).toBeNull();
    expect(decorationUrl(null)).toBeNull();
    expect(emojiUrl(null)).toBeNull();
    expect(emojiUrl({})).toBeNull();
    expect(guildTagUrl(null)).toBeNull();
    expect(guildTagUrl({ tag: 'X' })).toBeNull();
  });

  it('builds decoration, emoji and guild-tag urls on the right hosts', () => {
    for (const u of [
      decorationUrl('a_deco'), emojiUrl({ id: '9', animated: true }),
      guildTagUrl({ identity_guild_id: '5', badge: 'b' }), discordAvatarUrl('1', 'abc'),
    ]) {
      expect(new URL(u).origin).toBe('https://cdn.discordapp.com');
    }
    expect(emojiUrl({ id: '9', animated: true })).toContain('.gif');
    expect(emojiUrl({ id: '9', animated: false })).toContain('.png');
  });
});

describe('status', () => {
  it('maps each discord status to a label and tone', () => {
    expect(statusInfo('online').label).toBe('Online');
    expect(statusInfo('dnd').label).toBe('Do not disturb');
    expect(statusInfo('idle').tone).toBe('idle');
  });

  it('falls back to offline for anything unexpected', () => {
    expect(statusInfo('invisible').tone).toBe('offline');
    expect(statusInfo(undefined).tone).toBe('offline');
  });
});

describe('devices', () => {
  it('lists only the devices actually signed in', () => {
    expect(devicesOf({ active_on_discord_desktop: true })).toEqual(['Desktop']);
    expect(devicesOf({ active_on_discord_desktop: true, active_on_discord_mobile: true }))
      .toEqual(['Desktop', 'Mobile']);
    expect(devicesOf({})).toEqual([]);
  });
});

describe('track progress', () => {
  it('reports the fraction elapsed', () => {
    const p = trackProgress({ start: 1000, end: 3000 }, 2000);
    expect(p.ratio).toBe(0.5);
    expect(p.total).toBe(2000);
  });

  it('clamps before the start and after the end', () => {
    expect(trackProgress({ start: 1000, end: 3000 }, 0).ratio).toBe(0);
    expect(trackProgress({ start: 1000, end: 3000 }, 99999).ratio).toBe(1);
  });

  it('returns null for missing or nonsensical timestamps', () => {
    expect(trackProgress(null)).toBeNull();
    expect(trackProgress({})).toBeNull();
    expect(trackProgress({ start: 5000, end: 1000 })).toBeNull();
    expect(trackProgress({ start: 100, end: 100 })).toBeNull();
  });

  it('formats as m:ss with a padded seconds field', () => {
    expect(mmss(0)).toBe('0:00');
    expect(mmss(9000)).toBe('0:09');
    expect(mmss(65000)).toBe('1:05');
    expect(mmss(-500)).toBe('0:00');
  });
});

describe('reading the payload', () => {
  const live = readPresence(PAYLOAD);

  it('prefers the display name over the raw username', () => {
    expect(live.name).toBe('! Moses');
    expect(live.username).toBe('playzae');
  });

  it('picks up status, devices and the guild tag', () => {
    expect(live.tone).toBe('dnd');
    expect(live.statusLabel).toBe('Do not disturb');
    expect(live.devices).toEqual(['Desktop']);
    expect(live.guildTag.tag).toBe('ZYK');
    expect(live.guildTag.icon).toContain('guild-tag-badges');
  });

  it('picks up the custom status and its animated emoji', () => {
    expect(live.custom.text).toBe('I larp as someone that can code when I cannot');
    expect(live.custom.emoji).toContain('.gif');
  });

  it('picks up the avatar decoration', () => {
    expect(live.decoration).toContain('avatar-decoration-presets');
  });

  it('reads the now-playing track', () => {
    expect(live.spotify.song).toBe("Can't Play No Playa");
    expect(live.spotify.album).toBe('North Mass Maniac');
    expect(live.spotify.url).toBe('https://open.spotify.com/track/6mVHYR8pSmn5uguc5g9c3n');
  });

  it('splits multiple artists on the semicolon Spotify uses', () => {
    const two = structuredClone(PAYLOAD);
    two.data.spotify.artist = 'Jazz Playaz; Mackjunt.';
    expect(readPresence(two).spotify.artist).toBe('Jazz Playaz, Mackjunt.');
  });

  it('reports no spotify when they are not listening', () => {
    const off = structuredClone(PAYLOAD);
    off.data.listening_to_spotify = false;
    expect(readPresence(off).spotify).toBeNull();
  });

  it('picks up a game instead when one is running', () => {
    const g = structuredClone(PAYLOAD);
    g.data.listening_to_spotify = false; delete g.data.spotify;
    g.data.activities = [{ type: 0, name: 'VALORANT', details: 'Competitive', state: 'In queue' }];
    const r = readPresence(g);
    expect(r.game.name).toBe('VALORANT');
    expect(r.game.verb).toBe('Playing');
    expect(r.game.icon).toBe('game');
  });

  it('knows every activity type it claims to handle', () => {
    for (const t of [0, 1, 2, 3, 5]) {
      expect(ACTIVITY[t].verb.length).toBeGreaterThan(0);
      expect(ACTIVITY[t].icon.length).toBeGreaterThan(0);
    }
  });

  it('returns null on a failed or malformed response instead of throwing', () => {
    for (const bad of [null, undefined, {}, { success: false }, { success: true }, 'nope', 42]) {
      expect(() => readPresence(bad)).not.toThrow();
      expect(readPresence(bad)).toBeNull();
    }
  });

  it('survives a payload with no activities at all', () => {
    const bare = { success: true, data: { discord_user: { id: '1', username: 'x' }, discord_status: 'online' } };
    const r = readPresence(bare);
    expect(r.custom).toBeNull();
    expect(r.game).toBeNull();
    expect(r.spotify).toBeNull();
    expect(r.devices).toEqual([]);
  });
});

describe('rendering', () => {
  const live = readPresence(PAYLOAD);

  it('shows the now-playing track and a spinning disc', () => {
    const html = personCard(TEAM.moses, live);
    expect(html).toContain("Can't Play No Playa");
    expect(html).toContain('by ISVVC');
    expect(html).toContain('pc-disc');
    expect(html).toContain('Listening to Spotify');
  });

  it('shows the custom status, guild tag and decoration', () => {
    const html = personCard(TEAM.moses, live);
    expect(html).toContain('larp as someone');
    expect(html).toContain('ZYK');
    expect(html).toContain('pc-deco');
  });

  it('shows a GitHub-only teammate as active, not greyed out', () => {
    // "offline" on a person who simply has no Discord reads as "gone".
    const html = personCard(TEAM.timileyin, null);
    expect(html).toContain('pc-online');
    expect(html).not.toContain('pc-offline');
    expect(html).toContain('Active on GitHub');
    expect(html).toContain('adeboyetimileyin77t-prog');
  });

  it('offers Discord for one and GitHub for the other', () => {
    expect(personCard(TEAM.moses, live)).toContain('discord.com/users/590254065330552836');
    expect(personCard(TEAM.timileyin, null)).not.toContain('discord.com/users');
  });

  it('chip shows Music live while listening, and a bouncing badge', () => {
    const chip = personChip(TEAM.moses, live);
    expect(chip).toContain('Music live');
    expect(chip).toContain('pc-bounce');
  });

  it('chip falls back cleanly with no live data', () => {
    expect(personChip(TEAM.moses, null)).toContain('Discord');
    expect(personChip(TEAM.timileyin, null)).toContain('GitHub');
  });

  it('neutralises hostile values from the API', () => {
    // A display name or track title is attacker-influenced in principle, so
    // the real property is that nothing injected can become markup. The text
    // "onerror=" surviving as inert characters is fine; a live <img> is not.
    const evil = structuredClone(PAYLOAD);
    evil.data.discord_user.global_name = '<script>alert(1)</script>';
    evil.data.spotify.song = '"><img src=x onerror=alert(1)>';
    evil.data.spotify.album = "' onmouseover='alert(1)";
    const html = personCard(TEAM.moses, readPresence(evil));

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x');
    // The quote that would break out of an attribute must be encoded.
    expect(html).toContain('&quot;&gt;&lt;img');
    // Every attribute in the output is double-quoted, so an injected single
    // quote cannot escape one either.
    expect(html).not.toMatch(/<[a-z]+[^>]*=\s*'[^']*'/i);
  });

  it('every outbound link opens safely in a new tab', () => {
    const html = personCard(TEAM.moses, live);
    const anchors = html.match(/<a\b[^>]*>/g) || [];
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      if (!a.includes('href=')) continue;
      expect(a).toContain('rel="noopener noreferrer"');
      expect(a).toContain('target="_blank"');
    }
  });

  it('never renders an API key — the read endpoint is public', () => {
    const html = personCard(TEAM.moses, live) + personChip(TEAM.moses, live);
    expect(html).not.toMatch(/lnyd_/);
    expect(html).not.toMatch(/api[-_]?key/i);
  });
});
