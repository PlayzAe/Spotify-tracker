/** Synthetic records + archives covering every shape the real world throws at us. */
import { zipSync, strToU8 } from 'fflate';

/** A well-formed play. Override anything. */
export const play = (o = {}) => ({
  ts: '2024-05-01T12:00:00Z',
  platform: 'windows',
  ms_played: 180000,
  conn_country: 'GB',
  ip_addr: '1.2.3.4',
  master_metadata_track_name: 'Test Track',
  master_metadata_album_artist_name: 'Test Artist',
  master_metadata_album_album_name: 'Test Album',
  spotify_track_uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa',
  episode_name: null,
  episode_show_name: null,
  spotify_episode_uri: null,
  audiobook_title: null,
  audiobook_uri: null,
  audiobook_chapter_uri: null,
  audiobook_chapter_title: null,
  reason_start: 'trackdone',
  reason_end: 'trackdone',
  shuffle: false,
  skipped: false,
  offline: false,
  offline_timestamp: null,
  incognito_mode: false,
  ...o,
});

export const podcast = (o = {}) => play({
  master_metadata_track_name: null,
  master_metadata_album_artist_name: null,
  master_metadata_album_album_name: null,
  spotify_track_uri: null,
  episode_name: 'Episode 1',
  episode_show_name: 'A Show',
  spotify_episode_uri: 'spotify:episode:bbbb',
  ...o,
});

export const audiobook = (o = {}) => play({
  master_metadata_track_name: null,
  master_metadata_album_artist_name: null,
  spotify_track_uri: null,
  audiobook_title: 'A Book',
  audiobook_uri: 'spotify:show:cccc',
  audiobook_chapter_title: 'Chapter 3',
  ...o,
});

/** Local file: has a name but no URI. */
export const localFile = (o = {}) => play({ spotify_track_uri: null, ...o });

const AUDIO = 'my_spotify_data/Spotify Extended Streaming History/Streaming_History_Audio_2024.json';

/** A realistic zip: nested paths, a ReadMe, a video file we must ignore. */
export function makeZip(records, opts = {}) {
  const files = {};
  const root = opts.root ?? 'my_spotify_data/Spotify Extended Streaming History/';
  if (opts.readme !== false) files[`${root}ReadMeFirst_ExtendedStreamingHistory.pdf`] = strToU8('%PDF-1.4 fake');
  if (records) files[`${root}Streaming_History_Audio_2024.json`] = strToU8(JSON.stringify(records));
  if (opts.second) files[`${root}Streaming_History_Audio_2024_1.json`] = strToU8(JSON.stringify(opts.second));
  if (opts.video !== false) files[`${root}Streaming_History_Video_2024.json`] = strToU8(JSON.stringify([play()]));
  if (opts.corrupt) files[`${root}Streaming_History_Audio_2025.json`] = strToU8('{ this is not json');
  if (opts.extra) Object.assign(files, opts.extra);
  return zipSync(files).buffer;
}

/** The wrong download: "Account data" instead of "Extended streaming history". */
export function makeAccountDataZip() {
  return zipSync({
    'my_spotify_data/Playlist1.json': strToU8('[]'),
    'my_spotify_data/YourLibrary.json': strToU8('{}'),
    'my_spotify_data/SearchQueries.json': strToU8('[]'),
    'my_spotify_data/Userdata.json': strToU8('{}'),
  }).buffer;
}

export function makeReadmeOnlyZip() {
  return zipSync({
    'my_spotify_data/ReadMeFirst_ExtendedStreamingHistory.pdf': strToU8('%PDF-1.4 fake'),
  }).buffer;
}

export const notAZip = () => strToU8('this is a plain text file, not an archive').buffer;

export const file = (name, buffer) => ({ name, buffer });
export const jsonFile = (name, records) => ({ name, buffer: strToU8(JSON.stringify(records)).buffer });
