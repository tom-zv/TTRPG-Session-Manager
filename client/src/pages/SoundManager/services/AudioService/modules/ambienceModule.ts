import { Howl } from "howler";
import { getCollectionFromCache } from "../queryClient.js";
import { AudioEventTypes, emit } from "../events.js";
import { AudioFile, isAudioFile } from "../../../types/AudioItem.js";
import { resolveAudioSource } from "../utils/pathResolvers.js";
import { getVolume, setVolume } from '../volumeStore.js';

export class AmbienceModule {
  private currentAmbienceCollection: {
    collectionId: number;
  } | null = null;

  private currentAmbientFiles: Map<
    number,
    {
      howl: Howl;
      volume: number;
    }
  > = new Map();

  private fadingSounds = new Set<Howl>();

  async activateAmbienceFile(collectionId: number, file: AudioFile): Promise<void> {
    // Check if the collection is currently playing
    const collection = this.currentAmbienceCollection;
    if (collection?.collectionId === collectionId) {
      if (isAudioFile(file)) {
        await this.playAmbienceSound(file, collection);
      }
    }
  }

  deactivateAmbienceFile(collectionId: number, fileId: number): void {
    if (this.currentAmbienceCollection?.collectionId === collectionId) {
      const sound = this.currentAmbientFiles.get(fileId);
      if (sound) {
        this.stopAmbienceSound(fileId);
      }
    }
  }

  // Internal method to actually play an ambience sound
  private async playAmbienceSound(
    file: AudioFile,
    collection: { collectionId: number }
  ): Promise<number | undefined> {
    const audioSrc = await resolveAudioSource(file);
    if (collection !== this.currentAmbienceCollection || this.currentAmbientFiles.has(file.id)) return undefined;

    if (!audioSrc) {
      console.warn(
        `Could not resolve audio source for ambience file ${
          file.name || file.id
        }`
      );
      return undefined;
    }

    const howl = new Howl({
      src: [audioSrc],
      volume:
        (file.volume !== undefined ? file.volume : 1) * getVolume("ambience"),
      html5: true,
      loop: true,
    });

    this.currentAmbientFiles.set(file.id, {
      howl,
      volume: getVolume("ambience") * (file.volume || 1),
    });

    emit(AudioEventTypes.AMBIENCE_FILE_CHANGE, [
      ...this.currentAmbientFiles.keys(),
    ]);

    howl.play();
    howl.fade(0, getVolume("ambience") * (file.volume || 1), 2000);

    return file.id;
  }

  // Internal method to actually stop an ambience sound
  private stopAmbienceSound(id: number): void {
    const sound = this.currentAmbientFiles.get(id);
    if (sound) {
      this.currentAmbientFiles.delete(id);

      this.fadingSounds.add(sound.howl);
      sound.howl.fade(sound.volume, 0, 1000);
      sound.howl.once("fade", () => {
        if (!this.fadingSounds.delete(sound.howl)) return;
        sound.howl.stop();
        sound.howl.unload();
      });
      emit(AudioEventTypes.AMBIENCE_FILE_CHANGE, [
        ...this.currentAmbientFiles.keys(),
      ]);
    }
  }

  // Check if an ambience file is currently playing
  isAmbienceFilePlaying(fileId: number): boolean {
    return this.currentAmbientFiles.has(fileId);
  }

  async playAmbienceCollection(collectionId: number): Promise<void> {
    // First stop any currently playing ambience sounds
    this.stopAmbienceCollection();
    const cachedCollection = getCollectionFromCache("ambience", collectionId);
    if (!cachedCollection || !cachedCollection.items) return;

    const operation = {
      collectionId: collectionId,
    };
    this.currentAmbienceCollection = operation;

    // Play all active ambience items from the collection
    for (const item of cachedCollection.items) {
      if (this.currentAmbienceCollection !== operation) return;
      if (isAudioFile(item) && item.active) {
        await this.playAmbienceSound(item, operation);
      }
    }

    // Emit event that ambience collection has changed
    if (this.currentAmbienceCollection === operation) {
      emit(AudioEventTypes.AMBIENCE_COLLECTION_CHANGE, operation.collectionId);
    }
  }

  stopAmbienceCollection(): void {
    this.currentAmbientFiles.forEach((_, id) => {
      this.stopAmbienceSound(id);
    });

    this.currentAmbienceCollection = null;

    // Emit event that ambience collection has been stopped
    emit(AudioEventTypes.AMBIENCE_COLLECTION_CHANGE, null);
  }

  /** The GM session ended: stop and unload every sound at once (no fade) and forget the collection. */
  reset(): void {
    for (const howl of this.fadingSounds) {
      this.fadingSounds.delete(howl);
      howl.stop();
      howl.unload();
    }
    this.currentAmbientFiles.forEach(({ howl }) => {
      howl.stop();
      howl.unload();
    });
    this.currentAmbientFiles.clear();
    this.currentAmbienceCollection = null;
    emit(AudioEventTypes.AMBIENCE_FILE_CHANGE, []);
    emit(AudioEventTypes.AMBIENCE_COLLECTION_CHANGE, null);
  }

  // Toggle ambience collection by ID
  async toggleCollection(collectionId: number): Promise<boolean> {
    if (!collectionId) return false;

    // If this collection is already playing, stop it
    if (this.currentAmbienceCollection?.collectionId === collectionId) {
      this.stopAmbienceCollection();
      return false;
    } else {
      // Otherwise, play the new collection
      await this.playAmbienceCollection(collectionId);
      return true;
    }
  }

  setFileVolume(id: number, volume: number): void {
    if (volume < 0 || volume > 1) return;

    const sound = this.currentAmbientFiles.get(id);
    if (sound) {
      sound.howl.volume(volume * getVolume("ambience"));
      sound.volume = volume * getVolume("ambience");
    }
  }

  setMasterVolume(volume: number): void {
    if (volume < 0 || volume > 1) return;

    const prevMasterVolume = getVolume("ambience");
    setVolume("ambience", volume);

    // Update all currently playing ambience sounds
    this.currentAmbientFiles.forEach((sound) => {
      // Adjust volume based on individual sound settings
      const newSoundVolume = volume * (sound.volume / prevMasterVolume);
      sound.howl.volume(newSoundVolume);
      sound.volume = newSoundVolume;
    });
  }

  // Getter methods
  get currentCollectionId(): number | undefined {
    return this.currentAmbienceCollection?.collectionId;
  }

  get playingFileIds(): number[] {
    return Array.from(this.currentAmbientFiles.keys());
  }

  get volume(): number {
    return getVolume("ambience");
  }
}