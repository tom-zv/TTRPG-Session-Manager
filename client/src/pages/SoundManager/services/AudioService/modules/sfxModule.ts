import { Howl } from "howler";
import { AudioEventTypes, emit } from "../events.js";
import { AudioFile, AudioMacro, isAudioFile } from "../../../types/AudioItem.js";
import { resolveAudioSource } from "../utils/pathResolvers.js";
import { getVolume, setVolume } from "../volumeStore.js";

type SfxMacroState = {
  volume: number;
  timeoutIds: NodeJS.Timeout[];
  howls: Howl[];
};

export class SfxModule {
  private currentFiles: Map<number, { fileId: number; howl: Howl; volume: number }> = new Map();
  private currentMacros: Map<number, SfxMacroState> = new Map();

  /** Moves on `reset`, so a source resolved for the ended session is never played. */
  private epoch = 0;

  // Play a single SFX file
  async playFile(file: AudioFile): Promise<void> {
    const epoch = this.epoch;
    const audioSrc = await resolveAudioSource(file);
    if (epoch !== this.epoch) return;

    this.stopFile(file.id);
    const howl = new Howl({
      src: [audioSrc],
      volume: getVolume("sfx") * (file.volume ?? 1),
      html5: file.url ? true : false,
      onend: () => {
        if (this.currentFiles.get(file.id)?.howl !== howl) return;
        this.currentFiles.delete(file.id);
        emit(
          AudioEventTypes.SFX_FILE_CHANGE,
          Array.from(this.currentFiles.values()).map(({ fileId }) => fileId)
        );
      },
    });

    this.currentFiles.set(file.id, {
      howl,
      volume: getVolume("sfx") * (file.volume ?? 1),
      fileId: file.id,
    });

    howl.play();
    emit(
      AudioEventTypes.SFX_FILE_CHANGE,
      Array.from(this.currentFiles.values()).map(({ fileId }) => fileId)
    );
  }

  // Stop a single SFX file
  stopFile(id: number): void {
    const howl = this.currentFiles.get(id)?.howl;
    if (howl) {
      howl.stop();
      howl.unload();
      this.currentFiles.delete(id);
      emit(
        AudioEventTypes.SFX_FILE_CHANGE,
        Array.from(this.currentFiles.values()).map(({ fileId }) => fileId)
      );
    }
  }

  // Toggle play/stop for a file
  async toggleFile(file: AudioFile): Promise<boolean> {
    const howl = this.currentFiles.get(file.id)?.howl;
    if (howl) {
      this.stopFile(file.id);
      return false;
    } else {
      await this.playFile(file);
      return true;
    }
  }

  // Play a macro (sequence of SFX files)
  async playMacro(macro: AudioMacro): Promise<void> {
    if (!macro || !macro.items) return;

    this.stopMacro(macro.id);
    const running: SfxMacroState = { volume: macro.volume ?? 1, timeoutIds: [], howls: [] };
    // Register before resolving a source so logout can stop even a partially loaded macro.
    this.currentMacros.set(macro.id, running);

    for (const sound of macro.items) {
      if (!isAudioFile(sound)) continue;

      const audioSrc = await resolveAudioSource(sound);
      if (this.currentMacros.get(macro.id) !== running) return;

      if (!audioSrc) {
        console.warn(`Could not resolve audio source for ${sound.name || sound.id} in macro ${macro.name}`);
        continue; // Skip this sound if source is invalid
      }

      const howl = new Howl({
        src: [audioSrc],
        volume: (sound.volume ?? 1) * getVolume("sfx"),
        html5: sound.url ? true : false,
      });

      running.howls.push(howl);

      const timeoutId = setTimeout(() => {
        howl.play();
      }, sound.delay || 0);

      running.timeoutIds.push(timeoutId);
    }

    emit(AudioEventTypes.SFX_MACRO_CHANGE, Array.from(this.currentMacros.keys()));
  }

  // Stop a macro
  stopMacro(id: number): void {
    const macro = this.currentMacros.get(id);
    if (macro) {
      macro.timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
      macro.howls.forEach((howl) => {
        howl.stop();
        howl.unload();
      });
      this.currentMacros.delete(id);
      emit(AudioEventTypes.SFX_MACRO_CHANGE, Array.from(this.currentMacros.keys()));
    }
  }

  // Toggle play/stop for a macro
  async toggleMacro(macro: AudioMacro): Promise<boolean> {
    if (this.currentMacros.has(macro.id)) {
      this.stopMacro(macro.id);
      return false;
    } else {
      await this.playMacro(macro);
      return true;
    }
  }

  // Set volume for a macro
  setMacroVolume(id: number, volume: number): void {
    const macro = this.currentMacros.get(id);
    if (macro) {
      macro.howls.forEach((howl) => {
        howl.volume(getVolume("sfx") * volume);
      });
      macro.volume = volume;
      emit(AudioEventTypes.SFX_MACRO_CHANGE, Array.from(this.currentMacros.keys()));
    }
  }

  // Set volume for a single SFX file
  setSfxFileVolume(id: number, volume: number): void {
    const sound = this.currentFiles.get(id);
    if (sound) {
      sound.volume = volume;
      if (sound.howl) {
        sound.howl.volume(getVolume("sfx") * volume);
      }
      emit(
        AudioEventTypes.SFX_FILE_CHANGE,
        Array.from(this.currentFiles.values()).map(({ fileId }) => fileId)
      );
    }
  }

  // Set master SFX volume 
  setMasterVolume(volume: number): void {
    if (volume < 0 || volume > 1) return;
    setVolume("sfx", volume);
    // Does not affect currently playing sounds, only new ones
    // for current sound update, uncomment:
    // this.currentFiles.forEach(sound => {
    //   sound.howl.volume(volume * (sound.volume || 1));
    // });
  }

  /** The GM session ended: stop and unload every file and macro, pending macro steps included. */
  reset(): void {
    this.epoch += 1;
    [...this.currentMacros.keys()].forEach((id) => this.stopMacro(id));
    [...this.currentFiles.keys()].forEach((id) => this.stopFile(id));
  }

  // State getters
  getFilePosition(id: number): number | null {
    const file = this.currentFiles.get(id);
    if (!file) return null;
    return file.howl.seek();
  }

  get playingSoundIds(): number[] {
    return Array.from(this.currentFiles.keys());
  }

  get playingMacroIds(): number[] {
    return Array.from(this.currentMacros.keys());
  }

  get volume(): number {
    return getVolume("sfx");
  }

  
}

export const sfxModule = new SfxModule();
