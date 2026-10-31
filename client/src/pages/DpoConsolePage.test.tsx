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
vi.mock("../api/dpo", () => ({
  listConsentRecords: vi.fn(),
  listAuditEntries: vi.fn(),
  verifyIntegrity: vi.fn(),
  lookupUser: vi.fn(),
  getConsentStateAt: vi.fn(),
}));

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
    const cell = await screen.findByRole("cell", { name: "LOGIN_FAILED" });
    const row = cell.closest("tr") as HTMLElement;
    expect(within(row).getByText("Anonymous")).toBeInTheDocument();
    expect(within(row).getByText("Failure")).toBeInTheDocument();
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

describe("search and filter (#26, FR-19)", () => {
  it("sends only the filled-in consent filters and starts again at page 1", async () => {
    renderDpo();
    await screen.findAllByText("user@demo.com");
    const form = screen.getByRole("form", { name: /search consent records/i });
    fireEvent.change(within(form).getByLabelText(/user/i), { target: { value: "asha" } });
    fireEvent.change(within(form).getByLabelText(/decision/i), { target: { value: "WITHDRAWN" } });
    fireEvent.change(within(form).getByLabelText(/from/i), { target: { value: "2026-10-01" } });
    fireEvent.click(within(form).getByRole("button", { name: "Search" }));

    await waitFor(() =>
      expect(api.listConsentRecords).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 50,
        user: "asha",
        action: "WITHDRAWN",
        from: "2026-10-01",
      }),
    );
  });

  it("Clear removes the filters", async () => {
    renderDpo();
    await screen.findAllByText("user@demo.com");
    const form = screen.getByRole("form", { name: /search consent records/i });
    fireEvent.change(within(form).getByLabelText(/policy version/i), { target: { value: "2.0" } });
    fireEvent.click(within(form).getByRole("button", { name: "Search" }));
    fireEvent.click(await within(form).findByRole("button", { name: "Clear" }));
    await waitFor(() => expect(api.listConsentRecords).toHaveBeenLastCalledWith({ page: 1, pageSize: 50 }));
  });

  it("the audit tab has its own filters", async () => {
    renderDpo();
    fireEvent.click(await screen.findByRole("tab", { name: "Audit trail" }));
    const form = await screen.findByRole("form", { name: /search audit trail/i });
    fireEvent.change(within(form).getByLabelText(/outcome/i), { target: { value: "FAILURE" } });
    fireEvent.change(within(form).getByLabelText(/^action/i), { target: { value: "LOGIN_FAILED" } });
    fireEvent.click(within(form).getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(api.listAuditEntries).toHaveBeenLastCalledWith({ page: 1, pageSize: 50, outcome: "FAILURE", action: "LOGIN_FAILED" }),
    );
  });

  it("says when nothing matches", async () => {
    renderDpo();
    await screen.findAllByText("user@demo.com");
    api.listConsentRecords.mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 50 });
    const form = screen.getByRole("form", { name: /search consent records/i });
    fireEvent.change(within(form).getByLabelText(/user/i), { target: { value: "nobody" } });
    fireEvent.click(within(form).getByRole("button", { name: "Search" }));
    expect(await screen.findByText(/no results match these filters/i)).toBeInTheDocument();
  });
});

describe("Verify integrity (#27, SEC-6)", () => {
  it("shows a green result when both chains are intact", async () => {
    api.verifyIntegrity.mockResolvedValue({
      ok: true,
      checkedAt: "2026-10-31T10:00:00.000Z",
      audit: { ok: true, checked: 312, firstBrokenId: null, reason: null },
      consents: { ok: true, checked: 148, firstBrokenId: null, reason: null },
    });
    renderDpo();
    fireEvent.click(await screen.findByRole("button", { name: "Verify integrity" }));
    expect(await screen.findByText(/no tampering found/i)).toBeInTheDocument();
    expect(screen.getByText("Audit trail: 312 checked, chain intact")).toBeInTheDocument();
    expect(screen.getByText("Consent records: 148 checked, chain intact")).toBeInTheDocument();
  });

  it("points to the first broken record when something was changed", async () => {
    api.verifyIntegrity.mockResolvedValue({
      ok: false,
      checkedAt: "2026-10-31T10:00:00.000Z",
      audit: { ok: false, checked: 57, firstBrokenId: "57", reason: "HASH_MISMATCH" },
      consents: { ok: true, checked: 148, firstBrokenId: null, reason: null },
    });
    renderDpo();
    fireEvent.click(await screen.findByRole("button", { name: "Verify integrity" }));
    expect(await screen.findByText("Tampering detected")).toBeInTheDocument();
    expect(screen.getByText(/problem at #57 - its content does not match its hash/i)).toBeInTheDocument();
  });
});

describe("Time travel (#16, FR-20)", () => {
  it("looks up the user and shows what they had agreed to at that moment", async () => {
    api.lookupUser.mockResolvedValue({ id: "u1", name: "Asha User", email: "user@demo.com" });
    api.getConsentStateAt.mockResolvedValue({
      user: { id: "u1", name: "Asha User", email: "user@demo.com" },
      at: "2026-10-15T09:30:00.000Z",
      policyInForce: { id: "v1", versionNo: "1.0", effectiveAt: "2026-10-01T00:00:00.000Z" },
      purposes: [
        {
          purpose: { id: "p1", code: "MARKETING_EMAIL", name: "Marketing e-mails", isActive: true },
          status: "GRANTED",
          decidedAt: "2026-10-10T09:00:00.000Z",
          recordId: "1",
          policyVersion: { id: "v1", versionNo: "1.0" },
        },
        {
          purpose: { id: "p2", code: "ANALYTICS", name: "Usage analytics", isActive: false },
          status: "NOT_GIVEN",
          decidedAt: null,
          recordId: null,
          policyVersion: null,
        },
      ],
    });
    renderDpo();
    fireEvent.click(await screen.findByRole("tab", { name: "Time travel" }));
    const form = await screen.findByRole("form", { name: /consent state at a past moment/i });
    fireEvent.change(within(form).getByLabelText(/user e-mail/i), { target: { value: "user@demo.com" } });
    fireEvent.change(within(form).getByLabelText(/date and time/i), { target: { value: "2026-10-15T15:00" } });
    fireEvent.click(within(form).getByRole("button", { name: /show consent state/i }));

    await waitFor(() => expect(api.lookupUser).toHaveBeenCalledWith("user@demo.com"));
    const [, at] = api.getConsentStateAt.mock.calls[0];
    expect(at).toEqual(new Date("2026-10-15T15:00")); // local time, sent as an exact instant
    const result = await screen.findByRole("region", { name: "Result" });
    expect(within(result).getByText("v1.0")).toBeInTheDocument();
    expect(within(result).getByText("Granted")).toBeInTheDocument();
    expect(within(result).getByText(/deactivated since/i)).toBeInTheDocument();
    expect(within(result).getByText(/record #1/)).toBeInTheDocument();
  });

  it("shows the API error for an unknown e-mail", async () => {
    api.lookupUser.mockRejectedValue(
      Object.assign(new Error("404"), {
        isAxiosError: true,
        response: { status: 404, data: { error: { code: "USER_NOT_FOUND", message: "No user with this e-mail address" } } },
      }),
    );
    renderDpo();
    fireEvent.click(await screen.findByRole("tab", { name: "Time travel" }));
    const form = await screen.findByRole("form", { name: /consent state at a past moment/i });
    fireEvent.change(within(form).getByLabelText(/user e-mail/i), { target: { value: "nobody@demo.com" } });
    fireEvent.click(within(form).getByRole("button", { name: /show consent state/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No user with this e-mail address");
  });
});
