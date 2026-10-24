import { api } from "./client";

export type PolicyStatus = "DRAFT" | "PUBLISHED" | "SUPERSEDED";

export interface Policy {
  id: string;
  versionNo: string;
  title: string;
  body: string;
  changeSummary: string;
  status: PolicyStatus;
  effectiveAt: string | null;
  createdAt: string;
}

export type PolicyInput = Pick<Policy, "versionNo" | "title" | "body" | "changeSummary">;

/** FR-5: the policy in force. */
export async function getCurrentPolicy(): Promise<Policy> {
  const { data } = await api.get<{ policy: Policy }>("/policies/current");
  return data.policy;
}

/** FR-13: every version, newest first (ADMIN / DPO). */
export async function listPolicies(): Promise<Policy[]> {
  const { data } = await api.get<{ policies: Policy[] }>("/policies");
  return data.policies;
}

export async function createDraft(input: PolicyInput): Promise<Policy> {
  const { data } = await api.post<{ policy: Policy }>("/policies", input);
  return data.policy;
}

export async function updateDraft(id: string, input: Partial<PolicyInput>): Promise<Policy> {
  const { data } = await api.patch<{ policy: Policy }>(`/policies/${id}`, input);
  return data.policy;
}

/** FR-14: publish a draft; the previous version becomes SUPERSEDED. */
export async function publishPolicy(id: string): Promise<Policy> {
  const { data } = await api.post<{ policy: Policy }>(`/policies/${id}/publish`);
  return data.policy;
}
