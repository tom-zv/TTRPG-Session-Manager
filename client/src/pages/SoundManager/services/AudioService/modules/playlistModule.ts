import { Howl, HowlOptions } from "howler";
import { getCollectionFromCache } from "../queryClient.js";
import { AudioEventTypes, emit } from "../events.js";
import { AudioFile } from "../../../types/AudioItem.js";
import { resolveAudioPath, resolveAudioUrl } from "../utils/pathResolvers.js";
import { getVolume, setVolume } from "../volumeStore.js";

export class PlaylistModule {
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

  async playPlaylist(
    collectionId: number,
    startIndex: number = 0
  ): Promise<void> {
    this.stopPlaylist();
    const collection = getCollectionFromCache("playlist", collectionId);
    if (!collection?.items?.length) {
      console.error(`No playlist ${collectionId}`);
      return;
    }

    this.currentPlaylist = {
      collectionId: collectionId,
      currentIndex: startIndex,
      howl: null,
      playing: true,
    };

    await this.loadTrack();
    this.syncTrackPlayback();

    // Emit playlist change events
    this.emitPlaylistChangeEvents();
  }

  // Play track if the playing flag is set
  private syncTrackPlayback(): void {
    if (this.currentPlaylist.howl && this.currentPlaylist.playing) {
      this.currentPlaylist.howl.play();
      emit(AudioEventTypes.PLAYLIST_STATE_CHANGE, this.currentPlaylist.playing);
    }
  }

  private async loadTrack(): Promise<void> {
    const collection = getCollectionFromCache(
      "playlist",
      this.currentPlaylist.collectionId
    );
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

    // Resolve audio source, handling special URLs like YouTube
    const audioSrc = resolveAudioPath(track.path) || await resolveAudioUrl(track.url) || "";

    if (!audioSrc) {
      console.error(`Could not resolve audio source for track: ${track.name || track.id} (URL: ${track.url}, Path: ${track.path}). Skipping.`);
      
      setTimeout(() => this.nextTrack(), 100);
      return;
    }

    // Define Howl options
    const howlOptions: HowlOptions = {
      src: [audioSrc],
      volume: getVolume("playlist"),
      html5: !!track.url, 
      onend: () => {
        this.nextTrack();
      },
      onload: () => {
        // When track is loaded, notify about the track change again to update duration
        this.emitTrackChangeEvent();
      },
      onloaderror: (soundId, error) => { 
        console.error(`Error loading track (${audioSrc}): ID ${soundId}, Error:`, error);
        if (newHowl) { 
          console.error(`Load error code from howl.state(): ${newHowl.state()}`);
        }
        // Add delay before cycling to next track on load error
        setTimeout(() => {
          // Check if we're still playing before moving to next track
          if (this.currentPlaylist.playing) {
            this.nextTrack();
          }
        }, 1500);
      },
      onplayerror: (soundId, error) => { 
        console.error(`Error playing track (${audioSrc}): ID ${soundId}, Error:`, error);
        if (newHowl) { 
          console.error(`Play error code from howl.state(): ${newHowl.state()}`);
        }
        // Add delay before cycling to next track on play error
        setTimeout(() => {
          // Check if we're still playing before moving to next track
          if (this.currentPlaylist.playing) {
            this.nextTrack();
          }
        }, 1500);
      },
    };

    // Conditionally add format for YouTube URLs, as they often lack extensions
    if (track.url && (track.url.includes("youtube.com") || track.url.includes("youtu.be"))) {
      howlOptions.format = ['m4a', 'mp4'];
    }

    // Create new Howl for the current track
    const newHowl = new Howl(howlOptions);
    this.currentPlaylist.howl = newHowl;
  }

  pausePlaylist(): void {
    if (this.currentPlaylist.howl && this.currentPlaylist.playing) {
      this.currentPlaylist.howl.pause();
      this.currentPlaylist.playing = false;
      emit(AudioEventTypes.PLAYLIST_STATE_CHANGE, this.currentPlaylist.playing);
    }
  }

  resumePlaylist(): void {
    if (this.currentPlaylist.howl && !this.currentPlaylist.playing) {
      this.currentPlaylist.howl.play();
      this.currentPlaylist.playing = true;
      emit(AudioEventTypes.PLAYLIST_STATE_CHANGE, this.currentPlaylist.playing);
    }
  }

  stopPlaylist(): void {
    if (this.currentPlaylist.howl) {
      this.currentPlaylist.howl.stop();
      this.currentPlaylist.howl.unload();
      this.currentPlaylist.howl = null;
      this.currentPlaylist.playing = false;
      emit(AudioEventTypes.PLAYLIST_STATE_CHANGE, this.currentPlaylist.playing);
    }
  }

  async nextTrack(): Promise<void> {
    const collection = getCollectionFromCache(
      "playlist",
      this.currentPlaylist.collectionId
    );
    if (!collection?.items?.length) return;

    // Stop current track
    if (this.currentPlaylist.howl) {
      this.currentPlaylist.howl.stop();
      this.currentPlaylist.howl.unload();
      this.currentPlaylist.howl = null;
    }

    // Advance to next track or loop
    this.currentPlaylist.currentIndex =
      (this.currentPlaylist.currentIndex + 1) % collection.items.length;

    await this.loadTrack();
    this.syncTrackPlayback();

    // Emit track change event
    this.emitTrackChangeEvent();
  }

  async previousTrack(): Promise<void> {
    const collection = getCollectionFromCache(
      "playlist",
      this.currentPlaylist.collectionId
    );

    if (!collection?.items?.length) return;
    // Stop current track
    if (this.currentPlaylist.howl) {
      this.currentPlaylist.howl.stop();
      this.currentPlaylist.howl.unload();
      this.currentPlaylist.howl = null;
    }
    // Go back to previous track or loop
    this.currentPlaylist.currentIndex =
      (this.currentPlaylist.currentIndex - 1 + collection.items.length) %
      collection.items.length;

    await this.loadTrack();
    this.syncTrackPlayback();

    // Emit track change event
    this.emitTrackChangeEvent();
  }

  // Helper method to emit consistent track change events
  private emitTrackChangeEvent(): void {
    emit(AudioEventTypes.PLAYLIST_TRACK_CHANGE, {
      index: this.currentPlaylist.currentIndex,
    });
  }

  private emitPlaylistChangeEvents(): void {
    const collection = getCollectionFromCache(
      "playlist",
      this.currentPlaylist.collectionId
    );
    if (!collection) return;

    emit(AudioEventTypes.PLAYLIST_CHANGE, {
      id: this.currentPlaylist.collectionId,
      currentIndex: this.currentPlaylist.currentIndex,
    });

    this.emitTrackChangeEvent();
    emit(AudioEventTypes.PLAYLIST_STATE_CHANGE, this.currentPlaylist.playing);
  }

  // Toggle playlist or playlist track; Play, Pause or Resume based on context.
  async togglePlaylist(
    collectionId: number,
    index: number = 0
  ): Promise<boolean> {
    const collection = getCollectionFromCache("playlist", collectionId);
    if (!collection) {
      console.error(`Collection with ID ${collectionId} not found in cache`);
      return false;
    }

    if (
      !this.currentPlaylist.collectionId ||
      collectionId !== this.currentPlaylist.collectionId
    ) {
      await this.playPlaylist(collectionId, index);
      return true;
    } else {
      if (index !== this.currentPlaylist.currentIndex) {
        this.currentPlaylist.currentIndex = index;
        await this.loadTrack();
        this.currentPlaylist.playing = true;
        this.syncTrackPlayback();
        this.emitTrackChangeEvent();
        return true;
      } else if (this.currentPlaylist.playing) {
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
    if (
      this.currentPlaylist.howl &&
      this.currentPlaylist.howl.state() === "loaded"
    ) {
      return this.currentPlaylist.howl.seek() as number;
    }
    return 0;
  }

  getDuration(): number {
    if (
      this.currentPlaylist.howl &&
      this.currentPlaylist.howl.state() === "loaded"
    ) {
      return this.currentPlaylist.howl.duration();
    }
    return 0;
  }

  // Method to update the master volume
  updateVolume(volume: number): void {
    setVolume("playlist", volume);

    // Apply the volume to currently playing track
    if (this.currentPlaylist.howl) {
      this.currentPlaylist.howl.volume(volume);
    }

    emit(AudioEventTypes.VOLUME_CHANGE, { playlist: volume });
  }
}
