import { emit, AudioEventTypes } from "./events.js";

export type AudioCategory = "playlist" | "ambience" | "sfx";

// Volume settings for all audio categories
const volumeLevels = {
  playlist: 1.0,
  ambience: 1.0,
  sfx: 1.0,
};

// Get volume for a category
export function getVolume(category: AudioCategory): number {
  return volumeLevels[category];
}

// Set volume for a category and emit change event
export function setVolume(category: AudioCategory, volume: number): void {
  if (volume < 0 || volume > 1) return;

  volumeLevels[category] = volume;

  // Emit volume change event

  emit(AudioEventTypes.VOLUME_CHANGE, { category, volume });
}
