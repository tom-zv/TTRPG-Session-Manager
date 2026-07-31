import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import Dialog from "./Dialog.js";

const outsidePress = (timeStamp: number) => {
  const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  act(() => void document.body.dispatchEvent(event));
};

describe("Dialog outside press", () => {
  test("a press outside the dialog closes it", () => {
    const onClose = vi.fn();
    render(<Dialog isOpen onClose={onClose} title="Details">Body</Dialog>);

    outsidePress(performance.now() + 1000);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("the press that opened the dialog does not close it, but the next one does", () => {
    const onClose = vi.fn();
    // The opening press began before the dialog mounted, as a row's mousedown does.
    const openingPress = performance.now() - 1;
    render(<Dialog isOpen onClose={onClose} title="Details">Body</Dialog>);

    outsidePress(openingPress);
    expect(onClose).not.toHaveBeenCalled();

    outsidePress(performance.now() + 1000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("a press inside the dialog never closes it", () => {
    const onClose = vi.fn();
    render(<Dialog isOpen onClose={onClose} title="Details">Body</Dialog>);

    fireEvent.mouseDown(screen.getByText("Body"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
