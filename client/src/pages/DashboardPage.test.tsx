import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import App from "../App";
import * as authApi from "../api/auth";
import * as consentsApi from "../api/consents";
import type { MyConsents } from "../api/consents";

/** Tests for issue #9 (FR-4, FR-7, FR-8 on the UI side; TC-CON-*). */

vi.mock("../api/client", () => ({
  api: {},
  getHealth: vi.fn().mockResolvedValue({ status: "ok", db: "up", time: new Date().toISOString() }),
}));
vi.mock("../api/auth", async (orig) => ({ ...(await orig<typeof import("../api/auth")>()), me: vi.fn() }));
vi.mock("../api/consents", () => ({ getMyConsents: vi.fn(), setConsent: vi.fn() }));

const auth = vi.mocked(authApi);
const api = vi.mocked(consentsApi);

const policy = { id: "pol-1", versionNo: "1.0" };
const marketing = { id: "p1", code: "MARKETING_EMAIL", name: "Marketing e-mails", description: "Offers and news" };
const analytics = { id: "p2", code: "ANALYTICS", name: "Usage analytics", description: "Statistics" };

function stateWith(m: MyConsents["purposes"][number]["status"]): MyConsents {
  return {
    currentPolicy: policy,
    purposes: [
      {
        purpose: marketing,
        status: m,
        updatedAt: m === "NOT_GIVEN" ? null : "2026-10-23T10:00:00.000Z",
        policyVersion: m === "NOT_GIVEN" ? null : policy,
      },
      { purpose: analytics, status: "NOT_GIVEN", updatedAt: null, policyVersion: null },
    ],
  };
}

const card = async (name: RegExp) => (await screen.findByRole("heading", { name })).closest("li") as HTMLElement;

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.me.mockResolvedValue({ id: "u1", name: "Asha User", email: "user@demo.com", role: "USER" });
});

describe("Consent Dashboard (#9)", () => {
  it("shows one card per purpose; nothing is pre-ticked", async () => {
    api.getMyConsents.mockResolvedValue(stateWith("NOT_GIVEN"));
    renderDashboard();

    const m = await card(/marketing e-mails/i);
    expect(within(m).getByText("Not given")).toBeInTheDocument();
    expect(within(m).getByRole("button", { name: /grant consent for marketing/i })).toBeInTheDocument();
    expect(await card(/usage analytics/i)).toBeInTheDocument();
    expect(screen.getByText(/of 2 granted/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy policy v1.0/i })).toHaveAttribute("href", "/policy");
  });

  it("Grant calls the API and the card turns to Granted", async () => {
    api.getMyConsents.mockResolvedValueOnce(stateWith("NOT_GIVEN")).mockResolvedValueOnce(stateWith("GRANTED"));
    api.setConsent.mockResolvedValue({
      id: "1",
      action: "GRANTED",
      recordedAt: "2026-10-23T10:00:00.000Z",
      policyVersion: { versionNo: "1.0" },
    });
    renderDashboard();

    fireEvent.click(within(await card(/marketing/i)).getByRole("button", { name: /grant/i }));
    await waitFor(() => expect(api.setConsent).toHaveBeenCalledWith("p1", "GRANTED"));
    expect(await screen.findByText(/consent granted for "marketing e-mails" under policy v1.0/i)).toBeInTheDocument();
    const m = await card(/marketing/i);
    expect(within(m).getByText("Granted")).toBeInTheDocument();
    expect(within(m).getByRole("button", { name: /withdraw consent for marketing/i })).toBeInTheDocument();
  });

  it("Withdraw sends WITHDRAWN", async () => {
    api.getMyConsents.mockResolvedValue(stateWith("GRANTED"));
    api.setConsent.mockResolvedValue({
      id: "2",
      action: "WITHDRAWN",
      recordedAt: "2026-10-23T11:00:00.000Z",
      policyVersion: { versionNo: "1.0" },
    });
    renderDashboard();
    fireEvent.click(within(await card(/marketing/i)).getByRole("button", { name: /withdraw/i }));
    await waitFor(() => expect(api.setConsent).toHaveBeenCalledWith("p1", "WITHDRAWN"));
  });

  it("shows the API error if saving fails", async () => {
    api.getMyConsents.mockResolvedValue(stateWith("NOT_GIVEN"));
    api.setConsent.mockRejectedValue(
      Object.assign(new Error("x"), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code: "PURPOSE_INACTIVE", message: "This purpose is no longer offered" } } },
      }),
    );
    renderDashboard();
    fireEvent.click(within(await card(/marketing/i)).getByRole("button", { name: /grant/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This purpose is no longer offered");
  });

  it("disables the buttons while no policy is published", async () => {
    api.getMyConsents.mockResolvedValue({ ...stateWith("NOT_GIVEN"), currentPolicy: null });
    renderDashboard();
    expect(within(await card(/marketing/i)).getByRole("button", { name: /grant/i })).toBeDisabled();
    expect(screen.getByText(/no privacy policy published yet/i)).toBeInTheDocument();
  });
});
