import type { Settings, StudyItem } from "../types";
import { dueAt, intervalMs, isEligible, overdueMs } from "./scheduling";
import { byPriority } from "./queues";

const oldest = (items: StudyItem[]) =>
  [...items].sort((a, b) => (a.lastAttemptedAt ?? "").localeCompare(b.lastAttemptedAt ?? ""))[0];

export function pickNextRevision(items: StudyItem[], now: Date, settings: Settings): StudyItem | null {
  const eligible = items.filter((item) => isEligible(item, now, settings));
  const starving = eligible.filter(
    (item) => overdueMs(item, now, settings) >= settings.starvationMultiplier * intervalMs(item, settings),
  );
  if (starving.length)
    return [...starving].sort((a, b) => overdueMs(b, now, settings) - overdueMs(a, now, settings))[0];
  for (const queue of byPriority(settings.queues)) {
    const candidate = oldest(eligible.filter((item) => item.status === queue.id));
    if (candidate) return candidate;
  }
  return null;
}

export function nextFresh(items: StudyItem[]) {
  return (
    [...items].filter((item) => item.status === "NEW").sort((a, b) => a.createdOrder - b.createdOrder)[0] ??
    null
  );
}
export function nextUpcoming(items: StudyItem[], settings: Settings) {
  return (
    items
      .filter((item) => dueAt(item, settings))
      .sort((a, b) => dueAt(a, settings)!.getTime() - dueAt(b, settings)!.getTime())[0] ?? null
  );
}
