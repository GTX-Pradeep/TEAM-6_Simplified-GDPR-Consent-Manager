import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import App from "../App";
import * as authApi from "../api/auth";
import * as dpoApi from "../api/dpo";

/** Tests for issue #22 (FR-18 on the UI side; TC-DPO-*). */

vi.mock("../api/client", () => ({
  api: {},
  getHealth: vi.fn().mockResolvedValue({ status: "ok", db: "up", time: new Date().toISOString() }),
}));
vi.mock("../api/auth", async (orig) => ({ ...(await orig<typeof import("../api/auth")>()), me: vi.fn() }));
vi.mock("../api/dpo", () => ({ listConsentRecords: vi.fn(), listAuditEntries: vi.fn() }));

const auth = vi.mocked(authApi);
const api = vi.mocked(dpoApi);

const consentRow = (id: number) => ({
  id: String(id),
  action: id % 2 ? ("GRANTED" as const) : ("WITHDRAWN" as const),
  recordedAt: "2026-10-29T10:00:00.000Z",
  user: { id: "u1", name: "Asha User", email: "user@demo.com" },
  purpose: { id: "p1", code: "ANALYTICS", name: "Usage analytics" },
  policyVersion: { id: "v1", versionNo: "1.0" },
  hash: "abc",
});

const renderDpo = () =>
  render(
    <MemoryRouter initialEntries={["/dpo"]}>
      <App />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.me.mockResolvedValue({ id: "d1", name: "Meera DPO", email: "dpo@demo.com", role: "DPO" });
  api.listConsentRecords.mockResolvedValue({ items: [consentRow(2), consentRow(1)], total: 120, page: 1, pageSize: 50 });
  api.listAuditEntries.mockResolvedValue({
    items: [
      {
        id: "9",
        createdAt: "2026-10-29T10:00:00.000Z",
        actor: null,
        action: "LOGIN_FAILED",
        targetType: "User",
        targetId: "unknown",
        outcome: "FAILURE",
        details: { reason: "UNKNOWN_EMAIL" },
        prevHash: "p",
        hash: "0123456789abcdef",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 50,
  });
});

describe("DPO console (#22)", () => {
  it("shows consent records with user, purpose, decision and policy version", async () => {
    renderDpo();
    expect(await screen.findByRole("heading", { name: /consent records and audit trail/i })).toBeInTheDocument();
    await screen.findAllByText("user@demo.com");
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2
    expect(within(rows[1]).getByText("Withdrawn")).toBeInTheDocument();
    expect(within(rows[2]).getByText("user@demo.com")).toBeInTheDocument();
    expect(screen.getByText("Showing 1-50 of 120")).toBeInTheDocument();
  });

  it("pages forward", async () => {
    renderDpo();
    expect(await screen.findByRole("button", { name: "Previous" })).toBeDisabled();
    api.listConsentRecords.mockResolvedValueOnce({ items: [consentRow(1)], total: 120, page: 2, pageSize: 50 });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(api.listConsentRecords).toHaveBeenLastCalledWith({ page: 2, pageSize: 50 }));
    expect(await screen.findByText("Showing 51-100 of 120")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("switches to the audit trail tab", async () => {
    renderDpo();
    fireEvent.click(await screen.findByRole("tab", { name: "Audit trail" }));
    expect(await screen.findByText("LOGIN_FAILED")).toBeInTheDocument();
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.getByText("Failure")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Audit trail" })).toHaveAttribute("aria-selected", "true");
  });

  it("has no edit or delete controls (read-only)", async () => {
    renderDpo();
    await screen.findAllByText("user@demo.com");
    expect(screen.queryByRole("button", { name: /edit|delete|remove/i })).toBeNull();
  });

  it("a USER is sent away from the DPO console", async () => {
    auth.me.mockResolvedValue({ id: "u1", name: "Asha User", email: "user@demo.com", role: "USER" });
    renderDpo();
    await waitFor(() => expect(screen.queryByRole("heading", { name: /consent records and audit trail/i })).toBeNull());
    expect(api.listConsentRecords).not.toHaveBeenCalled();
  });
});
