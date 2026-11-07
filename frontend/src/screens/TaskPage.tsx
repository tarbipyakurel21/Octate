import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import type { Task, TaskJob } from "../types";

const FORMATS = [
    { value: "CVAT for video 1.1", label: "Video 1.1" },
    { value: "CVAT for images 1.1", label: "Images 1.1" },
    { value: "COCO 1.0", label: "COCO 1.0" },
    { value: "YOLO 1.1", label: "YOLO 1.1" },
];

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
    const [format, setFormat] = useState(FORMATS[0].value);
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
                                ? "Extracting frames for this task."
                                : `${task.size} frames · ${task.owner.username}`
                            : "Loading task…"}
                    </p>
                </div>
                <button type="button" className="tk-text-action" onClick={onBack}>
                    <ArrowLeft /> All tasks
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
                    Export format
                    <select value={format} onChange={(event) => setFormat(event.target.value)}>
                        {FORMATS.map((item) => (
                            <option key={item.value} value={item.value}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </label>
                <button type="button" className="tk-primary" disabled={exporting || !task || task.size < 1} onClick={() => void exportDataset()}>
                    {exporting ? "Exporting…" : "Download"}
                </button>
            </div>
            {error && <p className="tk-error-panel" role="alert">{error}</p>}
            {jobs.length === 0 && !error && (
                <div className="tk-empty-panel">Waiting for the annotation job.</div>
            )}
            <ul className="tk-list">
                {jobs.map((job) => (
                    <li key={job.id} className="tk-task tk-task-plain">
                        <div className="tk-task-copy">
                            <strong>
                                Job #{job.id}
                                {job.type === "ground_truth" ? " · ground truth" : ""}
                            </strong>
                            <p>
                                Frames {job.start_frame}–{job.stop_frame}
                            </p>
                        </div>
                        <div className="tk-meta">
                            <span className="tk-status">{job.status.replaceAll("_", " ")}</span>
                        </div>
                        <button type="button" onClick={() => onAnnotate(job.id)}>
                            Octate
                        </button>
                    </li>
                ))}
            </ul>
        </main>
    );
}
