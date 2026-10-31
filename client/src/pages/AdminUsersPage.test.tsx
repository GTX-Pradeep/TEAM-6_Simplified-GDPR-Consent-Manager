import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import App from "../App";
import * as authApi from "../api/auth";
import * as usersApi from "../api/users";
import type { AdminUser } from "../api/users";

/** Tests for issue #23 (SEC-4 on the UI side; TC-SEC-04). */

vi.mock("../api/client", () => ({
  api: {},
  getHealth: vi.fn().mockResolvedValue({ status: "ok", db: "up", time: new Date().toISOString() }),
}));
vi.mock("../api/auth", async (orig) => ({ ...(await orig<typeof import("../api/auth")>()), me: vi.fn() }));
vi.mock("../api/users", () => ({ listUsers: vi.fn(), changeRole: vi.fn(), setActive: vi.fn() }));
vi.mock("../api/policies", () => ({ listPolicies: vi.fn().mockResolvedValue([]), getCurrentPolicy: vi.fn() }));

const auth = vi.mocked(authApi);
const api = vi.mocked(usersApi);

const mk = (id: string, name: string, email: string, role: AdminUser["role"], isActive = true): AdminUser => ({
  id,
  name,
  email,
  role,
  isActive,
  lockedUntil: null,
  createdAt: "2026-10-20T09:00:00.000Z",
});
const admin = mk("a1", "Ravi Admin", "admin@demo.com", "ADMIN");
const asha = mk("u1", "Asha User", "user@demo.com", "USER");

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.me.mockResolvedValue({ id: "a1", name: "Ravi Admin", email: "admin@demo.com", role: "ADMIN" });
  api.listUsers.mockResolvedValue({ items: [admin, asha], total: 2, page: 1, pageSize: 50 });
});

/** The table row of a user (the header also shows the admin's name, so search inside the table). */
const rowOf = async (name: string) => {
  await screen.findByText("user@demo.com");
  return screen.getAllByRole("row").find((r) => within(r).queryByText(name)) as HTMLElement;
};

describe("Admin: users and roles (#23)", () => {
  it("lists users; the admin's own row cannot be changed", async () => {
    renderAt("/admin/users");
    const mine = await rowOf("Ravi Admin");
    expect(within(mine).getByText("(you)")).toBeInTheDocument();
    expect(within(mine).getByRole("combobox")).toBeDisabled();
    expect(within(mine).queryByRole("button", { name: /deactivate/i })).toBeNull();
  });

  it("changing a role calls the API and shows a confirmation", async () => {
    api.changeRole.mockResolvedValue({ ...asha, role: "DPO" });
    renderAt("/admin/users");
    fireEvent.change(within(await rowOf("Asha User")).getByRole("combobox", { name: /role of asha/i }), {
      target: { value: "DPO" },
    });
    await waitFor(() => expect(api.changeRole).toHaveBeenCalledWith("u1", "DPO"));
    expect(await screen.findByText("Asha User is now DPO / Auditor.")).toBeInTheDocument();
  });

  it("deactivates an account", async () => {
    api.setActive.mockResolvedValue({ ...asha, isActive: false });
    renderAt("/admin/users");
    fireEvent.click(within(await rowOf("Asha User")).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(api.setActive).toHaveBeenCalledWith("u1", false));
    expect(await screen.findByText(/deactivated and logged out/i)).toBeInTheDocument();
  });

  it("searches", async () => {
    renderAt("/admin/users");
    await rowOf("Asha User");
    fireEvent.change(screen.getByLabelText(/search by name or e-mail/i), { target: { value: "asha" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(api.listUsers).toHaveBeenLastCalledWith({ q: "asha", page: 1, pageSize: 50 }));
  });

  it("the admin tabs link Policies and Users", async () => {
    renderAt("/admin/users");
    const nav = await screen.findByRole("navigation", { name: /admin sections/i });
    expect(within(nav).getByRole("link", { name: "Policies" })).toHaveAttribute("href", "/admin");
    expect(within(nav).getByRole("link", { name: /users/i })).toHaveAttribute("href", "/admin/users");
  });

  it("a DPO cannot open it", async () => {
    auth.me.mockResolvedValue({ id: "d1", name: "Meera DPO", email: "dpo@demo.com", role: "DPO" });
    renderAt("/admin/users");
    await waitFor(() => expect(screen.queryByRole("heading", { name: /users and roles/i })).toBeNull());
    expect(api.listUsers).not.toHaveBeenCalled();
  });
});
