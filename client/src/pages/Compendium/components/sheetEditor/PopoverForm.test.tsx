import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, test } from "vitest";
import { SheetEditContext, type SheetEditControls } from "./SheetEditContext.js";
import { PopoverForm } from "./PopoverForm.js";

const api = (): SheetEditControls => ({
  // The form reads none of these; it needs the context to exist.
  activeId: "x",
  narrow: false,
  presentation: "targets",
  open: () => true,
  close: () => undefined,
  closeTo: () => undefined,
  switchTo: () => undefined,
  commitRef: createRef<(() => boolean) | null>() as SheetEditControls["commitRef"],
  takeFocus: () => false,
  focusOpenRef: createRef<(() => void) | null>() as SheetEditControls["focusOpenRef"],
  claim: () => true,
  registerLive: () => () => undefined,
  requestLiveFocus: () => undefined,
  pendingLive: [],
  carriedId: null,
});

describe("PopoverForm", () => {
  test("opens on its first enabled control, skipping a disabled one that comes first", () => {
    render(
      <SheetEditContext value={api()}>
        <PopoverForm onApply={() => true}>
          <button type="button" disabled>+ Add speed</button>
          <input aria-label="Feet" />
        </PopoverForm>
      </SheetEditContext>,
    );

    expect(screen.getByRole("button", { name: "+ Add speed" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Feet" })).toHaveFocus();
  });
});
