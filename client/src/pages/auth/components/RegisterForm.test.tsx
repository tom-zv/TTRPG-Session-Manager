import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { expect, test } from "vitest";
import { json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders } from "src/test/render.js";
import RegisterForm from "./RegisterForm.js";

test("sign-up offers no role choice and never sends one", async () => {
  const user = userEvent.setup();
  const bodies: unknown[] = [];
  server.use(http.post("/api/auth/register", async ({ request }) => {
    bodies.push(await request.json());
    return json({ id: 5, username: "newbie", isGm: false, createdAt: "", lastLogin: "" }, 201);
  }));
  let succeeded = false;
  renderWithProviders(<RegisterForm onSuccess={() => { succeeded = true; }} />);

  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByText(/game master/i)).toBeNull();

  await user.type(screen.getByLabelText("Username"), "newbie");
  await user.type(screen.getByLabelText("Email"), "newbie@example.test");
  await user.type(screen.getByLabelText("Password"), "secret");
  await user.type(screen.getByLabelText("Confirm Password"), "secret");
  await user.click(screen.getByRole("button", { name: "Register" }));

  await waitFor(() => expect(succeeded).toBe(true));
  expect(bodies).toEqual([{ username: "newbie", email: "newbie@example.test", password: "secret" }]);
});
