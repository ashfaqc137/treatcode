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
import {
  findGist,
  loadSync,
  pullGist,
  pushGist,
  remoteUpdatedAt,
  storeSync,
  SyncError,
  type SyncConfig,
} from "./storage/gistSync";
import type { AppData, Entry, Queue } from "./types";
import { BoardView, type BoardActions } from "./Board";
import { EntryEditor, QueueEditor, SettingsView, TopicEditor, type CloudSync } from "./views";
import { useTheme } from "./theme";

interface Toast {
  text: string;
  error?: boolean;
  undo?: AppData;
  // Another device saved newer progress; offers a Load button and stays until acted on.
  offerLoad?: boolean;
}
const when = (iso: string) => new Date(iso).toLocaleString();
// One read-only check on open. Errors are ignored so being offline doesn't nag on every visit;
// Save and Load still report them.
async function newerCloudCopy() {
  const sync = loadSync();
  if (!sync?.gistId) return null;
  const remote = await remoteUpdatedAt(sync.token, sync.gistId).catch(() => null);
  return remote && remote !== sync.remoteUpdatedAt ? remote : null;
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
    [now, setNow] = useState(() => new Date()),
    [sync, setSync] = useState(loadSync),
    [syncing, setSyncing] = useState(false);
  const [theme, setTheme, shownTheme] = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    indexedDbStorage
      .load()
      .then((x) => setData(validate(x)))
      .catch(() => {
        setData(emptyAppData());
        setToast({ text: "Saved data was from an older version, so you're starting with a fresh board." });
      })
      .then(newerCloudCopy)
      .then((remote) => {
        if (remote)
          setToast(
            (t) =>
              t ?? { text: `Newer progress from another device (saved ${when(remote)}).`, offerLoad: true },
          );
      });
  }, []);
  // Re-render every minute so entries slide into "Due now" without a refresh.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!toast || toast.offerLoad) return;
    const id = setTimeout(() => setToast(null), toast.undo ? 6000 : 4000);
    return () => clearTimeout(id);
  }, [toast]);
  const close = useCallback(() => setDialog(null), []);
  if (!data) return <main className="loading">Loading…</main>;
  const topic = data.topics.find((t) => t.id === data.selectedTopicId)!;

  const updateSync = (next: SyncConfig | null) => {
    setSync(next);
    storeSync(next);
  };
  const save = (next: AppData) => {
    setData(next);
    if (sync && !sync.dirty) updateSync({ ...sync, dirty: true });
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

  // Cloud sync is manual: the gist only changes when the user presses Save or Load.
  const runSync = async (fn: () => Promise<void>) => {
    if (syncing) return;
    setSyncing(true);
    try {
      await fn();
    } catch (e) {
      // The gist is gone (or out of the token's reach): forget it so the next Save creates a new one.
      if (sync && e instanceof SyncError && e.status === 404)
        updateSync({ ...sync, gistId: undefined, remoteUpdatedAt: undefined });
      fail(e);
    } finally {
      setSyncing(false);
    }
  };
  const cloud: CloudSync = {
    config: sync,
    busy: syncing,
    connect: (token) =>
      runSync(async () => {
        const found = await findGist(token);
        if (!found) {
          updateSync({ token, dirty: true });
          setToast({ text: "Connected. Press Save to create your cloud copy." });
        } else if (confirm(`Cloud copy found (saved ${when(found.updatedAt)}). Load it now?`)) {
          const pulled = await pullGist(token, found.id);
          commit(pulled.data, "Loaded from cloud");
          updateSync({
            token,
            gistId: found.id,
            remoteUpdatedAt: pulled.updatedAt,
            bytes: pulled.bytes,
            dirty: false,
          });
        } else {
          // No remoteUpdatedAt yet, so the first Save warns before overwriting the cloud copy.
          updateSync({ token, gistId: found.id, dirty: true });
          setToast({ text: "Connected. Your local data was kept." });
        }
      }),
    save: () =>
      runSync(async () => {
        const s = sync!;
        if (s.gistId) {
          const remote = await remoteUpdatedAt(s.token, s.gistId);
          if (
            remote !== s.remoteUpdatedAt &&
            !confirm(`The cloud copy was saved from another device (${when(remote)}). Overwrite it?`)
          )
            return;
        }
        const pushed = await pushGist(s.token, s.gistId, data);
        updateSync({
          ...s,
          gistId: pushed.gistId,
          remoteUpdatedAt: pushed.updatedAt,
          bytes: pushed.bytes,
          dirty: false,
        });
        setToast({ text: "Saved to cloud" });
      }),
    load: () =>
      runSync(async () => {
        const s = sync!;
        if (!s.gistId) throw new Error("Nothing saved to the cloud yet.");
        if (s.dirty && !confirm("You have changes not saved to the cloud. Replace them with the cloud copy?"))
          return;
        const pulled = await pullGist(s.token, s.gistId);
        // commit() marks the data dirty, so mark it clean afterwards.
        commit(pulled.data, "Loaded from cloud");
        updateSync({ ...s, remoteUpdatedAt: pulled.updatedAt, bytes: pulled.bytes, dirty: false });
      }),
    disconnect: () => updateSync(null),
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
        {sync && (
          <button
            className="icon cloud"
            title={sync.dirty ? "Save to cloud (unsaved changes)" : "Saved to cloud"}
            aria-label={sync.dirty ? "Save to cloud, unsaved changes" : "Save to cloud"}
            disabled={syncing}
            onClick={cloud.save}
          >
            ☁{sync.dirty && <span className="dot" />}
          </button>
        )}
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
          cloud={cloud}
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
          {toast.offerLoad && (
            <button
              onClick={() => {
                setToast(null);
                cloud.load();
              }}
            >
              Load
            </button>
          )}
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
