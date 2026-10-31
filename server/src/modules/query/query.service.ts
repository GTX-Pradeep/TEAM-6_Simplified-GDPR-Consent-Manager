import type { ConsentAction, AuditOutcome, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { AuditFilter, ConsentFilter, PageQuery } from "./query.schemas";

/**
 * Read-only views for the DPO / auditor (FR-18). Nothing here changes data.
 * Both lists are newest first and paged (at most 100 rows per page).
 */

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ConsentRecordRow {
  id: string;
  action: ConsentAction;
  recordedAt: Date;
  user: { id: string; name: string; email: string };
  purpose: { id: string; code: string; name: string };
  policyVersion: { id: string; versionNo: string };
  hash: string;
}

export interface AuditRow {
  id: string;
  createdAt: Date;
  actor: { id: string; name: string; email: string } | null;
  action: string;
  targetType: string;
  targetId: string;
  outcome: AuditOutcome;
  details: Prisma.JsonValue;
  prevHash: string;
  hash: string;
}

const skipTake = ({ page, pageSize }: PageQuery) => ({ skip: (page - 1) * pageSize, take: pageSize });

export async function listConsentRecords(
  q: PageQuery,
  where: Prisma.ConsentRecordWhereInput = {},
): Promise<Page<ConsentRecordRow>> {
  const [rows, total] = await prisma.$transaction([
    prisma.consentRecord.findMany({
      where,
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
      ...skipTake(q),
      include: {
        user: { select: { id: true, name: true, email: true } },
        purpose: { select: { id: true, code: true, name: true } },
        policyVersion: { select: { id: true, versionNo: true } },
      },
    }),
    prisma.consentRecord.count({ where }),
  ]);
  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((r) => ({
      id: r.id.toString(),
      action: r.action,
      recordedAt: r.recordedAt,
      user: r.user,
      purpose: r.purpose,
      policyVersion: r.policyVersion,
      hash: r.hash,
    })),
  };
}

export async function listAuditEntries(
  q: PageQuery,
  where: Prisma.AuditEntryWhereInput = {},
): Promise<Page<AuditRow>> {
  const [rows, total] = await prisma.$transaction([
    prisma.auditEntry.findMany({
      where,
      orderBy: { id: "desc" },
      ...skipTake(q),
      include: { actor: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditEntry.count({ where }),
  ]);
  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((r) => ({
      id: r.id.toString(),
      createdAt: r.createdAt,
      actor: r.actor,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      outcome: r.outcome,
      details: r.details,
      prevHash: r.prevHash,
      hash: r.hash,
    })),
  };
}

/** FR-19: turns the consent filters into a database query (all parameterised by Prisma). */
export function consentWhere(f: Omit<ConsentFilter, "page" | "pageSize">): Prisma.ConsentRecordWhereInput {
  const where: Prisma.ConsentRecordWhereInput = {};
  if (f.user) {
    where.user = {
      OR: [
        { email: { contains: f.user, mode: "insensitive" } },
        { name: { contains: f.user, mode: "insensitive" } },
      ],
    };
  }
  if (f.purpose) where.purpose = { code: { equals: f.purpose, mode: "insensitive" } };
  if (f.action) where.action = f.action;
  if (f.policyVersion) where.policyVersion = { versionNo: f.policyVersion };
  if (f.from || f.to) where.recordedAt = { ...(f.from && { gte: f.from }), ...(f.to && { lt: f.to }) };
  return where;
}

/** FR-19: turns the audit filters into a database query. */
export function auditWhere(f: Omit<AuditFilter, "page" | "pageSize">): Prisma.AuditEntryWhereInput {
  const where: Prisma.AuditEntryWhereInput = {};
  if (f.actor) {
    where.actor = {
      OR: [
        { email: { contains: f.actor, mode: "insensitive" } },
        { name: { contains: f.actor, mode: "insensitive" } },
      ],
    };
  }
  if (f.action) where.action = { equals: f.action, mode: "insensitive" };
  if (f.outcome) where.outcome = f.outcome;
  if (f.from || f.to) where.createdAt = { ...(f.from && { gte: f.from }), ...(f.to && { lt: f.to }) };
  return where;
}
