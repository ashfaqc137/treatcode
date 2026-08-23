import type { Settings, StudyItem, ReviewStatus } from "../types";
import { dayMs, dueAt, isEligible, overdueMs } from "./scheduling";

const priority: ReviewStatus[] = ["RD", "R3", "R2", "R1"];
const oldest = (items: StudyItem[]) =>
  [...items].sort((a, b) => (a.lastAttemptedAt ?? "").localeCompare(b.lastAttemptedAt ?? ""))[0];

export function pickNextRevision(items: StudyItem[], now: Date, settings: Settings): StudyItem | null {
  const eligible = items.filter((item) => isEligible(item, now, settings));
  const starving = eligible.filter((item) => {
    const interval = settings.intervals[item.status as ReviewStatus] * dayMs;
    return overdueMs(item, now, settings) >= settings.starvationMultiplier * interval;
  });
  if (starving.length)
    return [...starving].sort((a, b) => overdueMs(b, now, settings) - overdueMs(a, now, settings))[0];
  for (const status of priority) {
    const candidate = oldest(eligible.filter((item) => item.status === status));
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
      .filter((item) => item.status !== "NEW")
      .sort(
        (a, b) => (dueAt(a, settings)?.getTime() ?? Infinity) - (dueAt(b, settings)?.getTime() ?? Infinity),
      )[0] ?? null
  );
}
