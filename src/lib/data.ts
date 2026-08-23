import {
  defaultSubject,
  emptyAppData,
  REVIEW_STATUSES,
  type AppData,
  type ItemStatus,
  type ReviewStatus,
  type StudyItem,
  type Subject,
} from "../types";
const norm = (title: string) => title.trim().toLocaleLowerCase();
const subjectItems = (data: AppData, subjectId: string) =>
  data.items.filter((item) => item.subjectId === subjectId);
function checkedTitles(data: AppData, subjectId: string, rawTitles: string[]) {
  const existing = new Set(subjectItems(data, subjectId).map((i) => norm(i.title)));
  const titles = rawTitles.map((x) => x.trim()).filter(Boolean);
  const duplicate = titles.find((title) => existing.has(norm(title)) || (existing.add(norm(title)), false));
  if (duplicate) throw new Error(`“${duplicate}” already exists in this subject.`);
  return titles;
}
export function addTitles(data: AppData, subjectId: string, rawTitles: string[], now = new Date()): AppData {
  const titles = checkedTitles(data, subjectId, rawTitles);
  const start = Math.max(-1, ...subjectItems(data, subjectId).map((i) => i.createdOrder)) + 1;
  return {
    ...data,
    items: [
      ...data.items,
      ...titles.map((title, i) => ({
        id: crypto.randomUUID(),
        subjectId,
        title,
        status: "NEW" as const,
        createdAt: now.toISOString(),
        createdOrder: start + i,
        attemptCount: 0,
        history: [],
      })),
    ],
  };
}
export function addDraftToSession(data: AppData, title: string, now = new Date()): AppData {
  const session = data.activeSession;
  if (!session) throw new Error("No active session.");
  const titles = checkedTitles(data, session.subjectId, [title]);
  const start = Math.max(-1, ...subjectItems(data, session.subjectId).map((i) => i.createdOrder)) + 1;
  const item: StudyItem = {
    id: crypto.randomUUID(),
    subjectId: session.subjectId,
    title: titles[0],
    status: "NEW",
    createdAt: now.toISOString(),
    createdOrder: start,
    attemptCount: 0,
    history: [],
  };
  return { ...data, items: [...data.items, item], activeSession: { ...session, itemId: item.id } };
}
export function classify(data: AppData, id: string, status: ReviewStatus, now = new Date()): AppData {
  return {
    ...data,
    items: data.items.map((item) =>
      item.id !== id
        ? item
        : {
            ...item,
            status,
            lastAttemptedAt: now.toISOString(),
            attemptCount: item.attemptCount + 1,
            history: [
              ...item.history,
              { attemptedAt: now.toISOString(), previousStatus: item.status, resultingStatus: status },
            ],
          },
    ),
    activeSession: data.activeSession ? { ...data.activeSession, resolved: true } : undefined,
  };
}
export function discardSessionItem(data: AppData): AppData {
  const session = data.activeSession;
  if (!session?.itemId) throw new Error("No session item to discard.");
  return {
    ...data,
    items: data.items.filter((item) => item.id !== session.itemId),
    activeSession: { ...session, resolved: true },
  };
}
export function startSession(data: AppData, subjectId: string, itemId?: string): AppData {
  if (data.activeSession) throw new Error("End the current session first.");
  return {
    ...data,
    selectedSubjectId: subjectId,
    activeSession: { subjectId, itemId, startedAt: new Date().toISOString(), resolved: false },
  };
}
export function endSession(data: AppData): AppData {
  if (!data.activeSession?.resolved)
    throw new Error("Classify or discard the session item before ending it.");
  return { ...data, activeSession: undefined };
}
export function createSubject(data: AppData, title: string): AppData {
  const clean = title.trim();
  if (!clean) throw new Error("Subject name is required.");
  if (data.subjects.some((s) => norm(s.title) === norm(clean)))
    throw new Error("A subject with this name already exists.");
  const subject: Subject = {
    id: crypto.randomUUID(),
    title: clean,
    createdAt: new Date().toISOString(),
    settings: structuredClone(defaultSubject().settings),
  };
  return { ...data, subjects: [...data.subjects, subject], selectedSubjectId: subject.id };
}
export function updateItem(data: AppData, id: string, title: string, status: ItemStatus): AppData {
  const item = data.items.find((x) => x.id === id);
  if (!item) return data;
  const clean = title.trim();
  if (!clean) throw new Error("Title is required.");
  if (subjectItems(data, item.subjectId).some((x) => x.id !== id && norm(x.title) === norm(clean)))
    throw new Error("An item with this title already exists in this subject.");
  return {
    ...data,
    items: data.items.map((x) =>
      x.id !== id
        ? x
        : { ...x, title: clean, status, lastAttemptedAt: status === "NEW" ? undefined : x.lastAttemptedAt },
    ),
  };
}
export function removeItem(data: AppData, id: string): AppData {
  return { ...data, items: data.items.filter((i) => i.id !== id) };
}
export function validateImport(value: unknown): AppData {
  if (!value || typeof value !== "object") throw new Error("Not a TreatCode export.");
  const raw = value as any;
  if (raw.version === 1 && Array.isArray(raw.items) && raw.settings) {
    const subject = defaultSubject();
    return validateImport({
      version: 2,
      subjects: [{ ...subject, settings: raw.settings }],
      selectedSubjectId: subject.id,
      items: raw.items.map((item: any) => ({ ...item, subjectId: subject.id })),
    });
  }
  const data = raw as AppData;
  if (
    data.version !== 2 ||
    !Array.isArray(data.subjects) ||
    !Array.isArray(data.items) ||
    !data.subjects.some((s) => s.id === data.selectedSubjectId)
  )
    throw new Error("Unsupported export format.");
  const ids = new Set(data.subjects.map((s) => s.id));
  const seen = new Set<string>();
  for (const item of data.items) {
    const key = `${item.subjectId}:${norm(item.title)}`;
    if (
      !ids.has(item.subjectId) ||
      !item.id ||
      !item.title?.trim() ||
      !["NEW", ...REVIEW_STATUSES].includes(item.status) ||
      !Number.isFinite(item.createdOrder) ||
      !Array.isArray(item.history) ||
      seen.has(key)
    )
      throw new Error("The import contains invalid or duplicate items.");
    seen.add(key);
  }
  for (const subject of data.subjects)
    for (const status of REVIEW_STATUSES)
      if (!Number.isFinite(subject.settings?.intervals?.[status]) || subject.settings.intervals[status] <= 0)
        throw new Error("Invalid subject settings.");
  return { ...data, activeSession: undefined };
}
export { emptyAppData };
