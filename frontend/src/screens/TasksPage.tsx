import { useEffect, useMemo, useState } from "react";
import { ImageOff, Plus, Search } from "lucide-react";
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

    useEffect(() => {
        api.tasks()
            .then(setTasks)
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Tasks could not be loaded"));
    }, []);

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
                        </li>
                    );
                })}
            </ul>
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
