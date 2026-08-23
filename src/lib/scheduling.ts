import type { ReviewStatus, Settings, StudyItem } from "../types";

export const dayMs = 86_400_000;
export function dueAt(item: StudyItem, settings: Settings): Date | null {
  if (item.status === "NEW" || !item.lastAttemptedAt) return null;
  return new Date(
    new Date(item.lastAttemptedAt).getTime() + (settings.intervals[item.status as ReviewStatus] + 1) * dayMs,
  );
}
export function isEligible(item: StudyItem, now: Date, settings: Settings) {
  const due = dueAt(item, settings);
  return due !== null && now.getTime() >= due.getTime();
}
export function overdueMs(item: StudyItem, now: Date, settings: Settings) {
  const due = dueAt(item, settings);
  return due ? Math.max(0, now.getTime() - due.getTime()) : 0;
}
export function formatDue(item: StudyItem, now: Date, settings: Settings) {
  const due = dueAt(item, settings);
  if (!due) return "Not scheduled";
  if (isEligible(item, now, settings))
    return `Due (${Math.floor(overdueMs(item, now, settings) / dayMs)}d overdue)`;
  return `Due ${due.toLocaleString()}`;
}
