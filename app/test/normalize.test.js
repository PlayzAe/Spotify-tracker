import { describe, it, expect } from 'vitest';
import {
  basename, isAudioHistory, isVideoHistory, isAccountDataMarker, isReadme,
  isSkipped, trackKey, platformClass, PLATFORMS, classify, KIND,
  startEpochSec, MIN_PLAY_MS,
} from '../src/engine/normalize.js';
import { play, podcast, audiobook, localFile } from './fixtures.js';

describe('file matching', () => {
  it('matches nested zip entries on basename, not full path', () => {
    // The bug this guards: entries are nested two directories deep, so a
    // full-path prefix match finds ZERO files and looks like an empty export.
    const nested = 'my_spotify_data/Spotify Extended Streaming History/Streaming_History_Audio_2021.json';
    expect(isAudioHistory(nested)).toBe(true);
    expect(nested.startsWith('Streaming_History_Audio_')).toBe(false);
  });

  it('handles windows separators and deep nesting', () => {
    expect(isAudioHistory('a\\b\\Streaming_History_Audio_2020.json')).toBe(true);
    expect(isAudioHistory('a/b/c/d/e/Streaming_History_Audio_2020_1.json')).toBe(true);
    expect(basename('a\\b\\c.json')).toBe('c.json');
  });

  it('ignores video, readme and unrelated files', () => {
    expect(isAudioHistory('x/Streaming_History_Video_2024.json')).toBe(false);
    expect(isVideoHistory('x/Streaming_History_Video_2024.json')).toBe(true);
    expect(isAudioHistory('x/ReadMeFirst_ExtendedStreamingHistory.pdf')).toBe(false);
    expect(isReadme('x/ReadMeFirst_ExtendedStreamingHistory.pdf')).toBe(true);
    expect(isAudioHistory('x/Marquee.json')).toBe(false);
  });

  it('recognises Account Data files so the wrong export can be named', () => {
    for (const n of ['Playlist1.json', 'YourLibrary.json', 'SearchQueries.json',
                     'Follow.json', 'Userdata.json', 'Identity.json', 'Marquee.json']) {
      expect(isAccountDataMarker(`my_spotify_data/${n}`), n).toBe(true);
    }
    expect(isAccountDataMarker('x/Streaming_History_Audio_2024.json')).toBe(false);
  });

  it('is case-insensitive on the extension', () => {
    expect(isAudioHistory('x/Streaming_History_Audio_2024.JSON')).toBe(true);
  });
});

describe('skip derivation (DE-13)', () => {
  it('trusts an explicit skipped flag', () => {
    expect(isSkipped(play({ skipped: true, reason_end: 'trackdone' }))).toBe(true);
  });

  it('derives a skip when the raw flag is dead — the pre-2022-10 case', () => {
    // Raw field reports false for years of history. Filtering on it renders as
    // "you never skip anything" rather than as a bug.
    for (const r of ['backbtn', 'fwdbtn', 'endplay', 'unknown']) {
      expect(isSkipped(play({ skipped: false, reason_end: r })), r).toBe(true);
    }
  });

  it('does not treat a completed or interrupted play as a skip', () => {
    for (const r of ['trackdone', 'logout', 'unexpected-exit', 'trackerror', 'remote']) {
      expect(isSkipped(play({ skipped: false, reason_end: r })), r).toBe(false);
    }
  });

  it('survives a missing reason_end', () => {
    expect(isSkipped({ skipped: false })).toBe(false);
    expect(isSkipped({})).toBe(false);
  });
});

describe('track key (DE-14)', () => {
  it('merges the same recording across releases', () => {
    const a = trackKey('Lemonade', 'Internet Money');
    expect(trackKey('Lemonade (feat. NAV)', 'Internet Money')).toBe(a);
    expect(trackKey('Lemonade (feat. Gunna, Don Toliver & NAV)', 'Internet Money')).toBe(a);
  });

  it('merges case and accent variants', () => {
    expect(trackKey('HARDY BOYS 2', 'mikeeysmind')).toBe(trackKey('hardy boys 2', 'mikeeysmind'));
    expect(trackKey('Café', 'Artist')).toBe(trackKey('Cafe', 'Artist'));
  });

  it('merges remaster suffixes', () => {
    expect(trackKey('Song - 2011 Remaster', 'A')).toBe(trackKey('Song', 'A'));
    expect(trackKey('Song (2011 Remaster)', 'A')).toBe(trackKey('Song', 'A'));
  });

  it('does NOT merge a remix into the original', () => {
    // The regex published in the PRD stripped `remix`/`edit` and collapsed
    // genuinely different recordings — the last.fm over-merge failure.
    expect(trackKey('Hot (Remix) [feat. Gunna and Travis Scott]', 'Young Thug'))
      .not.toBe(trackKey('Hot (feat. Gunna)', 'Young Thug'));
    expect(trackKey('Get Lucky (Radio Edit)', 'Daft Punk'))
      .not.toBe(trackKey('Get Lucky', 'Daft Punk'));
  });

  it('does not merge different artists with the same title', () => {
    expect(trackKey('Closer', 'Monoir')).not.toBe(trackKey('Closer', 'The Chainsmokers'));
  });

  it('keeps sped-up and slowed edits separate', () => {
    expect(trackKey('hardy boys 2 - sped up', 'm')).not.toBe(trackKey('hardy boys 2', 'm'));
    expect(trackKey('knight - slowed', 'escorte')).not.toBe(trackKey('knight', 'escorte'));
  });

  it('never throws on null or empty input', () => {
    expect(() => trackKey(null, null)).not.toThrow();
    expect(() => trackKey(undefined, undefined)).not.toThrow();
    expect(trackKey('', '')).toBe('|');
  });
});

describe('platform classification', () => {
  it('collapses the two string formats Spotify has used', () => {
    const W = PLATFORMS.indexOf('Windows');
    expect(platformClass('windows')).toBe(W);
    expect(platformClass('Windows 10 (10.0.18363; x64; AppX)')).toBe(W);
    expect(platformClass('Windows 10 (10.0.19044; x64)')).toBe(W);
  });

  it('separates phone from tablet', () => {
    expect(platformClass('android')).toBe(PLATFORMS.indexOf('Android'));
    expect(platformClass('Android OS 11 API 30 (HMD Global, Nokia G10)')).toBe(PLATFORMS.indexOf('Android'));
    expect(platformClass('Android-tablet OS 10 API 29 (SAMSUNG, SM-T870)')).toBe(PLATFORMS.indexOf('Android tablet'));
  });

  it('handles web, tv, apple and unknown', () => {
    expect(platformClass('web_player windows 10;chrome 93;desktop')).toBe(PLATFORMS.indexOf('Web player'));
    expect(platformClass('Partner webos_tv lg;65uk6100pva;;')).toBe(PLATFORMS.indexOf('TV / console'));
    expect(platformClass('iOS 15.1 (iPhone12,1)')).toBe(PLATFORMS.indexOf('iOS'));
    expect(platformClass('OS X 10.15.7 [x86, 0]')).toBe(PLATFORMS.indexOf('macOS'));
    expect(platformClass(null)).toBe(PLATFORMS.indexOf('Other'));
    expect(platformClass('')).toBe(PLATFORMS.indexOf('Other'));
    expect(platformClass('something brand new')).toBe(PLATFORMS.indexOf('Other'));
  });

  it('always returns an index that fits in 3 bits', () => {
    for (const p of [null, '', 'windows', 'android', 'zzz', 'web_player x']) {
      const c = platformClass(p);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(7);
    }
  });
});

describe('record classification (DE-12)', () => {
  it('separates music, podcast, audiobook and local files', () => {
    expect(classify(play())).toBe(KIND.MUSIC);
    expect(classify(podcast())).toBe(KIND.PODCAST);
    expect(classify(audiobook())).toBe(KIND.AUDIOBOOK);
    expect(classify(localFile())).toBe(KIND.LOCAL);
  });

  it('classifies an empty record as unknown rather than throwing', () => {
    expect(classify({})).toBe(KIND.UNKNOWN);
  });

  it('treats a podcast as a podcast even if a track name is also present', () => {
    expect(classify(play({ spotify_episode_uri: 'spotify:episode:x' }))).toBe(KIND.PODCAST);
  });
});

describe('ts is the END of a stream', () => {
  it('subtracts the play duration to get the start', () => {
    // Verified on 137,153 autoplay pairs: 83.5% match the current track's
    // duration, 0.3% the previous one.
    const end = Date.parse('2024-05-01T12:03:00Z') / 1000;
    expect(startEpochSec('2024-05-01T12:03:00Z', 180000)).toBe(end - 180);
  });

  it('attributes a track finishing after midnight to the previous day', () => {
    const start = startEpochSec('2024-05-02T00:02:00Z', 300000);
    expect(new Date(start * 1000).toISOString()).toBe('2024-05-01T23:57:00.000Z');
  });

  it('handles zero and missing durations', () => {
    const t = Date.parse('2024-05-01T12:00:00Z') / 1000;
    expect(startEpochSec('2024-05-01T12:00:00Z', 0)).toBe(t);
    expect(startEpochSec('2024-05-01T12:00:00Z', undefined)).toBe(t);
    expect(startEpochSec('2024-05-01T12:00:00Z', null)).toBe(t);
  });
});

describe('counted-play threshold', () => {
  it('is Spotify\'s own 30 second rule', () => {
    expect(MIN_PLAY_MS).toBe(30000);
  });
});
