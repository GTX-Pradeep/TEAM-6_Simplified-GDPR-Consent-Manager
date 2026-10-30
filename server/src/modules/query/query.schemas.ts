import { z } from "zod";

/** Paging for the DPO console (FR-18). Search filters are added in issue #26. */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
