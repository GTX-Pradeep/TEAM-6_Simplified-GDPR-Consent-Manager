
import { api } from "./client";

export type ConsentStatus = "GRANTED" | "WITHDRAWN" | "NOT_GIVEN";

export interface PurposeState {
  purpose: { id: string; code: string; name: string; description: string };
  status: ConsentStatus;
  updatedAt: string | null;
  policyVersion: { id: string; versionNo: string } | null;
}

export interface MyConsents {
  purposes: PurposeState[];
  currentPolicy: { id: string; versionNo: string } | null;
}

/** GET /me/consents - my current choice for every active purpose (FR-4). */
export async function getMyConsents(): Promise<MyConsents> {
  const { data } = await api.get<MyConsents>("/me/consents");
  return data;
}

/** POST /me/consents - grant or withdraw one purpose (FR-7, FR-8). */
export async function setConsent(
  purposeId: string,
  action: "GRANTED" | "WITHDRAWN",
) {
  const { data } = await api.post<{
    consent: {
      id: string;
      action: string;
      recordedAt: string;
      policyVersion: { versionNo: string };
    };
  }>("/me/consents", { purposeId, action });

  return data.consent;
}

/** One entry in the user's consent history (FR-12). */
export interface ConsentHistoryItem {
  id: string;
  action: "GRANTED" | "WITHDRAWN";
  recordedAt: string;
  purpose: {
    id: string;
    code: string;
    name: string;
  };
  policyVersion: {
    id: string;
    versionNo: string;
  };
}

/** GET /me/consents/history - retrieve consent history (FR-12). */
export async function getConsentHistory(
  limit = 100,
): Promise<ConsentHistoryItem[]> {
  const { data } = await api.get<{ history: ConsentHistoryItem[] }>(
    "/me/consents/history",
    { params: { limit } },
  );

  return data.history;
}
