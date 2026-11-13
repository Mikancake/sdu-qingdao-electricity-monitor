import type { CheckAttempt } from "./types";
import { formatDateTime, formatKwh } from "./utils";

const sourceLabels: Record<string, string> = {
  user: "手动",
  worker: "自动",
  admin: "管理",
  cli: "命令行"
};

export function formatCheckSource(source: string) {
  return sourceLabels[source] ?? source;
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
      attempt.success ? "已保存读数" : attempt.error_msg ?? attempt.error_kind ?? "未知错误"
    ])
  ];

  function csvCell(value: unknown) {
    const text = String(value ?? "");
    const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${protectedText.replace(/"/g, '""')}"`;
  }

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
