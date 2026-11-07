import { useEffect, useState } from "react";
import { ListTodo } from "lucide-react";
import { api } from "../lib/api";
import type { TaskJob } from "../types";

export function JobsPage({ onOpen }: { onOpen: (job: TaskJob) => void }) {
    const [jobs, setJobs] = useState<TaskJob[]>([]);
    const [error, setError] = useState("");

    useEffect(() => {
        api.jobs()
            .then(setJobs)
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Jobs could not be loaded"));
    }, []);

    return (
        <main className="tk-page">
            {error && <p className="tk-error-panel" role="alert">{error}</p>}
            {jobs.length === 0 && !error && (
                <div className="tk-empty-panel">Jobs appear here after a task has extracted frames.</div>
            )}
            <ul className="tk-list">
                {jobs.map((job) => (
                    <li key={job.id} className="tk-task tk-task-plain">
                        <div className="tk-glyph" aria-hidden="true">
                            <ListTodo />
                        </div>
                        <div className="tk-task-copy">
                            <strong>
                                Job #{job.id}
                                {job.type === "ground_truth" ? " · ground truth" : ""}
                            </strong>
                            <p>Task #{job.task_id}</p>
                            <p>
                                Frames {job.start_frame}–{job.stop_frame}
                            </p>
                        </div>
                        <div className="tk-meta">
                            <span className="tk-status">{job.status.replaceAll("_", " ")}</span>
                        </div>
                        <button type="button" onClick={() => onOpen(job)}>
                            Octate
                        </button>
                    </li>
                ))}
            </ul>
        </main>
    );
}
