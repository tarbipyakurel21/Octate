import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Task, TaskJob } from "../types";

const FORMATS = ["CVAT for video 1.1", "CVAT for images 1.1", "COCO 1.0", "YOLO 1.1"];

export function TaskPage({
    taskId,
    onBack,
    onAnnotate,
}: {
    taskId: string;
    onBack: () => void;
    onAnnotate: (jobId: string) => void;
}) {
    const [task, setTask] = useState<Task | null>(null);
    const [jobs, setJobs] = useState<TaskJob[]>([]);
    const [error, setError] = useState("");
    const [format, setFormat] = useState(FORMATS[0]);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        let cancel = false;
        const load = async () => {
            try {
                const [nextTask, nextJobs] = await Promise.all([api.task(taskId), api.taskJobs(taskId)]);
                if (cancel) return;
                setTask(nextTask);
                setJobs(nextJobs);
                if (nextTask.size < 1 || nextJobs.length === 0) window.setTimeout(load, 2000);
            } catch (reason) {
                if (!cancel) setError(reason instanceof Error ? reason.message : "This task could not be loaded");
            }
        };
        void load();
        return () => {
            cancel = true;
        };
    }, [taskId]);

    const exportDataset = async () => {
        setExporting(true);
        setError("");
        try {
            const url = await api.exportTask(taskId, format);
            window.location.assign(url);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Export failed");
        } finally {
            setExporting(false);
        }
    };

    const labels = task?.labels.map((label) => label.name).filter(Boolean) ?? [];

    return (
        <main className="tk-page">
            <div className="tk-page-heading">
                <div>
                    <span>TASK</span>
                    <h1>{task?.name || "Task"}</h1>
                    <p>
                        {task
                            ? task.status === "processing"
                                ? "CVAT is extracting frames for this task."
                                : `${task.size} frames · ${task.owner.username}`
                            : "Loading task from CVAT…"}
                    </p>
                </div>
                <button type="button" className="tk-text-action" onClick={onBack}>
                    All tasks
                </button>
            </div>
            {labels.length > 0 && (
                <ul className="tk-labels">
                    {labels.map((label) => (
                        <li key={label}>{label}</li>
                    ))}
                </ul>
            )}
            <div className="tk-export">
                <label>
                    Export
                    <select value={format} onChange={(event) => setFormat(event.target.value)}>
                        {FORMATS.map((item) => (
                            <option key={item}>{item}</option>
                        ))}
                    </select>
                </label>
                <button type="button" className="tk-primary" disabled={exporting || !task || task.size < 1} onClick={() => void exportDataset()}>
                    {exporting ? "Exporting" : "Download"}
                </button>
            </div>
            {error && <p className="tk-error">{error}</p>}
            {jobs.length === 0 && !error && <p className="tk-empty">Waiting for CVAT to create the annotation job.</p>}
            <ul className="tk-list">
                {jobs.map((job) => (
                    <li key={job.id} className="tk-task">
                        <div className="tk-task-copy">
                            <strong>
                                Job #{job.id}
                                {job.type === "ground_truth" ? " · ground truth" : ""}
                            </strong>
                            <p>
                                Frames {job.start_frame}–{job.stop_frame} · {job.status}
                            </p>
                        </div>
                        <button type="button" onClick={() => onAnnotate(job.id)}>
                            Annotate
                        </button>
                    </li>
                ))}
            </ul>
        </main>
    );
}
