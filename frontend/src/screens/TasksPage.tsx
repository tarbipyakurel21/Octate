import { useEffect, useMemo, useState } from "react";
import { ImageOff, LoaderCircle, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { Task } from "../types";

function when(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const seconds = Math.max(0, (Date.now() - then) / 1000);
    if (seconds < 60) return "a few seconds ago";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function created(task: Task): string {
    const date = new Date(task.created_date);
    const formatted = Number.isNaN(date.getTime())
        ? task.created_date
        : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
    return `Created by ${task.owner.username} on ${formatted}`;
}

export async function confirmTaskDeletion(
    confirmed: boolean,
    taskId: string,
    deleteTask: (id: string) => Promise<unknown>,
): Promise<boolean> {
    if (!confirmed) return false;
    await deleteTask(taskId);
    return true;
}

export function TasksPage({
    onCreate,
    onOpen,
    onAnnotate,
}: {
    onCreate: () => void;
    onOpen: (task: Task) => void;
    onAnnotate: (task: Task) => void;
}) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<"all" | Task["status"]>("all");
    const [deleting, setDeleting] = useState<Task | null>(null);
    const [deleteError, setDeleteError] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        api.tasks()
            .then(setTasks)
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Tasks could not be loaded"));
    }, []);

    const deleteSelectedTask = async () => {
        if (!deleting || isDeleting) return;
        setIsDeleting(true);
        setDeleteError("");
        try {
            await confirmTaskDeletion(true, deleting.id, api.deleteTask);
            setTasks((current) => current.filter((task) => task.id !== deleting.id));
            setDeleting(null);
        } catch (reason: unknown) {
            setDeleteError(reason instanceof Error ? reason.message : "Task could not be deleted");
        } finally {
            setIsDeleting(false);
        }
    };

    const visible = useMemo(
        () =>
            tasks.filter((task) => {
                const matchesQuery = task.name.toLowerCase().includes(query.trim().toLowerCase());
                return matchesQuery && (status === "all" || task.status === status);
            }),
        [tasks, query, status],
    );

    return (
        <main className="tk-page">
            <div className="tk-toolbar">
                <label className="tk-search">
                    <Search />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search tasks"
                        aria-label="Search tasks"
                    />
                </label>
                <div className="tk-filters" role="group" aria-label="Filter tasks">
                    {(["all", "annotation", "processing"] as const).map((item) => (
                        <button key={item} type="button" className={status === item ? "active" : ""} onClick={() => setStatus(item)}>
                            {item === "all" ? "All" : item === "annotation" ? "Ready" : "Extracting"}
                        </button>
                    ))}
                </div>
                <button className="tk-create-action" onClick={onCreate}>
                    <Plus /> Create task
                </button>
            </div>
            {error && <p className="tk-error-panel" role="alert">{error}</p>}
            {visible.length === 0 && !error && (
                <div className="tk-empty-panel">
                    {tasks.length === 0
                        ? "No tasks yet. Create one and upload a video. Frames are extracted after upload."
                        : "No tasks match this search."}
                </div>
            )}
            <ul className="tk-list">
                {visible.map((task) => {
                    const jobs = task.progress.total_jobs;
                    const ready = task.status === "annotation" && task.size >= 1;
                    return (
                        <li key={task.id} className="tk-task">
                            <TaskThumb id={task.id} />
                            <div className="tk-task-copy">
                                <strong>
                                    <button type="button" onClick={() => onOpen(task)}>
                                        <span>#{task.id}</span> {task.name}
                                    </button>
                                </strong>
                                <p>{created(task)}</p>
                                <p>Updated {when(task.updated_date)}</p>
                            </div>
                            <div className="tk-meta">
                                <span className={`tk-status ${ready ? "is-ready" : "is-busy"}`}>
                                    {task.status === "processing" ? "Extracting" : "Ready"}
                                </span>
                                <span>
                                    {task.status === "processing"
                                        ? "Frames are still being extracted"
                                        : `${task.size} frames · ${jobs} job${jobs === 1 ? "" : "s"}`}
                                </span>
                            </div>
                            <button type="button" disabled={!ready} onClick={() => onAnnotate(task)}>
                                Octate
                            </button>
                            <button
                                type="button"
                                className="tk-delete-action"
                                aria-label={`Delete ${task.name}`}
                                title="Delete task"
                                onClick={() => { setDeleteError(""); setDeleting(task); }}
                            >
                                <Trash2 />
                            </button>
                        </li>
                    );
                })}
            </ul>
            {deleting && (
                <div className="tk-dialog-backdrop" role="presentation">
                    <section className="tk-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-task-title">
                        <h2 id="delete-task-title">Delete task?</h2>
                        <p className="tk-dialog-task"><strong>{deleting.name}</strong> (ID {deleting.id})</p>
                        <p>This is permanent and removes the task’s jobs, annotations, and task media.</p>
                        {deleteError && <p className="tk-dialog-error" role="alert">{deleteError}</p>}
                        <div className="tk-actions">
                            <button type="button" onClick={() => { setDeleting(null); setDeleteError(""); }} disabled={isDeleting}>Cancel</button>
                            <button type="button" className="tk-primary" onClick={deleteSelectedTask} disabled={isDeleting}>
                                {isDeleting && <LoaderCircle className="tk-spinner" />} {isDeleting ? "Deleting…" : "Delete permanently"}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
}

function TaskThumb({ id }: { id: string }) {
    const [failed, setFailed] = useState(false);
    if (failed) {
        return (
            <div className="tk-thumb tk-thumb-empty" aria-hidden="true">
                <ImageOff />
            </div>
        );
    }
    return (
        <div className="tk-thumb">
            <img src={api.previewUrl(id)} alt="" onError={() => setFailed(true)} />
        </div>
    );
}
