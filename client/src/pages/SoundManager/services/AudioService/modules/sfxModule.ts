import { Howl } from "howler";
import { AudioEventTypes, emit } from "../events.js";
import { AudioFile, AudioMacro, isAudioFile } from "../../../types/AudioItem.js";
import { resolveAudioPath, resolveAudioUrl } from "../utils/pathResolvers.js";
import { getVolume, setVolume } from "../volumeStore.js";

type SfxMacroState = {
  volume: number;
  fileIds: number[];
  timeoutIds: NodeJS.Timeout[];
  howls: Howl[];
};

export class SfxModule {
  private currentFiles: Map<number, { fileId: number; howl: Howl; volume: number }> = new Map();
  private currentMacros: Map<number, SfxMacroState> = new Map();

  // Play a single SFX file
  async playFile(file: AudioFile): Promise<void> {
    const audioSrc = resolveAudioPath(file.filePath) || await resolveAudioUrl(file.fileUrl) || "";

    const howl = new Howl({
      src: [audioSrc],
      volume: getVolume("sfx") * (file.volume ?? 1),
      html5: file.fileUrl ? true : false,
      onend: () => {
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

    const timeoutIds: NodeJS.Timeout[] = [];
    const howls: Howl[] = [];
    const fileIds: number[] = [];

    for (const sound of macro.items) {
      if (!isAudioFile(sound)) continue;

      fileIds.push(sound.id);

      const audioSrc = resolveAudioPath(sound.filePath) || await resolveAudioUrl(sound.fileUrl) || "";
      
      if (!audioSrc) {
        console.warn(`Could not resolve audio source for ${sound.name || sound.id} in macro ${macro.name}`);
        continue; // Skip this sound if source is invalid
      }

      const howl = new Howl({
        src: [audioSrc],
        volume: (sound.volume ?? 1) * getVolume("sfx"),
        html5: sound.fileUrl ? true : false,
      });

      howls.push(howl);

      const timeoutId = setTimeout(() => {
        howl.play();
      }, sound.delay || 0);

      timeoutIds.push(timeoutId);
    }

    this.currentMacros.set(macro.id, {
      volume: macro.volume ?? 1,
      fileIds,
      timeoutIds,
      howls,
    });

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

  // Set master SFX volume (affects future sounds)
  setMasterVolume(volume: number): void {
    if (volume < 0 || volume > 1) return;
    setVolume("sfx", volume);
    // Does not affect currently playing sounds, only new ones
    // (matching AudioService behavior)
    // If you want to update current sounds, uncomment below:
    // this.currentFiles.forEach(sound => {
    //   sound.howl.volume(volume * (sound.volume || 1));
    // });
  }

  // State getters
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
