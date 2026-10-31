import { api } from "./client";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ConsentRecordRow {
  id: string;
  action: "GRANTED" | "WITHDRAWN";
  recordedAt: string;
  user: { id: string; name: string; email: string };
  purpose: { id: string; code: string; name: string };
  policyVersion: { id: string; versionNo: string };
  hash: string;
}

export interface AuditRow {
  id: string;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
  action: string;
  targetType: string;
  targetId: string;
  outcome: "SUCCESS" | "FAILURE";
  details: unknown;
  prevHash: string;
  hash: string;
}

export type PageParams = { page?: number; pageSize?: number } & Record<string, string | number | undefined>;

/** GET /consents - all consent records, newest first (FR-18). */
export async function listConsentRecords(params: PageParams = {}): Promise<Page<ConsentRecordRow>> {
  const { data } = await api.get<Page<ConsentRecordRow>>("/consents", { params });
  return data;
}

/** GET /audit - the audit trail, newest first (FR-17, FR-18). */
export async function listAuditEntries(params: PageParams = {}): Promise<Page<AuditRow>> {
  const { data } = await api.get<Page<AuditRow>>("/audit", { params });
  return data;
}

export interface ChainReport {
  ok: boolean;
  checked: number;
  firstBrokenId: string | null;
  reason: "HASH_MISMATCH" | "BROKEN_LINK" | null;
}

export interface IntegrityReport {
  ok: boolean;
  checkedAt: string;
  audit: ChainReport;
  consents: ChainReport;
}

/** GET /audit/verify - recomputes both SHA-256 hash chains (SEC-6). */
export async function verifyIntegrity(): Promise<IntegrityReport> {
  const { data } = await api.get<IntegrityReport>("/audit/verify");
  return data;
}

export interface PurposeStateAt {
  purpose: { id: string; code: string; name: string; isActive: boolean };
  status: "GRANTED" | "WITHDRAWN" | "NOT_GIVEN";
  decidedAt: string | null;
  recordId: string | null;
  policyVersion: { id: string; versionNo: string } | null;
}

export interface ConsentStateAt {
  user: { id: string; name: string; email: string };
  at: string;
  policyInForce: { id: string; versionNo: string; effectiveAt: string | null } | null;
  purposes: PurposeStateAt[];
}

/** GET /users/lookup?email= */
export async function lookupUser(email: string): Promise<{ id: string; name: string; email: string }> {
  const { data } = await api.get<{ user: { id: string; name: string; email: string } }>("/users/lookup", {
    params: { email },
  });
  return data.user;
}

/** GET /users/:id/consent-state?at= - FR-20 time travel. */
export async function getConsentStateAt(userId: string, at: Date): Promise<ConsentStateAt> {
  const { data } = await api.get<ConsentStateAt>(`/users/${userId}/consent-state`, { params: { at: at.toISOString() } });
  return data;
}
