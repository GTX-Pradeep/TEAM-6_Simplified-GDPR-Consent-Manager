import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import App from "../App";
import * as authApi from "../api/auth";
import * as consentsApi from "../api/consents";
import * as noticesApi from "../api/notices";

/** Tests for issue #20 (FR-16 on the UI side; TC-POL-04). */

vi.mock("../api/client", () => ({
  api: {},
  getHealth: vi.fn().mockResolvedValue({ status: "ok", db: "up", time: new Date().toISOString() }),
}));
vi.mock("../api/auth", async (orig) => ({ ...(await orig<typeof import("../api/auth")>()), me: vi.fn() }));
vi.mock("../api/consents", () => ({ getMyConsents: vi.fn(), setConsent: vi.fn(), getMyHistory: vi.fn() }));
vi.mock("../api/notices", () => ({ getMyNotices: vi.fn(), reconfirmNotice: vi.fn(), acknowledgeNotice: vi.fn() }));

const auth = vi.mocked(authApi);
const consents = vi.mocked(consentsApi);
const notices = vi.mocked(noticesApi);

const notice = {
  id: "n1",
  createdAt: "2026-10-31T09:00:00.000Z",
  policy: { id: "v2", versionNo: "2.0", title: "Privacy Policy", changeSummary: "Adds analytics details", effectiveAt: "2026-10-31T09:00:00.000Z" },
  purposes: [
    { id: "p1", code: "MARKETING_EMAIL", name: "Marketing e-mails", grantedUnder: "1.0" },
    { id: "p2", code: "PERSONALISATION", name: "Personalised recommendations", grantedUnder: "1.0" },
  ],
};

const renderDashboard = () =>
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <App />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.me.mockResolvedValue({ id: "u1", name: "Asha User", email: "user@demo.com", role: "USER" });
  consents.getMyConsents.mockResolvedValue({ purposes: [], currentPolicy: { id: "v2", versionNo: "2.0" } });
});

describe("policy-change notice (#20)", () => {
  it("tells the user what changed and which consents were given under the old version", async () => {
    notices.getMyNotices.mockResolvedValue([notice]);
    renderDashboard();
    const banner = await screen.findByRole("region", { name: /privacy policy updated/i });
    expect(within(banner).getByText(/changed to version 2.0/i)).toBeInTheDocument();
    expect(within(banner).getByText(/adds analytics details/i)).toBeInTheDocument();
    expect(within(banner).getByText("Marketing e-mails and Personalised recommendations")).toBeInTheDocument();
    expect(within(banner).getByRole("link", { name: /read the new policy/i })).toHaveAttribute("href", "/policy");
  });

  it("'Keep my choices' re-confirms and refreshes the cards", async () => {
    notices.getMyNotices.mockResolvedValue([notice]);
    notices.reconfirmNotice.mockResolvedValue({ reconfirmed: 2 });
    renderDashboard();
    fireEvent.click(await screen.findByRole("button", { name: /keep my choices/i }));
    await waitFor(() => expect(notices.reconfirmNotice).toHaveBeenCalledWith("n1"));
    expect(await screen.findByText(/2 consents confirmed under policy v2.0/i)).toBeInTheDocument();
    expect(consents.getMyConsents).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("region", { name: /privacy policy updated/i })).toBeNull();
  });

  it("'I've reviewed them' closes the notice", async () => {
    notices.getMyNotices.mockResolvedValue([notice]);
    notices.acknowledgeNotice.mockResolvedValue();
    renderDashboard();
    fireEvent.click(await screen.findByRole("button", { name: /reviewed them/i }));
    await waitFor(() => expect(notices.acknowledgeNotice).toHaveBeenCalledWith("n1"));
    expect(await screen.findByText(/thanks for reviewing/i)).toBeInTheDocument();
  });

  it("shows nothing when there is no notice", async () => {
    notices.getMyNotices.mockResolvedValue([]);
    renderDashboard();
    await screen.findByText(/of 0 granted/i);
    expect(screen.queryByRole("region", { name: /privacy policy updated/i })).toBeNull();
  });
});
