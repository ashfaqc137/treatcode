import type { Queue, Settings, TimeUnit } from "../types";

const hourMs = 3_600_000;
const unitMs: Record<TimeUnit, number> = {
  hour: hourMs,
  day: 24 * hourMs,
  week: 168 * hourMs,
  month: 720 * hourMs,
};
const short: Record<TimeUnit, string> = { hour: "h", day: "d", week: "w", month: "mo" };
const long: Record<TimeUnit, string> = { hour: "Hour", day: "Day", week: "Week", month: "Month" };

export const shortLabel = (q: Queue) => `${q.value}${short[q.unit]}`;
export const longLabel = (q: Queue) => `${q.value} ${long[q.unit]}${q.value === 1 ? "" : "s"}`;
export function queueLabel(q: Queue, queues: Queue[]) {
  if (q.name) return q.name;
  const twins = queues
    .filter((x) => !x.name && x.unit === q.unit && x.value === q.value)
    .sort((a, b) => a.createdOrder - b.createdOrder);
  const k = twins.findIndex((x) => x.id === q.id);
  return k > 0 ? `${shortLabel(q)}(${k})` : shortLabel(q);
}
export function addDuration(date: Date, q: Queue): Date {
  if (q.unit !== "month") return new Date(date.getTime() + q.value * unitMs[q.unit]);
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + q.value);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
// Approximate length, for ordering only.
export const approxMs = (q: Queue) => q.value * unitMs[q.unit];
export const byPriority = (queues: Queue[]) =>
  [...queues].sort((a, b) => approxMs(b) - approxMs(a) || a.createdOrder - b.createdOrder);
export const byDuration = (queues: Queue[]) =>
  [...queues].sort((a, b) => approxMs(a) - approxMs(b) || a.createdOrder - b.createdOrder);
export const findQueue = (settings: Settings, id: string) => settings.queues.find((q) => q.id === id);
