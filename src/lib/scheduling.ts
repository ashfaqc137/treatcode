import type { Settings, StudyItem } from "../types";
import { addDuration, findQueue } from "./queues";

export const hourMs = 3_600_000;
export const dayMs = 86_400_000;
export function dueAt(item: StudyItem, settings: Settings): Date | null {
  const queue = findQueue(settings, item.status);
  if (!queue || !item.lastAttemptedAt) return null;
  return addDuration(new Date(item.lastAttemptedAt), queue);
}
export function intervalMs(item: StudyItem, settings: Settings) {
  const due = dueAt(item, settings);
  return due ? due.getTime() - new Date(item.lastAttemptedAt!).getTime() : 0;
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
  if (isEligible(item, now, settings)) {
    const late = overdueMs(item, now, settings);
    return late < dayMs
      ? `Due (${Math.floor(late / hourMs)}h overdue)`
      : `Due (${Math.floor(late / dayMs)}d overdue)`;
  }
  return `Due ${due.toLocaleString()}`;
}
