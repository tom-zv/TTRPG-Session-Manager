// services/audio/events.ts

import mitt, { Emitter } from "mitt";

/** All the event names your app will use */
export enum AudioEventTypes {
  // Generic
  VOLUME_CHANGE = "volume-change",

  // Playlist
  PLAYLIST_CHANGE = "playlist-change",
  PLAYLIST_TRACK_CHANGE = "playlist-track-change",
  PLAYLIST_STATE_CHANGE = "playlist-state-change",

  // Ambience
  AMBIENCE_COLLECTION_CHANGE = "ambience-collection-change",
  AMBIENCE_FILE_CHANGE = "ambience-file-change",

  // SFX
  SFX_FILE_CHANGE = "sfx-file-change",
  SFX_MACRO_CHANGE = "sfx-macro-change",
}

export const emitter: Emitter<any> = (mitt as any)();

/** Subscribe to an event */
export function on(
  event: AudioEventTypes,
  handler: (payload?: any) => void
): void {
  emitter.on(event, handler);
}

/** Unsubscribe from an event */
export function off(
  event: AudioEventTypes,
  handler: (payload?: any) => void
): void {
  emitter.off(event, handler);
}

/** Emit an event with an arbitrary payload */
export function emit(
  event: AudioEventTypes,
  payload?: any
): void {
  emitter.emit(event, payload);
}
