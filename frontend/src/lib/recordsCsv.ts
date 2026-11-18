import type { CheckAttempt } from "./types";
import { formatDateTime, formatKwh } from "./utils";

const sourceLabels: Record<string, string> = {
  user: "手动",
  manual: "手动",
  background: "后台自动",
  worker: "自动",
  admin: "管理",
  cli: "命令行"
};

export function formatCheckSource(source: string) {
  return Object.prototype.hasOwnProperty.call(sourceLabels, source) ? sourceLabels[source] : source;
}

export function describeCheckAttempt(attempt: CheckAttempt) {
  if (attempt.success) return attempt.reading_id != null ? "已保存读数" : "查询成功";
  return attempt.error_msg || attempt.error_kind || "未知错误";
}

export function buildRecordsCsv(attempts: CheckAttempt[]) {
  const rows = [
    ["时间", "宿舍", "来源", "电量", "状态", "详情"],
    ...attempts.map((attempt) => [
      formatDateTime(attempt.started_at),
      `${attempt.room.building_name} ${attempt.room.room_number}`,
      formatCheckSource(attempt.source),
      attempt.success ? formatKwh(attempt.balance) : "--",
      attempt.success ? "成功" : "失败",
      describeCheckAttempt(attempt)
    ])
  ];

  function csvCell(value: unknown) {
    const text = String(value ?? "");
    // Quoting alone doesn't prevent spreadsheet formulas. Some importers strip
    // leading whitespace/control characters before interpreting a cell.
    const protectedText = /^(?:[\t\r\n]|[\s\u0000-\u001f]*[=+@＝＋－＠-])/.test(text) ? `'${text}` : text;
    return `"${protectedText.replace(/"/g, '""')}"`;
  }

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
