import { Howl } from 'howler';
import { AudioFile, AudioCollection, isAudioFile, AudioMacro } from '../../types/AudioItem.js';
import mitt from 'mitt';
import { QueryClient } from '@tanstack/react-query';
import { collectionKeys } from '../../api/collections/useCollectionQueries.js';
type AudioCategory = 'playlist' | 'ambience' | 'sfx';

// Define event types for type safety
export enum AudioEventTypes {
  // Generic events
  VOLUME_CHANGE = 'volume-change',
  
  // Playlist events
  PLAYLIST_CHANGE = 'playlist-change',
  PLAYLIST_TRACK_CHANGE = 'playlist-track-change',
  PLAYLIST_STATE_CHANGE = 'playlist-state-change',
  
  // Ambience events
  AMBIENCE_COLLECTION_CHANGE = 'ambience-collection-change',
  AMBIENCE_FILE_CHANGE = 'ambience-file-change',
  
  // SFX events
  SFX_FILE_CHANGE = 'sfx-file-change',
  SFX_MACRO_CHANGE = 'sfx-macro-change'
}

export class AudioService {
  private static instance: AudioService;
  private events = (mitt as any)();
  private queryClient: QueryClient | null = null;
  
  // Base path for audio files
  private baseAudioPath: string = "http://localhost:3000/audio";

  private currentPlaylist: {
    collectionId: number;
    currentIndex: number;
    howl: Howl | null;
    playing: boolean;
  } = {
      collectionId: 0,
      currentIndex: 0,
      howl: null,
      playing: false,
    };

  private currentAmbienceCollection: {
    collectionId: number;
  } | null = null;

  private currentAmbientFiles: Map<
    number, 
    {
      fileId: number;
      howl: Howl;
      volume: number;
    }
  > = new Map();
   
  private currentFiles: Map<number, 
    {
      fileId: number
      howl: Howl,
      volume: number,
    }> = new Map();

  private currentMacros: Map<
    number,
    {
      volume: number;
      fileIds: number[];
      timeoutIds: NodeJS.Timeout[];
      howls: Howl[];
    }
  > = new Map();
  
  // Master volume levels
  private volumes = {
    playlist: 1.0,
    ambience: 1.0,
    sfx: 1.0,
  };

  // Get singleton instance
  static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }
  
  // Set the QueryClient for accessing React Query cache
  setQueryClient(queryClient: QueryClient): void {
    this.queryClient = queryClient;
  }

  // Methods to access data from React Query cache
  private getCollectionFromCache(type: 'playlist' | 'sfx' | 'ambience' | 'macro', id: number): AudioCollection | AudioMacro | undefined {
    if (!this.queryClient) return undefined;
    
    // First try to get the collection directly
    const collection = this.queryClient.getQueryData(collectionKeys.collection(type, id));
    if (collection) return collection as AudioCollection;
    
    // If not found, try to get it from the type collection
    const typeCollection = this.queryClient.getQueryData(collectionKeys.type(type)) as AudioCollection;
    if (typeCollection) {
      // Find the collection in the items array
      return typeCollection.items?.find((item: any) => item.id === id) as AudioCollection;
    }
    
    return undefined;
  }

  // Set the base audio path
  setBaseAudioPath(path: string): void {
    this.baseAudioPath = path;
  }

  // Get the base audio path
  getBaseAudioPath(): string {
    return this.baseAudioPath;
  }

  // Resolve a relative path to a full path
  private resolveAudioPath(relativePath: string | undefined | null): string {
    if (!relativePath) return "";

    // If it's a URL or already an absolute path, return as is
    if (
      relativePath.startsWith("http://") ||
      relativePath.startsWith("https://") ||
      relativePath.startsWith("/")
    ) {
      return relativePath;
    }

    // Join the base path with the relative path
    return `${this.baseAudioPath}/${relativePath}`;
  }

  // Event handling methods
  on(event: AudioEventTypes, listener: (...args: any[]) => void): void {
    this.events.on(event, listener);
  }

  off(event: AudioEventTypes, listener: (...args: any[]) => void): void {
    this.events.off(event, listener);
  }

  private emit(event: AudioEventTypes, ...args: any[]): void {
    this.events.emit(event, ...args);
  }

  // BASIC AUDIO METHODS
  playFile(file: AudioFile): void {
    const howl = new Howl({
      src: [file.fileUrl || this.resolveAudioPath(file.filePath) || ""],
      volume: this.volumes.sfx * (file.volume || 1),
      onend: () => {
        this.currentFiles.delete(file.id);
        this.emit(AudioEventTypes.SFX_FILE_CHANGE, Array.from(this.currentFiles.values()).map(({ fileId }) => fileId));
      }
    });

    this.currentFiles.set(file.id, {howl, volume: this.volumes.sfx * (file.volume || 1), fileId: file.id}); 

    howl.play();
    this.emit(AudioEventTypes.SFX_FILE_CHANGE, Array.from(this.currentFiles.values()).map(({ fileId }) => fileId));
  }

  stopFile(id: number): void {
    const howl = this.currentFiles.get(id)?.howl;
    if (howl) {
      howl.stop();
      howl.unload();
      this.currentFiles.delete(id);
      this.emit(AudioEventTypes.SFX_FILE_CHANGE, Array.from(this.currentFiles.values()).map(({ fileId }) => fileId));
    }
  }

  toggleFile(file: AudioFile): boolean {
    const howl = this.currentFiles.get(file.id)?.howl;
    if (howl) {
      this.stopFile(file.id);
      return false;
    } else {
      this.playFile(file);
      return true;
    }
  }

  /* PLAYLIST METHODS
  **********************/

  playPlaylist(collectionId: number, startIndex: number = 0): void {
    this.stopPlaylist();
    const collection = this.getCollectionFromCache('playlist', collectionId);
    if (!collection || !collection.items?.length) {
      console.error(`Collection with ID ${collectionId} not found or has no items`);
      return;
    }

    this.currentPlaylist = {
      collectionId: collectionId,
      currentIndex: startIndex,
      howl: null,
      playing: true,
    };

    this.loadTrack();
    this.syncTrackPlayback();
    
    // Emit playlist change events
    this.emitPlaylistChangeEvents();
  }

  // Play track if the playing flag is set
  private syncTrackPlayback(): void {
    if (this.currentPlaylist.howl && this.currentPlaylist.playing) {
      this.currentPlaylist.howl.play();
      this.emit(AudioEventTypes.PLAYLIST_STATE_CHANGE, this.currentPlaylist.playing)
    }
  }

  private loadTrack(): void {
    const collection = this.getCollectionFromCache('playlist', this.currentPlaylist.collectionId);
    if (!collection || !collection.items?.length) return;

    const tracks = collection.items as AudioFile[];
    const track = tracks[this.currentPlaylist.currentIndex];
    if (!track) return;

    // Stop and unload any existing track
    if (this.currentPlaylist.howl) {
      this.currentPlaylist.howl.stop();
      this.currentPlaylist.howl.unload();
      this.currentPlaylist.howl = null;
    }

    const audioSrc = track.fileUrl || this.resolveAudioPath(track.filePath) || "";

    // Create new Howl for the current track
    const howl = new Howl({
      src: [audioSrc],
      volume: this.volumes.playlist,
      html5: true,
      onend: () => {
        this.nextTrack();
      },
      onload: () => {
        // When track is loaded, notify about the track change again to update duration
        this.emitTrackChangeEvent();
      },
      onloaderror: (error) => {
        console.error(`Error loading track (${audioSrc}):`, error);
        console.error(`Load error code: ${howl.state}`);
        this.nextTrack();
      },
      onplayerror: (error) => {
        console.error(`Error playing track:`, error);
        this.nextTrack();
      },
    });

    this.currentPlaylist.howl = howl;
  }

  pausePlaylist(): void {
    if (this.currentPlaylist.howl && this.currentPlaylist.playing) {
      this.currentPlaylist.howl.pause();
      this.currentPlaylist.playing = false;
      this.emit(AudioEventTypes.PLAYLIST_STATE_CHANGE, this.currentPlaylist.playing);
    }
  }

  resumePlaylist(): void {
    if (this.currentPlaylist.howl && !this.currentPlaylist.playing) {
      this.currentPlaylist.howl.play();
      this.currentPlaylist.playing = true;
      this.emit(AudioEventTypes.PLAYLIST_STATE_CHANGE, this.currentPlaylist.playing);
    }
  }

  stopPlaylist(): void {
    if (this.currentPlaylist.howl) {
      this.currentPlaylist.howl.stop();
      this.currentPlaylist.howl.unload();
      this.currentPlaylist.howl = null;
      this.currentPlaylist.playing = false;
      this.emit(AudioEventTypes.PLAYLIST_STATE_CHANGE, this.currentPlaylist.playing);
    }
  }

  nextTrack(): void {
    const collection = this.getCollectionFromCache('playlist', this.currentPlaylist.collectionId);
    if (!collection?.items?.length) return;

    // Stop current track
    if (this.currentPlaylist.howl) {
      this.currentPlaylist.howl.stop();
      this.currentPlaylist.howl.unload();
      this.currentPlaylist.howl = null;
    }

    // Advance to next track or loop
    this.currentPlaylist.currentIndex =
      (this.currentPlaylist.currentIndex + 1) %
      collection.items.length;

    this.loadTrack();
    this.syncTrackPlayback();
    
    // Emit track change event
    this.emitTrackChangeEvent();
  }

  previousTrack(): void {
    const collection = this.getCollectionFromCache('playlist', this.currentPlaylist.collectionId);

    if (!collection?.items?.length) return;
    // Stop current track
    if (this.currentPlaylist.howl) {
      this.currentPlaylist.howl.stop();
      this.currentPlaylist.howl.unload();
      this.currentPlaylist.howl = null;
    }
    // Go back to previous track or loop
    this.currentPlaylist.currentIndex =
      (this.currentPlaylist.currentIndex -
        1 +
        collection.items.length) %
      collection.items.length;

    this.loadTrack();
    this.syncTrackPlayback();
    
    // Emit track change event
    this.emitTrackChangeEvent();
  }

  // Helper method to emit consistent track change events
  private emitTrackChangeEvent(): void {
    // Fix: Send structured data instead of just the index
    this.emit(AudioEventTypes.PLAYLIST_TRACK_CHANGE, { 
      index: this.currentPlaylist.currentIndex 
    });
  }

  private emitPlaylistChangeEvents(): void {
    const collection = this.getCollectionFromCache('playlist', this.currentPlaylist.collectionId);
    if (!collection) return;
    
    // Fix: Send structured data instead of null
    this.emit(AudioEventTypes.PLAYLIST_CHANGE, {
      id: this.currentPlaylist.collectionId,
      currentIndex: this.currentPlaylist.currentIndex
    });
    
    // Also emit track change and state for listeners that rely on them
    this.emitTrackChangeEvent();
    this.emit(AudioEventTypes.PLAYLIST_STATE_CHANGE, this.currentPlaylist.playing);
  }

  // Toggle playlist or playlist track; Play, Pause or Resume based on context.
  togglePlaylist(collectionId: number, index: number = 0): boolean {
    const collection = this.getCollectionFromCache('playlist', collectionId);
    if (!collection) {
      console.error(`Collection with ID ${collectionId} not found in cache`);
      return false;
    }
    
    if (!this.currentPlaylist.collectionId || (collectionId !== this.currentPlaylist.collectionId)) {
      this.playPlaylist(collectionId, index);
      return true;
    }
    else {
      if (index !== this.currentPlaylist.currentIndex) {
        this.currentPlaylist.currentIndex = index;
        this.loadTrack();
        this.currentPlaylist.playing = true;
        this.syncTrackPlayback();
        this.emitTrackChangeEvent();
        return true;
      } 
      else if (this.currentPlaylist.playing) { 
        this.pausePlaylist();
        return false;
      } else {
        this.resumePlaylist();
        return true;
      }
    }
  }

  seek(position: number): void {
    if (this.currentPlaylist.howl) {
      this.currentPlaylist.howl.seek(position);
    }
  }

  // Getter methods for playlist state  
  getCurrentPlaylistId(): number {
    return this.currentPlaylist.collectionId;
  }

  getCurrentTrackIndex(): number {
    return this.currentPlaylist.currentIndex;
  }

  isPlaylistPlaying(): boolean {
    return this.currentPlaylist.playing;
  }

  getCurrentPlaylistPosition(): number {
    if (this.currentPlaylist.howl && this.currentPlaylist.howl.state() === 'loaded') {
      return this.currentPlaylist.howl.seek() as number;
    }
    return 0;
  }

  getDuration(): number {
    if (this.currentPlaylist.howl && this.currentPlaylist.howl.state() === 'loaded') {
      return this.currentPlaylist.howl.duration();
    }
    return 0;
  }

  /* SFX METHODS
  ********************/
  playMacro(macroId: number): void {
    const macro = this.getCollectionFromCache('macro', macroId) as AudioMacro;
    if (!macro || !macro.items) return;
    
    const timeoutIds: NodeJS.Timeout[] = [];
    const howls: Howl[] = [];
    const fileIds: number[] = [];

    macro.items.forEach(sound => {
      if (!isAudioFile(sound)) return;
      
      fileIds.push(sound.id);
      
      const howl = new Howl({
        src: [sound.fileUrl || this.resolveAudioPath(sound.filePath) || ""],
        volume: sound.volume !== undefined ? sound.volume * this.volumes.sfx : this.volumes.sfx,
      });
      
      howls.push(howl);
      
      const timeoutId = setTimeout(() => {
        howl.play();
      }, sound.delay || 0);
      
      timeoutIds.push(timeoutId);
    });

    this.currentMacros.set(macroId, { 
      volume: macro.volume || 1, 
      fileIds, 
      timeoutIds, 
      howls 
    });
    
    this.emit(AudioEventTypes.SFX_MACRO_CHANGE, Array.from(this.currentMacros.entries()).map(([id, macro]) => ({
      id,
      volume: macro.volume,
      fileIds: macro.fileIds
    })));
  }

  stopMacro(id: number): void {
    const macro = this.currentMacros.get(id);
    if (macro) {
      macro.timeoutIds.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      this.currentMacros.delete(id);
      this.emit(AudioEventTypes.SFX_MACRO_CHANGE, Array.from(this.currentMacros.entries()).map(([id, macro]) => ({
        id,
        volume: macro.volume,
        fileIds: macro.fileIds
      })));
    }
  }

  toggleMacro(macroId: number): boolean {
    if (this.currentMacros.has(macroId)) {
      this.stopMacro(macroId);
      return false;
    }
    else {
      this.playMacro(macroId);
      return true;
    }
  }

  setMacroVolume(id: number, volume: number): void {
    const macro = this.currentMacros.get(id);
    if (macro) {
      macro.howls.forEach((howl) => {
        howl.volume(this.volumes.sfx * volume);
      });
      macro.volume = volume;
      this.emit(AudioEventTypes.SFX_MACRO_CHANGE, Array.from(this.currentMacros.entries()).map(([id, macro]) => ({
        id,
        volume: macro.volume,
        fileIds: macro.fileIds
      })));
    }
  }
  
  setSfxFileVolume(id: number, volume: number): void {
    const sound = this.currentFiles.get(id);

    if (sound) { // Change current sound volume
      sound.volume = volume;
      if (sound.howl) {
        sound.howl.volume(this.volumes.sfx * volume); 
      }
       this.emit(AudioEventTypes.SFX_FILE_CHANGE, Array.from(this.currentFiles.values()).map(({ fileId }) => ({ id: fileId })));
    }
  }
  
  /* AMBIENCE METHODS
  *********************/
  activateAmbienceFile(collectionId : number, fileId : number): void {
    // Check if the collection is currently playing
    if (this.currentAmbienceCollection?.collectionId === collectionId) {
      const collection = this.getCollectionFromCache('ambience', collectionId);
      if (collection) {
        const item = collection.items?.find((item) => item.id === fileId);
        if (item && isAudioFile(item)) {
          this.playAmbienceSound(item);
        }
      }
    }
  }

  deactivateAmbienceFile(collectionId : number, fileId : number): void {
    // Check if the collection is currently playing
    if (this.currentAmbienceCollection?.collectionId === collectionId) {
      const sound = this.currentAmbientFiles.get(fileId);
      if (sound) {
        this.stopAmbienceSound(fileId);
      }
    }
  }

  // Toggle activation status of an ambience file
  // toggleAmbienceFile(collectionId : number, fileId : number): boolean {
  //   // If this sound is already active, deactivate it
  //   const collection = this.getCollectionFromCache('ambience', collectionId || 0);

  //   if (collection) {
  //     const item = collection.items?.find((item) => item.id === fileId);
  //     if (item && isAudioFile(item)) {
  //       if (item.active) {
  //         this.deactivateAmbienceFile(collectionId, fileId);
  //         return false;
  //       }
  //       else {
  //         this.activateAmbienceFile(collectionId, fileId);
  //         return true;
  //       }
  //     }
  //   }
  //   return false;
  // }

  // Internal method to actually play an ambience sound
  private playAmbienceSound(file: AudioFile): number {
    const howl = new Howl({
      src: [file.fileUrl || this.resolveAudioPath(file.filePath) || ""],
      volume: (file.volume !== undefined ? file.volume : 1) * this.volumes.ambience,
      loop: true,
    });

    this.currentAmbientFiles.set(file.id, {
      howl,
      volume: this.volumes.ambience * (file.volume || 1),
      fileId: file.id,
    });

    this.emit(AudioEventTypes.AMBIENCE_FILE_CHANGE, Array.from(this.currentAmbientFiles.values()).map(({ fileId }) => fileId));

    howl.fade(0, this.volumes.ambience * (file.volume || 1), 1000);
    howl.play();
    
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
      this.emit(AudioEventTypes.AMBIENCE_FILE_CHANGE, Array.from(this.currentAmbientFiles.values()).map(({ fileId }) => fileId));
    }

  }

  // Check if an ambience file is currently playing
  isAmbienceFilePlaying(fileId: number): boolean {
    return this.currentAmbientFiles.has(fileId);
  }

  playAmbienceCollection(collectionId: number): void {
    // First stop any currently playing ambience sounds
    this.stopAmbienceCollection();
    const collection = this.getCollectionFromCache('ambience', collectionId);
    if (!collection || !collection.items) return;
    
    this.currentAmbienceCollection = {
      collectionId: collectionId,
    };
  
    // Play all active ambience items from the collection
    collection.items.forEach(item => {
      if (isAudioFile(item) && item.active) {
        this.playAmbienceSound(item);
      }
    });
    
    // Emit event that ambience collection has changed
    this.emit(
      AudioEventTypes.AMBIENCE_COLLECTION_CHANGE, collection.id);
  }

  stopAmbienceCollection(): void {
    this.currentAmbientFiles.forEach((_, id) => {
      this.stopAmbienceSound(id);
    });

    this.currentAmbienceCollection = null;
    
    // Emit event that ambience collection has been stopped
    this.emit(AudioEventTypes.AMBIENCE_COLLECTION_CHANGE, null);
  }

  // Toggle ambience collection by ID
  toggleAmbienceCollection(collectionId: number): boolean {
    // If this collection is already playing, stop it
    if (this.currentAmbienceCollection?.collectionId === collectionId) {
      this.stopAmbienceCollection();
      return false;
    } else { 
      // Otherwise, play the new collection
      this.playAmbienceCollection(collectionId);
      return true;
    }
  }

  setAmbienceFileVolume(id: number, volume: number): void {
    if (volume < 0 || volume > 1) return;

    const sound = this.currentAmbientFiles.get(id);
    if (sound) {
      sound.howl.volume(volume * this.volumes.ambience);
      sound.volume = volume * this.volumes.ambience;
    }
  }

  // Getter methods for ambience state
  getCurrentAmbienceCollectionId(): number {
    return this.currentAmbienceCollection?.collectionId || 0;
  }

  /*  VOLUME CONTROL
   *******************/
  setVolume(category: AudioCategory, volume: number): void {
    if (volume < 0 || volume > 1) return;

    const prevMasterVolume = this.volumes[category];
    this.volumes[category] = volume;

    // Update currently playing sounds
    switch (category) {
      case "playlist":
        if (this.currentPlaylist.howl) {
          this.currentPlaylist.howl.volume(volume);
        }
        break;

      case "ambience":
        this.currentAmbientFiles.forEach((sound) => {
          // Adjust volume based on individual sound settings
          const newSoundVolume = volume * (sound.volume / prevMasterVolume);
          sound.howl.volume(newSoundVolume);
          sound.volume = newSoundVolume;
        });
        break;

      case "sfx":
        // This will affect future SFX only
        break;
    }
    
    // Emit volume change event
    this.emit(AudioEventTypes.VOLUME_CHANGE, {category, volume});
  }

  
}

export default AudioService.getInstance();