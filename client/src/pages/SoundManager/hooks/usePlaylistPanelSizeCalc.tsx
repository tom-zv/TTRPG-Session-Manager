import { useLayoutEffect, useRef, RefObject } from "react";
import { ImperativePanelHandle } from "react-resizable-panels";

const MIN_PERCENTAGE = 10;
const MAX_PERCENTAGE = 40;

export function usePlaylistPanelSizeCalc(
  itemCount: number,
  panelRef: RefObject<ImperativePanelHandle>
) {
  const rafRef = useRef<number>();
  const listenerRef = useRef<(e?: Event) => void>();

  useLayoutEffect(() => {
    let cancelled = false;

    const measureAndResize = () => {
      const panelGroupElement = document.querySelector<HTMLElement>(
        ".sound-manager .sound-manager-left-panel > div"
      );
      const headerElement = document.querySelector<HTMLElement>(
        ".sound-manager .playlist-panel .panel-header"
      );
      const itemElement = document.querySelector<HTMLElement>(
        ".sound-manager .audio-item-row"
      );
      if (!panelGroupElement ||!headerElement ||!itemElement ||!panelRef.current) {
        if (!cancelled)
          rafRef.current = requestAnimationFrame(measureAndResize);
        return;
      }

      const panelGroupHeight = panelGroupElement.getBoundingClientRect().height;
      const headerHeight = headerElement.getBoundingClientRect().height;
      const itemHeigh = itemElement.getBoundingClientRect().height;

      const neededPercentage =
        ((headerHeight + itemHeigh * itemCount) / panelGroupHeight) * 100;
      const percentage = Math.max(
        MIN_PERCENTAGE,
        Math.min(MAX_PERCENTAGE, neededPercentage)
      );

      panelRef.current.resize(percentage);
    };

    listenerRef.current = measureAndResize;

    rafRef.current = requestAnimationFrame(measureAndResize);

    window.addEventListener("resize", measureAndResize);

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (listenerRef.current)
        window.removeEventListener("resize", listenerRef.current);
    };
  }, [itemCount, panelRef]);
}