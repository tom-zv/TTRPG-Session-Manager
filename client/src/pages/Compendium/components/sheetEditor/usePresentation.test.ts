import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { installMatchMedia, setPrimaryPointer, setViewportWidth } from "src/test/fakes/matchMedia.js";
import { usePresentation } from "./usePresentation.js";

describe("usePresentation", () => {
  test("a touch screen gets per-field editors even at desktop width", () => {
    installMatchMedia(1500, { pointer: "coarse" });
    const { result } = renderHook(() => usePresentation());
    expect(result.current).toBe("targets");
  });

  test("a wide window with a mouse edits in place", () => {
    installMatchMedia(1500, { pointer: "fine" });
    const { result } = renderHook(() => usePresentation());
    expect(result.current).toBe("live");
  });

  test("a narrow window with a mouse gets per-field editors", () => {
    installMatchMedia(700, { pointer: "fine" });
    const { result } = renderHook(() => usePresentation());
    expect(result.current).toBe("targets");
  });

  test("resizing or switching to touch changes the presentation without a remount", () => {
    installMatchMedia(1500);
    const { result } = renderHook(() => usePresentation());
    expect(result.current).toBe("live");

    setViewportWidth(700);
    expect(result.current).toBe("targets");
    setViewportWidth(1500);
    expect(result.current).toBe("live");

    setPrimaryPointer("coarse");
    expect(result.current).toBe("targets");
  });
});
