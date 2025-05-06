import { Howl } from "howler";
import { getCollectionFromCache } from "../queryClient.js";
import { AudioEventTypes, emit } from "../events.js";
import { AudioFile, isAudioFile } from "../../../types/AudioItem.js";
import { resolveAudioPath, resolveAudioUrl } from "../utils/pathResolvers.js";
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

  async activateAmbienceFile(collectionId: number, fileId: number): Promise<void> {
    // Check if the collection is currently playing
    if (this.currentAmbienceCollection?.collectionId === collectionId) {
      const collection = getCollectionFromCache('ambience', collectionId);
      if (collection) {
        const item = collection.items?.find((item) => item.id === fileId);
        if (item && isAudioFile(item)) {
          await this.playAmbienceSound(item);
        }
      }
    }
  }

  deactivateAmbienceFile(collectionId: number, fileId: number): void {
    // Check if the collection is currently playing
    if (this.currentAmbienceCollection?.collectionId === collectionId) {
      const sound = this.currentAmbientFiles.get(fileId);
      if (sound) {
        this.stopAmbienceSound(fileId);
      }
    }
  }

  // Internal method to actually play an ambience sound
  private async playAmbienceSound(file: AudioFile): Promise<number | undefined> {
    let audioSrc = resolveAudioPath(file.filePath) || await resolveAudioUrl(file.fileUrl) || "";

    if (!audioSrc) {
      console.warn(`Could not resolve audio source for ambience file ${file.name || file.id}`);
      return undefined;
    }

    const howl = new Howl({
      src: [audioSrc],
      volume: (file.volume !== undefined ? file.volume : 1) * getVolume('ambience'),
      html5: file.fileUrl ? true : false,
      loop: true,
    });

    this.currentAmbientFiles.set(file.id, {
      howl,
      volume: getVolume('ambience') * (file.volume || 1),
    });

    emit(AudioEventTypes.AMBIENCE_FILE_CHANGE, [...this.currentAmbientFiles.keys()])
    

    howl.play();
    howl.fade(0, getVolume('ambience') * (file.volume || 1), 2000);
    
    return file.id;
  }

  // Internal method to actually stop an ambience sound
  private stopAmbienceSound(id: number): void { 
    const sound = this.currentAmbientFiles.get(id);
    if (sound) {
      this.currentAmbientFiles.delete(id);

      sound.howl.fade(sound.volume, 0, 1000);
      sound.howl.once("fade", () => {
        sound.howl.stop();
        sound.howl.unload();
      });
      emit(AudioEventTypes.AMBIENCE_FILE_CHANGE, [...this.currentAmbientFiles.keys()]);
    }
  }

  // Check if an ambience file is currently playing
  isAmbienceFilePlaying(fileId: number): boolean {
    return this.currentAmbientFiles.has(fileId);
  }

  async playAmbienceCollection(collectionId: number): Promise<void> {
    // First stop any currently playing ambience sounds
    this.stopAmbienceCollection();
    const collection = getCollectionFromCache('ambience', collectionId);
    if (!collection || !collection.items) return;
    
    this.currentAmbienceCollection = {
      collectionId: collectionId,
    };
  
    // Play all active ambience items from the collection
    for (const item of collection.items) {
      if (isAudioFile(item) && item.active) {
        await this.playAmbienceSound(item);
      }
    }
    
    // Emit event that ambience collection has changed
    emit(AudioEventTypes.AMBIENCE_COLLECTION_CHANGE, collection.id);
  }

  stopAmbienceCollection(): void {
    this.currentAmbientFiles.forEach((_, id) => {
      this.stopAmbienceSound(id);
    });

    this.currentAmbienceCollection = null;
    
    // Emit event that ambience collection has been stopped
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
      sound.howl.volume(volume * getVolume('ambience'));
      sound.volume = volume * getVolume('ambience');
    }
  }

  setMasterVolume(volume: number): void {
    if (volume < 0 || volume > 1) return;

    const prevMasterVolume = getVolume('ambience');
    setVolume('ambience', volume);

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
    return getVolume('ambience');
  }
}