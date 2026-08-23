Build a complete browser-based web application for managing an adaptive learning and revision system.

The app should work for LeetCode problems, System Design topics, or any other study items. For now, a study item is simply a string.

## Core Constraints

- Frontend only.
- No backend.
- No server.
- No authentication.
- No external APIs.
- Persist all data in the browser.
- Prefer IndexedDB, with a clean storage abstraction.
- Data must survive page refreshes and browser restarts.
- Support JSON export and import.

Use:

- React
- TypeScript
- Vite

Use any minimal UI/styling approach that keeps the application clean and functional.

---

# Core Concept

There are five states:

```text
NEW
R1
R2
R3
RD
```

After attempting a problem, the user classifies their performance:

### R1 — Hard

The user struggled to even approach or solve it.

Review after:

```text
1 day
```

### R2 — Barely Solved

The user solved it, but with significant struggle.

Review after:

```text
2 days
```

### R3 — Somewhat Comfortable

The user solved it independently but was not fully comfortable.

Review after:

```text
4 days
```

### RD — Confident

The user recognized the approach and solved it comfortably.

Review after:

```text
10 days
```

An item can move between any queue after every attempt.

Examples:

```text
R1 → R2
R3 → RD
RD → R1
R2 → R1
```

There is no forced progression. The latest performance determines the next queue.

---

# Data Model

Use a model similar to:

```ts
type ItemStatus = "NEW" | "R1" | "R2" | "R3" | "RD";

interface StudyItem {
  id: string;
  title: string;

  status: ItemStatus;

  createdAt: string;

  lastAttemptedAt?: string;

  attemptCount: number;

  history: AttemptHistory[];
}

interface AttemptHistory {
  attemptedAt: string;

  previousStatus: ItemStatus;

  resultingStatus: ItemStatus;
}
```

Use ISO timestamps.

---

# Fresh Items

The user should be able to:

- Add a single fresh item.
- Add multiple items by pasting newline-separated text.
- View all fresh items.
- Edit an item.
- Delete an item.

Fresh items should be consumed in insertion order.

Prevent duplicate titles using trimmed, case-insensitive comparison.

The next fresh item is the oldest unattempted item.

After attempting a fresh item, it must be classified into:

```text
R1 / R2 / R3 / RD
```

---

# Revision Eligibility

An item becomes eligible when:

```text
now >= lastAttemptedAt + reviewInterval
```

Review intervals:

```ts
R1 = 1 day
R2 = 2 days
R3 = 4 days
RD = 10 days
```

Within each queue, the oldest eligible item should be considered first.

---

# Revision Picker

Implement the revision picker as isolated pure TypeScript logic.

Example:

```ts
function pickNextRevision(items: StudyItem[], now: Date): StudyItem | null;
```

The picker should:

1. Ignore `NEW` items.
2. Find eligible items from R1, R2, R3, and RD.
3. Find the oldest eligible item from each queue.
4. If multiple queues have eligible items, use this priority:

```text
RD > R3 > R2 > R1
```

The intention is to prioritize long-term retention checks.

## Starvation Prevention

Do not allow overdue items to be ignored forever.

Calculate:

```text
dueAt = lastAttemptedAt + reviewInterval

overdueDuration = now - dueAt
```

If an item is overdue by at least:

```text
2 × its review interval
```

it should override normal queue priority.

When starvation prevention applies:

- Select the most overdue eligible item.

Otherwise:

```text
RD > R3 > R2 > R1
```

If no revision is eligible, return `null`.

Keep this logic configurable and easy to modify later.

---

# Study Session Flow

The default study session should be:

```text
1 revision
+
1 fresh problem
```

## Step 1 — Revision

Ask the revision picker for the next eligible item.

If one exists:

- Display the problem.
- Let the user attempt it.
- The user marks it as finished.
- Show the four classifications: R1, R2, R3, RD.
- Update the item.
- Increment `attemptCount`.
- Add a history entry.
- Set `lastAttemptedAt` to the current timestamp.
- Persist immediately.

## Step 2 — Fresh

Pick the oldest fresh item.

- Display the problem.
- Let the user attempt it.
- The user marks it as finished.
- Classify it into R1, R2, R3, or RD.
- Increment `attemptCount`.
- Add history.
- Set `lastAttemptedAt`.
- Persist immediately.

If no revision is due, allow the user to proceed directly to the fresh item.

If no fresh items remain, the user should still be able to complete revision sessions.

---

# Dashboard

Create a simple dashboard showing:

## Next Revision

Display:

- Title
- Current queue
- Last attempted time
- Due status
- Attempt count

If nothing is due, show:

- No revision currently due
- The next upcoming revision and when it is due

## Next Fresh Item

Display:

- Title
- Number of fresh items remaining

Primary action:

```text
Start Study Session
```

---

# Queue Management

Create a page or view where the user can inspect:

```text
NEW
R1
R2
R3
RD
```

For each item show:

- Title
- Current queue
- Last attempted
- Next review date
- Attempt count

Allow:

- Search
- Edit title
- Manually change queue
- Delete item
- View attempt history

If a user manually changes a queue, preserve the existing history.

---

# Basic Analytics

Show:

- Total items
- Fresh items remaining
- Items in each queue
- Total attempts
- Currently due revisions

Also show recent activity:

```text
Problem Name
R2 → R3
Today
```

---

# Persistence

Use IndexedDB.

Create a storage abstraction such as:

```ts
interface StudyStorage {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  clear(): Promise<void>;
}
```

All application state should automatically persist after meaningful changes.

The app must work after:

```text
Refresh
Close browser
Reopen browser
```

---

# Import / Export

Implement JSON export containing:

- All items
- All queues/statuses
- Attempt history
- Timestamps
- Settings

Implement JSON import.

Before importing:

- Validate the file structure.
- Show a confirmation.
- Support replacing existing data.

A merge mode is optional and not required for the first version.

---

# Settings

Create basic settings for:

```text
R1 review interval
R2 review interval
R3 review interval
RD review interval
```

Default values:

```text
R1 = 1 day
R2 = 2 days
R3 = 4 days
RD = 10 days
```

Also allow configuring:

```text
Starvation threshold
```

Default:

```text
2 × review interval
```

Changing settings should immediately affect future eligibility calculations.

---

# Architecture

Keep the business logic separate from the UI.

Suggested structure:

```text
src/
  components/
  pages/
  types/
  storage/
  lib/
    picker.ts
    scheduling.ts
  store/
```

The exact structure can vary.

The important requirement is that:

- Picker logic is pure TypeScript.
- Scheduling logic is separate from UI.
- Persistence is abstracted.
- UI components do not contain complicated scheduling logic.

---

# Tests

Write unit tests for the core logic.

At minimum test:

1. Each queue becomes eligible after its configured interval.
2. Ineligible items are never selected.
3. Queue priority works:

```text
RD > R3 > R2 > R1
```

4. The oldest eligible item within a queue is selected.
5. Starvation prevention overrides queue priority.
6. An item can move from any queue to any other queue.
7. Fresh items are consumed in insertion order.
8. Duplicate fresh items are rejected.
9. Settings changes affect eligibility immediately.

---

# Deliverable

Build a complete, working application.

The following flow must work end-to-end:

```text
Add fresh problems
→ Start study session
→ Pick an eligible revision
→ Complete and classify it
→ Pick a fresh problem
→ Complete and classify it
→ Refresh the browser
→ Confirm all state persists
→ Export data
→ Clear data
→ Import data
→ Confirm everything is restored
```

Prioritize correct functionality and clean architecture over unnecessary features, animations, keyboard shortcuts, gamification, or visual polish.
