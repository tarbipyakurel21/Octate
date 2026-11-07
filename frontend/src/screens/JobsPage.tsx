import { useEffect, useState } from "react";
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
            <div className="tk-page-heading">
                <div>
                    <span>WORKSPACE</span>
                    <h1>Jobs</h1>
                    <p>Frame ranges stored in CVAT. Annotate opens that job in the CVAT workspace.</p>
                </div>
            </div>
            {error && <p className="tk-error">{error}</p>}
            {jobs.length === 0 && !error && <p className="tk-empty">Jobs appear here after a task has extracted frames.</p>}
            <ul className="tk-list">
                {jobs.map((job) => (
                    <li key={job.id} className="tk-task">
                        <div className="tk-task-copy">
                            <strong>
                                Job #{job.id}
                                {job.type === "ground_truth" ? " · ground truth" : ""}
                            </strong>
                            <p>Task #{job.task_id}</p>
                            <p>
                                Frames {job.start_frame}–{job.stop_frame} · {job.status}
                            </p>
                        </div>
                        <button type="button" onClick={() => onOpen(job)}>
                            Annotate
                        </button>
                    </li>
                ))}
            </ul>
        </main>
    );
}
