import { useCallback, useEffect, useRef, useState } from "react";
import {
  createQueue,
  createTopic,
  deleteQueue,
  deleteTopic,
  emptyAppData,
  moveEntry,
  removeEntry,
  renameTopic,
  updateEntry,
  updateQueue,
  validate,
} from "./lib/data";
import { queueLabel } from "./lib/queues";
import { indexedDbStorage } from "./storage/indexedDb";
import type { AppData, Entry, Queue } from "./types";
import { BoardView, type BoardActions } from "./Board";
import { EntryEditor, QueueEditor, SettingsView, TopicEditor } from "./views";
import { useTheme } from "./theme";

interface Toast {
  text: string;
  error?: boolean;
  undo?: AppData;
}
type Dialog =
  | { kind: "entry"; id: string }
  | { kind: "queue"; queue: Queue | null }
  | { kind: "topic"; editing: boolean };
export default function App() {
  const [data, setData] = useState<AppData | null>(null),
    [view, setView] = useState<"board" | "settings">("board"),
    [toast, setToast] = useState<Toast | null>(null),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [now, setNow] = useState(() => new Date());
  const [theme, setTheme, shownTheme] = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    indexedDbStorage
      .load()
      .then((x) => setData(validate(x)))
      .catch(() => {
        setData(emptyAppData());
        setToast({ text: "Saved data was from an older version, so you're starting with a fresh board." });
      });
  }, []);
  // Re-render every minute so entries slide into "Due now" without a refresh.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.undo ? 6000 : 4000);
    return () => clearTimeout(id);
  }, [toast]);
  const close = useCallback(() => setDialog(null), []);
  if (!data) return <main className="loading">Loading…</main>;
  const topic = data.topics.find((t) => t.id === data.selectedTopicId)!;

  const save = (next: AppData) => {
    setData(next);
    setNow(new Date());
    indexedDbStorage.save(next).catch(() => setToast({ text: "Changes could not be saved.", error: true }));
  };
  const commit = (next: AppData, text?: string) => {
    save(next);
    if (text) setToast({ text, undo: data });
  };
  const fail = (e: unknown) => setToast({ text: (e as Error).message, error: true });
  const attempt = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      fail(e);
    }
  };
  const label = (queueId: string) =>
    queueLabel(
      topic.queues.find((q) => q.id === queueId)!,
      topic.queues,
    );
  const actions: BoardActions = {
    commit,
    fail,
    move: (entry, queueId) =>
      attempt(() =>
        commit(
          moveEntry(data, entry.id, queueId),
          entry.queueId === queueId
            ? `“${entry.title}” goes around ${label(queueId)} again`
            : `Moved “${entry.title}” to ${label(queueId)}`,
        ),
      ),
    remove: (entry) => commit(removeEntry(data, entry.id), `Removed “${entry.title}”`),
    open: (entry: Entry) => setDialog({ kind: "entry", id: entry.id }),
    editQueue: (queue) => setDialog({ kind: "queue", queue: queue === "new" ? null : queue }),
  };

  const exportData = () => {
    const u = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = u;
    a.download = "treatcode.json";
    a.click();
    URL.revokeObjectURL(u);
  };
  const importData = async (f?: File) => {
    if (!f) return;
    try {
      const x = validate(JSON.parse(await f.text()));
      if (confirm("Replace all current data?")) commit(x, "Import complete");
    } catch (e) {
      fail(e);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const entry = dialog?.kind === "entry" ? data.entries.find((e) => e.id === dialog.id) : undefined;
  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">↻</span>
          <h1>TreatCode</h1>
        </div>
        <nav className="topics" aria-label="Topics">
          {data.topics.map((t) => (
            <button
              key={t.id}
              className={t.id === topic.id ? "on" : ""}
              title={t.id === topic.id ? "Rename or delete" : undefined}
              onClick={() => {
                setView("board");
                if (t.id === topic.id) setDialog({ kind: "topic", editing: true });
                else save({ ...data, selectedTopicId: t.id });
              }}
            >
              {t.title}
              {t.id === topic.id && <span className="pencil">✎</span>}
            </button>
          ))}
          <button className="add-topic" onClick={() => setDialog({ kind: "topic", editing: false })}>
            + Topic
          </button>
        </nav>
        <button
          className="icon theme-toggle"
          title={`Switch to ${shownTheme === "dark" ? "light" : "dark"} theme`}
          aria-label={`Switch to ${shownTheme === "dark" ? "light" : "dark"} theme`}
          onClick={() => setTheme(shownTheme === "dark" ? "light" : "dark")}
        >
          {shownTheme === "dark" ? "☀" : "☾"}
        </button>
        <button
          className={`icon ${view === "settings" ? "on" : ""}`}
          title="Settings"
          onClick={() => setView(view === "settings" ? "board" : "settings")}
        >
          ⚙
        </button>
      </header>
      {view === "board" ? (
        <BoardView data={data} topic={topic} now={now} actions={actions} />
      ) : (
        <SettingsView
          theme={theme}
          setTheme={setTheme}
          exportData={exportData}
          importData={importData}
          fileRef={fileRef}
          back={() => setView("board")}
          clear={async () => {
            if (confirm("Delete all data? This cannot be undone.")) {
              await indexedDbStorage.clear();
              setData(emptyAppData());
              setView("board");
            }
          }}
        />
      )}
      {entry && (
        <EntryEditor
          key={entry.id}
          entry={entry}
          topic={topic}
          now={now}
          close={close}
          save={(input) =>
            attempt(() => {
              commit(updateEntry(data, entry.id, input));
              close();
            })
          }
          move={(queueId) => {
            actions.move(entry, queueId);
            close();
          }}
          remove={() => {
            actions.remove(entry);
            close();
          }}
        />
      )}
      {dialog?.kind === "queue" && (
        <QueueEditor
          queue={dialog.queue}
          topic={topic}
          count={data.entries.filter((e) => e.queueId === dialog.queue?.id).length}
          close={close}
          save={(input) =>
            attempt(() => {
              commit(
                dialog.queue
                  ? updateQueue(data, topic.id, dialog.queue.id, input)
                  : createQueue(data, topic.id, input),
              );
              close();
            })
          }
          remove={(how) =>
            attempt(() => {
              commit(deleteQueue(data, topic.id, dialog.queue!.id, how), "Queue deleted");
              close();
            })
          }
        />
      )}
      {dialog?.kind === "topic" && (
        <TopicEditor
          topic={dialog.editing ? topic : null}
          canDelete={data.topics.length > 1}
          close={close}
          save={(title) =>
            attempt(() => {
              commit(dialog.editing ? renameTopic(data, topic.id, title) : createTopic(data, title));
              close();
            })
          }
          remove={() =>
            attempt(() => {
              commit(deleteTopic(data, topic.id), `Deleted topic “${topic.title}”`);
              close();
            })
          }
        />
      )}
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              onClick={() => {
                save(toast.undo!);
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
          <button className="icon" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </main>
  );
}
