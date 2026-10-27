import type { Entry, Queue } from "../types";
import { addDuration } from "./queues";

export const minuteMs = 60_000;
export const hourMs = 3_600_000;
export const dayMs = 86_400_000;
// A stable fraction in [0, 1) per stay in a queue (FNV-1a), so a random due date is the same on every
// render and device, and re-rolls whenever the entry is moved.
function fraction(entry: Entry) {
  let h = 0x811c9dc5;
  for (const c of entry.id + entry.movedAt) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return (h >>> 0) / 2 ** 32;
}
export function earliestAt(entry: Entry, queue: Queue | undefined): Date | null {
  return queue?.interval ? addDuration(new Date(entry.movedAt), queue.interval) : null;
}
export function dueAt(entry: Entry, queue: Queue | undefined): Date | null {
  const min = earliestAt(entry, queue);
  if (!min || !queue?.random) return min;
  return new Date(min.getTime() + fraction(entry) * (min.getTime() - Date.parse(entry.movedAt)));
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
// Random queues keep their exact due date hidden until it arrives.
export function formatDue(entry: Entry, queue: Queue | undefined, now: Date) {
  const due = dueAt(entry, queue);
  if (!due) return "";
  const diff = due.getTime() - now.getTime();
  if (diff > 0 && queue?.random) {
    const wait = earliestAt(entry, queue)!.getTime() - now.getTime();
    return wait > 0 ? `in ${span(wait)}+` : "any day now";
  }
  if (diff > 0) return `in ${span(diff)}`;
  return -diff < hourMs ? "due now" : `${span(-diff)} overdue`;
}
