import type { Entry, Queue } from "../types";
import { addDuration } from "./queues";

export const minuteMs = 60_000;
export const hourMs = 3_600_000;
export const dayMs = 86_400_000;
export function dueAt(entry: Entry, queue: Queue | undefined): Date | null {
  return queue?.interval ? addDuration(new Date(entry.movedAt), queue.interval) : null;
}
export function isDue(entry: Entry, queue: Queue | undefined, now: Date) {
  const due = dueAt(entry, queue);
  return due !== null && due.getTime() <= now.getTime();
}
export function span(ms: number) {
  if (ms < hourMs) return `${Math.max(1, Math.floor(ms / minuteMs))}m`;
  if (ms < dayMs) return `${Math.floor(ms / hourMs)}h`;
  return `${Math.floor(ms / dayMs)}d`;
}
export function formatDue(entry: Entry, queue: Queue | undefined, now: Date) {
  const due = dueAt(entry, queue);
  if (!due) return "";
  const diff = due.getTime() - now.getTime();
  if (diff > 0) return `in ${span(diff)}`;
  return -diff < hourMs ? "due now" : `${span(-diff)} overdue`;
}
