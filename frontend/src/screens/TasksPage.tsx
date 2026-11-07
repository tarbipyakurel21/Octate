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

export function TasksPage({ onCreate, onOpen }: { onCreate: () => void; onOpen: (task: Task) => void }) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<"all" | Task["status"]>("all");
    const [selected, setSelected] = useState<string[]>([]);

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

    const toggleAll = () => {
        setSelected(selected.length === visible.length ? [] : visible.map((task) => task.id));
    };

    return (
        <main className="tk-page">
            <div className="tk-page-heading">
                <div><span>WORKSPACE</span><h1>Tasks</h1><p>Manage video annotation tasks and open ready jobs.</p></div>
                <button className="tk-create-action" onClick={onCreate}><Plus /> Create task</button>
            </div>
            <div className="tk-toolbar">
                <label className="tk-search">
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search ..."
                        aria-label="Search tasks"
                    />
                    <Search />
                </label>
                <label className="tk-check">
                    <input
                        type="checkbox"
                        checked={visible.length > 0 && selected.length === visible.length}
                        onChange={toggleAll}
                    />
                    Select all
                </label>
                <div className="tk-filters">
                    {(["all", "annotation", "processing"] as const).map((item) => (
                        <button key={item} className={status === item ? "active" : ""} onClick={() => setStatus(item)}>
                            {item === "all" ? "All" : item === "annotation" ? "Ready" : "Extracting"}
                        </button>
                    ))}
                </div>
            </div>
            {error && <p className="tk-error">{error}</p>}
            {visible.length === 0 && !error && (
                <p className="tk-empty">No tasks yet. Create one and upload a video to extract its frames.</p>
            )}
            <ul className="tk-list">
                {visible.map((task) => (
                    <li key={task.id} className="tk-task">
                        <input
                            type="checkbox"
                            aria-label={`Select ${task.name}`}
                            checked={selected.includes(task.id)}
                            onChange={() =>
                                setSelected(
                                    selected.includes(task.id)
                                        ? selected.filter((id) => id !== task.id)
                                        : [...selected, task.id],
                                )
                            }
                        />
                        <TaskThumb id={task.id} />
                        <div className="tk-task-copy">
                            <strong>
                                <span>#{task.id.slice(0, 7)}</span> {task.name}
                            </strong>
                            <p>{created(task)}</p>
                            <p>Last updated {when(task.updated_date)}</p>
                        </div>
                        <div className="tk-progress">
                            <span>
                                {task.status === "processing"
                                    ? "Extracting frames with FFmpeg"
                                    : `${task.size} frames · ${task.jobs.length} job${task.jobs.length === 1 ? "" : "s"}`}
                            </span>
                            <i>
                                <b style={{ width: task.status === "annotation" ? "100%" : "35%" }} />
                            </i>
                        </div>
                        <button disabled={task.status !== "annotation" || task.size < 1} onClick={() => onOpen(task)}>
                            Open
                        </button>
                    </li>
                ))}
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
