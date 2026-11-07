import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { TaskJob } from "../types";

export function JobsPage({ onOpen }: { onOpen: (taskId: string) => void }) {
    const [jobs, setJobs] = useState<TaskJob[]>([]);
    const [error, setError] = useState("");

    useEffect(() => {
        api.jobs()
            .then(setJobs)
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Jobs could not be loaded"));
    }, []);

    return (
        <main className="tk-page">
            <div className="tk-page-heading"><div><span>WORKSPACE</span><h1>Jobs</h1><p>Open extracted frame ranges and continue annotation.</p></div></div>
            {error && <p className="tk-error">{error}</p>}
            {jobs.length === 0 && !error && <p className="tk-empty">Jobs appear here after a task has extracted frames.</p>}
            <ul className="tk-list">
                {jobs.map((job) => (
                    <li key={job.id} className="tk-task">
                        <div className="tk-task-copy">
                            <strong>{job.id}</strong>
                            <p>
                                Frames {job.start_frame}–{job.stop_frame}
                            </p>
                            <p>{job.status}</p>
                        </div>
                        <button disabled={job.status !== "annotation"} onClick={() => onOpen(job.task_id)}>
                            Open
                        </button>
                    </li>
                ))}
            </ul>
        </main>
    );
}
