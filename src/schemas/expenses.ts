/**
 * Shared Zod schemas for expense listing — issue #710.
 *
 * The pagination query schema lives in `src/lib/pagination.ts` and is
 * re-exported here for a single import point. Expense-specific filters
 * (asset, status, date range, total count) are added via `.extend()`.
 *
 * The route file imports these for both handler parsing and its OpenAPI
 * annotations, so the documented shape and the enforced shape are the
 * same objects and cannot drift.
 */

import { z } from "zod";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationQuerySchema,
  type PaginationQuery,
  type PageMeta,
  type SortOrder,
} from "../lib/pagination";

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

/** Assets a caller may filter by. */
export const FILTERABLE_ASSETS = ["XLM", "USDC"] as const;

/** Settlement states an expense can be in. */
export const EXPENSE_STATUSES = ["PENDING", "SETTLED"] as const;

// ---------------------------------------------------------------------------
// Expense list query schema
// ---------------------------------------------------------------------------

/**
 * Query parameters for the group expense list.
 *
 * Extends the shared pagination schema so cursor/limit/order behave
 * identically to every other paginated route; the filters are additive.
 */
export const expenseListQuerySchema = paginationQuerySchema.extend({
  asset: z.enum(FILTERABLE_ASSETS).optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  /**
   * Opt-in total count. Counting a filtered set is a second query over
   * every matching row, which the pagination contract deliberately avoids
   * paying on every request — so clients that need a total ask for it
   * explicitly.
   */
  includeTotal: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value) => value === true || value === "true")
    .optional(),
});

export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;

export {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationQuerySchema,
  type PaginationQuery,
  type PageMeta,
  type SortOrder,
};
