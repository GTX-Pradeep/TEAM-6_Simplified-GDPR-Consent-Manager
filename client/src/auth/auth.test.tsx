import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import App from "../App";
import * as authApi from "../api/auth";
import { validate } from "../pages/RegisterPage";

/** Tests for issue #14 (FR-1, FR-2, FR-3; TC-AUTH-01..03 on the UI side). */

vi.mock("../api/client", () => ({
  api: {},
  getHealth: vi.fn().mockResolvedValue({ status: "ok", db: "up", time: new Date().toISOString() }),
}));
vi.mock("../api/policies", () => ({ listPolicies: vi.fn().mockResolvedValue([]), getCurrentPolicy: vi.fn() }));
vi.mock("../api/consents", () => ({
  getMyConsents: vi.fn().mockResolvedValue({ purposes: [], currentPolicy: null }),
  setConsent: vi.fn(),
}));
vi.mock("../api/auth", async (orig) => ({
  ...(await orig<typeof import("../api/auth")>()),
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

const api = vi.mocked(authApi);
const asha = { id: "u1", name: "Asha User", email: "user@demo.com", role: "USER" as const };
const ravi = { id: "a1", name: "Ravi Admin", email: "admin@demo.com", role: "ADMIN" as const };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** An error shaped like the API's JSON error. */
function apiError(status: number, code: string, message: string, details?: unknown) {
  return Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status, data: { error: { code, message, details } } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.me.mockResolvedValue(null);
});

describe("login (FR-2)", () => {
  const fill = (email: string, password: string) => {
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: email } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: password } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));
  };

  it("a USER lands on the consent dashboard", async () => {
    api.login.mockResolvedValue(asha);
    renderAt("/login");
    fill("user@demo.com", "Demo@12345");
    expect(await screen.findByRole("heading", { name: /hello, asha/i })).toBeInTheDocument();
    expect(api.login).toHaveBeenCalledWith({ email: "user@demo.com", password: "Demo@12345" });
  });

  it("an ADMIN lands on the admin console", async () => {
    api.login.mockResolvedValue(ravi);
    renderAt("/login");
    fill("admin@demo.com", "Demo@12345");
    expect(await screen.findByRole("heading", { name: /privacy policy versions/i })).toBeInTheDocument();
  });

  it("shows the server's message for wrong credentials or a locked account", async () => {
    api.login.mockRejectedValueOnce(apiError(401, "INVALID_CREDENTIALS", "E-mail or password is incorrect"));
    renderAt("/login");
    fill("user@demo.com", "nope-nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("E-mail or password is incorrect");

    api.login.mockRejectedValueOnce(apiError(423, "ACCOUNT_LOCKED", "Too many failed attempts. Try again in 15 minutes."));
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/15 minutes/);
  });

  it("asks for both fields before calling the API", async () => {
    renderAt("/login");
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/enter your e-mail/i);
    expect(api.login).not.toHaveBeenCalled();
  });
});

describe("register (FR-1)", () => {
  it("validates the form like the API does", () => {
    expect(validate({ name: "", email: "x", password: "short", confirm: "other" })).toEqual({
      name: expect.any(String),
      email: expect.any(String),
      password: expect.any(String),
      confirm: expect.any(String),
    });
    expect(validate({ name: "A", email: "a@b.co", password: "12345678", confirm: "12345678" })).toEqual({});
  });

  it("creates the account and opens the dashboard", async () => {
    api.register.mockResolvedValue(asha);
    renderAt("/register");
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Asha User" } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "user@demo.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "Demo@12345" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "Demo@12345" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByRole("heading", { name: /hello, asha/i })).toBeInTheDocument();
  });

  it("shows 'e-mail already used' from the API", async () => {
    api.register.mockRejectedValue(apiError(409, "EMAIL_TAKEN", "An account with this e-mail already exists"));
    renderAt("/register");
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Asha" } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "user@demo.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "Demo@12345" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "Demo@12345" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/);
  });
});

describe("protected pages and logout (FR-3)", () => {
  it("sends a visitor who is not logged in to the login page", async () => {
    renderAt("/dashboard");
    expect(await screen.findByRole("heading", { name: /log in/i })).toBeInTheDocument();
  });

  it("sends a USER away from the admin console to their own dashboard", async () => {
    api.me.mockResolvedValue(asha);
    renderAt("/admin");
    expect(await screen.findByRole("heading", { name: /hello, asha/i })).toBeInTheDocument();
  });

  it("logging out ends the session and returns to the login page", async () => {
    api.me.mockResolvedValue(asha);
    api.logout.mockResolvedValue();
    renderAt("/dashboard");
    fireEvent.click(await screen.findByRole("button", { name: /log out/i }));
    await waitFor(() => expect(api.logout).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: /log in/i })).toBeInTheDocument();
  });
});
