import {
  AudioItem,
  AudioCollection,
  isPlaylistCollection,
} from "../../../../types/AudioItem.js";
import ItemActions from "../ItemActions.js";
import { isAudioFile, isAudioMacro } from "../../../../types/AudioItem.js";
import { getItemIcon } from "../../utils/getItemIcon.js";

export function getColumns(collection: AudioCollection) {
  switch (collection.type) {
    case "pack":
      return ["icon", "name"];

    case "playlist":
      return collection.id < 0
        ? ["image", "name", "actions"]
        : ["position", "name", "duration", "actions"];

    case "macro":
      return ["name", "actions"];

    default:
      return ["position", "name", "duration", "actions"];
  }
}

function removeTrackNumberPrefix(name: string): string {
  // Remove patterns like "1. ", "01. ", "123. " from the beginning of the string
  return name.replace(/^(\d+\.\s*)/g, "");
}

export function renderCell(
  column: string,
  item: AudioItem,
  collection: AudioCollection,
  showActions: boolean,
  selectedItemIds: number[],
  items: AudioItem[],
  removeItems: ((items: AudioItem[]) => void) | undefined,
  onEditItem: ((itemId: number) => void) | undefined,
  handlePlayItem: (item: AudioItem) => void
) {
  switch (column) {
    case "id":
      return <td key={column}>{item.id}</td>;

    case "icon": {
      const IconComponent = getItemIcon(item);
      return (
        <td key={column} className="icon-cell">
          <IconComponent />
        </td>
      );
    }

    case "position":
      return (
        <td key={column}>
          <div className="position-cell">
            <span className="position-number">{item.position! + 1}</span>
            <button
              className="position-play-button"
              onClick={(e) => {
                e.stopPropagation();
                handlePlayItem(item);
              }}
              aria-label="Play"
            >
              ▶
            </button>
          </div>
        </td>
      );

    case "name":
      return (
        <td key={column}>
          <div className="item-name-cell">
            <span className="item-name-text">
              {removeTrackNumberPrefix(item.name)}
            </span>
            {collection.type !== "macro" && item.type === "macro" && (
              <span className="macro-indicator">Macro</span>
            )}
          </div>
        </td>
      );

    case "duration":
      return (
        <td key={column}>
          {(isAudioFile(item) || isAudioMacro(item)) && item.duration
            ? new Date(item.duration * 1000)
                .toISOString()
                .slice(11, 19)
                .replace(/^00:/, "")
                .replace(/^0/, "")
            : ""}
        </td>
      );

    case "actions":
      return showActions ? (
        <td key={column} onClick={(e) => e.stopPropagation()}>
          <ItemActions
            collectionId={collection.id}
            item={item}
            selectedItems={items.filter((i) => selectedItemIds.includes(i.id))}
            removeItems={removeItems}
            onEditClick={onEditItem}
            isSmall
          />
        </td>
      ) : null;

    case "image":
      return isPlaylistCollection(item) && item.imagePath ? (
        <td key={column} className="image-cell">
          <div className="image">
            {item.imagePath ? (
              <img
                src={item.imagePath}
                alt={item.name}
                style={{ maxWidth: 35, maxHeight: 35, objectFit: "contain" }}
              />
            ) : null}
          </div>
        </td>
      ) : null;

    default:
      return <td key={column}>{item[column as keyof AudioItem]}</td>;
  }
}
