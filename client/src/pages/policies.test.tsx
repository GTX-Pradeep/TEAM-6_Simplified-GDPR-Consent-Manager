import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import App from "../App";
import * as authApi from "../api/auth";
import * as policiesApi from "../api/policies";
import type { Policy } from "../api/policies";
import { nextVersion } from "./AdminPoliciesPage";

/** Tests for issue #12 (FR-5, FR-13, FR-14, FR-15 on the UI side; TC-POL-*). */

vi.mock("../api/client", () => ({
  api: {},
  getHealth: vi.fn().mockResolvedValue({ status: "ok", db: "up", time: new Date().toISOString() }),
}));
vi.mock("../api/auth", async (orig) => ({ ...(await orig<typeof import("../api/auth")>()), me: vi.fn() }));
vi.mock("../api/policies", () => ({
  getCurrentPolicy: vi.fn(),
  listPolicies: vi.fn(),
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  publishPolicy: vi.fn(),
}));

const auth = vi.mocked(authApi);
const api = vi.mocked(policiesApi);

const v1: Policy = {
  id: "pol-1",
  versionNo: "1.0",
  title: "Privacy Policy",
  body: "1. Who we are\nTeam 6.",
  changeSummary: "First published version.",
  status: "PUBLISHED",
  effectiveAt: "2026-10-20T09:00:00.000Z",
  createdAt: "2026-10-20T09:00:00.000Z",
};
const draft: Policy = { ...v1, id: "pol-2", versionNo: "2.0", status: "DRAFT", effectiveAt: null, changeSummary: "Adds analytics" };

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const asAdmin = () => auth.me.mockResolvedValue({ id: "a1", name: "Ravi Admin", email: "admin@demo.com", role: "ADMIN" });
const asUser = () => auth.me.mockResolvedValue({ id: "u1", name: "Asha User", email: "user@demo.com", role: "USER" });

beforeEach(() => vi.clearAllMocks());

describe("policy page (FR-5)", () => {
  it("shows the current version, its date and text", async () => {
    asUser();
    api.getCurrentPolicy.mockResolvedValue(v1);
    renderAt("/policy");
    expect(await screen.findByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("Version 1.0")).toBeInTheDocument();
    expect(screen.getByText(/who we are/i)).toBeInTheDocument();
  });

  it("says so when nothing is published yet", async () => {
    asUser();
    api.getCurrentPolicy.mockRejectedValue(Object.assign(new Error("404"), { isAxiosError: true, response: { status: 404 } }));
    renderAt("/policy");
    expect(await screen.findByText(/no privacy policy has been published yet/i)).toBeInTheDocument();
  });
});

describe("admin policy editor (FR-13, FR-14, FR-15)", () => {
  it("lists versions; published ones are locked, drafts can be edited and published", async () => {
    asAdmin();
    api.listPolicies.mockResolvedValue([draft, v1]);
    renderAt("/admin");

    const rowDraft = (await screen.findByText("v2.0")).closest("tr") as HTMLElement;
    const rowV1 = screen.getByText("v1.0").closest("tr") as HTMLElement;
    expect(within(rowDraft).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(rowDraft).getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(within(rowV1).getByText("Locked")).toBeInTheDocument();
    expect(within(rowV1).queryByRole("button")).toBeNull();
  });

  it("creates a new draft with the next version number pre-filled", async () => {
    asAdmin();
    api.listPolicies.mockResolvedValueOnce([v1]).mockResolvedValueOnce([draft, v1]);
    api.createDraft.mockResolvedValue(draft);
    renderAt("/admin");

    await screen.findByText("v1.0"); // wait until the list has loaded
    fireEvent.click(screen.getByRole("button", { name: "New draft" }));
    expect(screen.getByLabelText("Version")).toHaveValue("2.0");
    fireEvent.change(screen.getByLabelText("What changed"), { target: { value: "Adds analytics" } });
    fireEvent.change(screen.getByLabelText("Policy text"), { target: { value: "New text" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(api.createDraft).toHaveBeenCalledWith({
        versionNo: "2.0",
        title: "Privacy Policy",
        changeSummary: "Adds analytics",
        body: "New text",
      }),
    );
    expect(await screen.findByText("Draft v2.0 saved.")).toBeInTheDocument();
  });

  it("publishing asks for confirmation first", async () => {
    asAdmin();
    api.listPolicies.mockResolvedValue([draft, v1]);
    api.publishPolicy.mockResolvedValue({ ...draft, status: "PUBLISHED" });
    renderAt("/admin");

    const row = (await screen.findByText("v2.0")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Publish" }));
    expect(api.publishPolicy).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: "Confirm publish" }));
    await waitFor(() => expect(api.publishPolicy).toHaveBeenCalledWith("pol-2"));
    expect(await screen.findByText(/version 2.0 is now published/i)).toBeInTheDocument();
  });

  it("shows field errors from the API", async () => {
    asAdmin();
    api.listPolicies.mockResolvedValue([]);
    api.createDraft.mockRejectedValue(
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: { body: ["Policy text is required"] } } },
        },
      }),
    );
    renderAt("/admin");
    const newDraft = await screen.findByRole("button", { name: "New draft" });
    await waitFor(() => expect(newDraft).toBeEnabled());
    fireEvent.click(newDraft);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Policy text is required")).toBeInTheDocument();
  });

  it("a USER cannot open the admin screen", async () => {
    asUser();
    renderAt("/admin");
    await waitFor(() => expect(api.listPolicies).not.toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: /privacy policy versions/i })).toBeNull();
  });

  it("suggests the next major version", () => {
    expect(nextVersion([])).toBe("1.0");
    expect(nextVersion([v1, { ...v1, versionNo: "2.1" }])).toBe("3.0");
  });
});
