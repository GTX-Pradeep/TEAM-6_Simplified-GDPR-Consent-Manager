import { api } from "./client";

export interface PolicyNotice {
  id: string;
  createdAt: string;
  policy: { id: string; versionNo: string; title: string; changeSummary: string; effectiveAt: string | null };
  purposes: { id: string; code: string; name: string; grantedUnder: string }[];
}

/** GET /me/notices - open policy-change notices (FR-16). */
export async function getMyNotices(): Promise<PolicyNotice[]> {
  const { data } = await api.get<{ notices: PolicyNotice[] }>("/me/notices");
  return data.notices;
}

/** Keep my choices under the new version. */
export async function reconfirmNotice(id: string): Promise<{ reconfirmed: number }> {
  const { data } = await api.post<{ reconfirmed: number }>(`/me/notices/${id}/reconfirm`);
  return data;
}

/** "I've reviewed it" (after withdrawing what I no longer want). */
export async function acknowledgeNotice(id: string): Promise<void> {
  await api.post(`/me/notices/${id}/ack`);
}
