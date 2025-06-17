import {
  AudioFile,
  AudioCollection,
  AudioMacro,
} from "../../types/AudioItem.js";
import { AudioType } from "shared/audio/types.js";
import { AudioFileDTO } from "shared/DTO/files.js";

interface MacroApiResponse {
  id: number;
  name: string;
  description?: string;
  volume?: number;
  itemCount?: number;
  position?: number;
  duration?: number;
  items?: AudioFileDTO[];
}

// Update the interface to better represent mixed content
interface CollectionApiResponse {
  id: number;
  name: string;
  description?: string;
  itemCount?: number;
  position?: number;
  items?: (AudioFileDTO | MacroApiResponse)[];
}

/**
 * Transforms a file DTO into an AudioFile object
 */
export function transformDtoToAudioFile(dto: AudioFileDTO): AudioFile {
  return {
    type: "file",
    id: dto.id,
    name: dto.name,
    audioType: dto.audioType as AudioType,
    duration: dto.duration,
    volume: dto.volume,
    delay: dto.delay,
    url: dto.url,
    path: dto.path,
    folderId: dto.folderId,
    addedAt: dto.addedAt,
    active: dto.active,
    position: dto.position,
  };
}

/**
 * Transforms a macro API response into an AudioMacro object
 */
export function transformDtoToAudioMacro(dto: MacroApiResponse): AudioMacro {
  return {
    id: dto.id,
    type: "macro",
    name: dto.name,
    description: dto.description || undefined,
    volume: dto.volume ?? 1.0,
    itemCount: dto.itemCount ?? 0,
    position: dto.position ?? 0,
    duration: dto.duration ?? 0,
    items: dto.items?.map(transformDtoToAudioFile) ?? [],
  };
}

/**
 * Determines if an item is a macro or a file based on its properties
 */
function isMacroItem(item: AudioFileDTO | MacroApiResponse): item is MacroApiResponse {
  return (item as MacroApiResponse).items !== undefined || (item as MacroApiResponse).itemCount !== undefined;
}

/**
 * Transforms an item that could be either a file or macro
 */
function transformDtoToAudioItem(item: AudioFileDTO | MacroApiResponse) {
  if (isMacroItem(item)) {
    return transformDtoToAudioMacro(item);
  } else {
    return transformDtoToAudioFile(item as AudioFileDTO);
  }
}

/**
 * Transforms a collection API response into an AudioCollection object
 */
export function transformDtoToAudioCollection(
  dto: CollectionApiResponse,
  collectionType: "playlist" | "sfx" | "ambience" | "pack"
): AudioCollection {

  // For sfx collections, items can be files or macros
  const transformItems = () => {
    if (!dto.items) return [];

    if (collectionType === "sfx") {
      return dto.items.map(transformDtoToAudioItem);
    } else {
      return dto.items.map((item) =>
        transformDtoToAudioFile(item as AudioFileDTO)
      );
    }
  };

  return {
    id: dto.id,
    type: collectionType,
    name: dto.name,
    description: dto.description || undefined,
    itemCount: dto.itemCount ?? 0,
    position: dto.position ?? 0,
    items: transformItems(),
  };
}

// Also export the response interfaces so they can be reused
export type { MacroApiResponse, CollectionApiResponse };