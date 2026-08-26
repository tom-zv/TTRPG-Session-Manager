import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, test } from "vitest";
import { EntityEditContext, type EntityEditApi } from "../EntityEditContext.js";
import { PopoverForm } from "./PopoverForm.js";

const api = (): EntityEditApi => ({
  // The form reads none of these; it needs the context to exist.
  draft: {} as EntityEditApi["draft"],
  modes: {} as EntityEditApi["modes"],
  activeId: "x",
  narrow: false,
  open: () => true,
  close: () => undefined,
  closeTo: () => undefined,
  switchTo: () => undefined,
  commit: () => undefined,
  commitRef: createRef<(() => boolean) | null>() as EntityEditApi["commitRef"],
  takeFocus: () => false,
});

describe("PopoverForm", () => {
  test("opens on its first enabled control, skipping a disabled one that comes first", () => {
    render(
      <EntityEditContext value={api()}>
        <PopoverForm onApply={() => true}>
          <button type="button" disabled>+ Add speed</button>
          <input aria-label="Feet" />
        </PopoverForm>
      </EntityEditContext>,
    );

    expect(screen.getByRole("button", { name: "+ Add speed" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Feet" })).toHaveFocus();
  });
});
