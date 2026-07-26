import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { FormField } from "./FormField.js";

describe("FormField", () => {
  test("labels its input and links the error message to it", () => {
    render(
      <FormField label="Hit points" error="Must be at least 1">
        <input type="number" />
      </FormField>
    );

    const input = screen.getByLabelText("Hit points");
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription("Must be at least 1");
  });

  test("without an error the input is valid and has no description", () => {
    render(
      <FormField label="Hit points">
        <input type="number" />
      </FormField>
    );

    const input = screen.getByLabelText("Hit points");
    expect(input).toBeValid();
    expect(input).not.toHaveAccessibleDescription();
  });
});
