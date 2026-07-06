import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKwh(value?: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  const number = Number(value);
  if (Number.isNaN(number)) {
    return "--";
  }
  return `${number.toFixed(2)} 度`;
}

export function formatDays(value?: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  const number = Number(value);
  if (Number.isNaN(number)) {
    return "--";
  }
  return `${number.toFixed(1)} 天`;
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "暂无记录";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
