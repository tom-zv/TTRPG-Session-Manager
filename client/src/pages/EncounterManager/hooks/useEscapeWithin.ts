import { useEffect, useRef, type RefObject } from "react";

/**
 * Calls `onEscape` when Escape is pressed while focus is inside `ref`.
 * Lets inline panels (confirmations, restore controls) close from the keyboard
 * without key handlers on non-interactive wrapper elements.
 */
export function useEscapeWithin(ref: RefObject<HTMLElement | null>, onEscape: () => void): void {
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!ref.current?.contains(document.activeElement)) return;
      event.preventDefault();
      onEscapeRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [ref]);
}
