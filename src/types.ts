export const STATUSES = ["NEW", "R1", "R2", "R3", "RD"] as const;
export const REVIEW_STATUSES = ["R1", "R2", "R3", "RD"] as const;
export type ItemStatus = (typeof STATUSES)[number];
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export interface AttemptHistory {
  attemptedAt: string;
  previousStatus: ItemStatus;
  resultingStatus: ReviewStatus;
}
export interface StudyItem {
  id: string;
  subjectId: string;
  title: string;
  status: ItemStatus;
  createdAt: string;
  createdOrder: number;
  lastAttemptedAt?: string;
  attemptCount: number;
  history: AttemptHistory[];
}
export interface Settings {
  intervals: Record<ReviewStatus, number>;
  starvationMultiplier: number;
}
export interface Subject {
  id: string;
  title: string;
  createdAt: string;
  settings: Settings;
}
export interface ActiveSession {
  subjectId: string;
  itemId?: string;
  startedAt: string;
  resolved: boolean;
}
export interface AppData {
  version: 2;
  subjects: Subject[];
  selectedSubjectId: string;
  items: StudyItem[];
  activeSession?: ActiveSession;
}
export const defaultSettings: Settings = {
  intervals: { R1: 1, R2: 2, R3: 4, RD: 10 },
  starvationMultiplier: 2,
};
export const defaultSubject = (): Subject => ({
  id: "default",
  title: "Default",
  createdAt: new Date().toISOString(),
  settings: structuredClone(defaultSettings),
});
export const emptyAppData = (): AppData => {
  const subject = defaultSubject();
  return { version: 2, subjects: [subject], selectedSubjectId: subject.id, items: [] };
};
