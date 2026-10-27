import type { Interval, Queue, TimeUnit, Topic } from "../types";

const hourMs = 3_600_000;
const unitMs: Record<TimeUnit, number> = {
  hour: hourMs,
  day: 24 * hourMs,
  week: 168 * hourMs,
  month: 720 * hourMs,
};
const short: Record<TimeUnit, string> = { hour: "h", day: "d", week: "w", month: "mo" };
const long: Record<TimeUnit, string> = { hour: "Hour", day: "Day", week: "Week", month: "Month" };

const spelled = (i: Interval) => `${i.value} ${long[i.unit]}${i.value === 1 ? "" : "s"}`;
export const shortLabel = ({ interval: i, random }: Queue) =>
  random ? "Random" : i ? `${i.value}${short[i.unit]}` : "Done";
export const longLabel = ({ interval: i, random }: Queue) =>
  !i ? "No more reviews" : random ? `Randomly after ${spelled(i).toLowerCase()}` : spelled(i);
const sameInterval = (a: Interval | null, b: Interval | null) =>
  a === b || (!!a && !!b && a.unit === b.unit && a.value === b.value);
export function queueLabel(q: Queue, queues: Queue[]) {
  if (q.name) return q.name;
  const twins = queues
    .filter((x) => !x.name && (q.random ? x.random : !x.random && sameInterval(x.interval, q.interval)))
    .sort((a, b) => a.createdOrder - b.createdOrder);
  const k = twins.findIndex((x) => x.id === q.id);
  return k > 0 ? `${shortLabel(q)}(${k})` : shortLabel(q);
}
export function addDuration(date: Date, i: Interval): Date {
  if (i.unit !== "month") return new Date(date.getTime() + i.value * unitMs[i.unit]);
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + i.value);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
// Approximate length, for ordering only. Random queues sort after the timed ones, parking queues last.
export const approxMs = (q: Queue) => (q.interval ? q.interval.value * unitMs[q.interval.unit] : Infinity);
const rank = (q: Queue) => (!q.interval ? 2 : q.random ? 1 : 0);
export const byDuration = (queues: Queue[]) =>
  [...queues].sort(
    (a, b) => rank(a) - rank(b) || approxMs(a) - approxMs(b) || a.createdOrder - b.createdOrder,
  );
export const findQueue = (topic: Topic, id: string) => topic.queues.find((q) => q.id === id);
