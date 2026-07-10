import { ApiError, getApiErrorMessage } from "../../lib/api";
import type { AdminLogQuery } from "../../lib/types";


export const ADMIN_TOKEN_KEY = "sdu-electricity-admin-token";
export const ADMIN_THEME_KEY = "sdu-electricity-theme";

export type AdminView = "status" | "users" | "rooms" | "tokens" | "smtp" | "settings" | "account" | "audit";
export type SortDirection = "asc" | "desc";
export type LogFilters = Required<Pick<AdminLogQuery, "days" | "limit" | "q" | "sort">>;

export const DEFAULT_LOG_FILTERS: LogFilters = { days: 7, limit: 200, q: "", sort: "desc" };

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function matchesSearch(search: string, values: unknown[]) {
  const keyword = normalizeText(search);
  if (!keyword) {
    return true;
  }
  return values.some((value) => normalizeText(value).includes(keyword));
}

export function compareText(a: unknown, b: unknown, direction: SortDirection = "asc") {
  const result = normalizeText(a).localeCompare(normalizeText(b), "zh-CN", { numeric: true, sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

export function compareNumber(a: number, b: number, direction: SortDirection = "asc") {
  const result = a - b;
  return direction === "asc" ? result : -result;
}

export function compareDate(a?: string | null, b?: string | null, direction: SortDirection = "desc") {
  const left = a ? new Date(a).getTime() : 0;
  const right = b ? new Date(b).getTime() : 0;
  const result = left - right;
  return direction === "asc" ? result : -result;
}

export function describeError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return "服务器处理失败，请稍后再试。";
    }
    if (typeof error.detail === "string") {
      return error.detail;
    }
    return getApiErrorMessage(error);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "操作失败，请稍后再试。";
}

export function healthTone(status?: string | null): "success" | "warning" | "danger" | "muted" {
  if (status === "healthy") return "success";
  if (status === "warning") return "warning";
  if (status === "invalid") return "danger";
  return "muted";
}

export function healthLabel(status?: string | null) {
  if (status === "healthy") return "正常";
  if (status === "warning") return "警告";
  if (status === "invalid") return "失效";
  return "未知";
}
