/**
 * Expense listing: query construction, filtering, and pagination.
 *
 * The route stays thin — it authorizes, parses, and serializes. Everything
 * about *which* rows a page contains lives here so the filter semantics have
 * one home and can be tested without an HTTP server.
 *
 * Pagination follows `src/lib/pagination.ts` unchanged: a `(createdAt, id)`
 * cursor, `limit + 1` rows to detect a further page, and the shared `meta`
 * shape. Filters compose with the cursor rather than replacing it, so a
 * filtered scan pages exactly like an unfiltered one.
 */
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { Errors } from "../errors";
import {
  buildPage,
  cursorFilter,
  cursorOrderBy,
  requireCursor,
  takeForPage,
  type PageMeta,
} from "../lib/pagination";
import { expenseListQuerySchema } from "../schemas/expenses";

export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
export { expenseListQuerySchema };

export const EXPENSE_STATUSES = ["PENDING", "SETTLED"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

const SHARE_SETTLED = "settled";

export const FILTERABLE_ASSETS = ["XLM", "USDC"] as const;

export function expenseStatusFilter(status: string): Prisma.ExpenseWhereInput {
  if (status.toUpperCase() === "SETTLED") {
    return {
      shares: {
        some: {},
        every: { status: SHARE_SETTLED },
      },
    };
  }
  return {
    shares: { some: { status: { not: SHARE_SETTLED } } },
  };
}

function dateFilter(
  startDate: string | undefined,
  endDate: string | undefined
): Prisma.ExpenseWhereInput {
  if (!startDate && !endDate) return {};
  return {
    createdAt: {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    },
  };
}

export function assertValidRange(
  startDate: string | undefined,
  endDate: string | undefined
): void {
  if (!startDate || !endDate) return;
  if (new Date(startDate) > new Date(endDate)) {
    throw Errors.badRequest("invalid_range", "startDate must not be after endDate");
  }
}

export function expenseFilters(
  groupId: string,
  query: Pick<ExpenseListQuery, "asset" | "status" | "startDate" | "endDate">
): Prisma.ExpenseWhereInput[] {
  return [
    { groupId },
    ...(query.asset ? [{ assetCode: query.asset }] : []),
    ...(query.status ? [expenseStatusFilter(query.status)] : []),
    ...(query.startDate || query.endDate
      ? [dateFilter(query.startDate, query.endDate)]
      : []),
  ];
}

export async function listGroupExpenses<T extends { createdAt: Date; id: string }>(
  groupId: string,
  query: ExpenseListQuery,
  include: Prisma.ExpenseInclude
): Promise<{ items: T[]; meta: PageMeta & { total?: number } }> {
  assertValidRange(query.startDate, query.endDate);

  const position = requireCursor(query.cursor);
  const filters = expenseFilters(groupId, query);

  const cursorCondition = cursorFilter(position, query.order);
  const where: Prisma.ExpenseWhereInput =
    filters.length === 1
      ? { groupId, ...cursorCondition }
      : { AND: [...filters, cursorCondition] };

  const rows = (await prisma.expense.findMany({
    where,
    include,
    orderBy: cursorOrderBy(query.order),
    take: takeForPage(query.limit),
  })) as unknown as T[];

  const { items, meta } = buildPage(rows, query.limit, query.order);

  if (!query.includeTotal) {
    return { items, meta };
  }

  const total = await prisma.expense.count({
    where: filters.length === 1 ? { groupId } : { AND: filters },
  });
  return { items, meta: { ...meta, total } };
}

export {
  expensePaymentIntent,
  validateExpenseXdr,
  type ExpenseIntentRecord,
} from "./expense-xdr";
