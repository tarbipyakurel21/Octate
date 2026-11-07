import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Project, Task } from "../types";

export function ProjectPage({
    projectId,
    onBack,
    onOpenTask,
    onAnnotate,
}: {
    projectId: string;
    onBack: () => void;
    onOpenTask: (task: Task) => void;
    onAnnotate: (task: Task) => void;
}) {
    const [project, setProject] = useState<Project | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancel = false;
        Promise.all([api.project(projectId), api.tasks(projectId)])
            .then(([nextProject, nextTasks]) => {
                if (cancel) return;
                setProject(nextProject);
                setTasks(nextTasks);
            })
            .catch((reason: unknown) => {
                if (!cancel) setError(reason instanceof Error ? reason.message : "This project could not be loaded");
            });
        return () => {
            cancel = true;
        };
    }, [projectId]);

    return (
        <main className="tk-page">
            <div className="tk-page-heading">
                <div>
                    <span>PROJECT</span>
                    <h1>{project?.name || "Project"}</h1>
                    <p>{project ? `Owner ${project.owner}` : "Loading project from CVAT…"}</p>
                </div>
                <button type="button" className="tk-text-action" onClick={onBack}>
                    All projects
                </button>
            </div>
            {error && <p className="tk-error">{error}</p>}
            {tasks.length === 0 && !error && <p className="tk-empty">This project has no tasks yet.</p>}
            <ul className="tk-list">
                {tasks.map((task) => (
                    <li key={task.id} className="tk-task">
                        <div className="tk-task-copy">
                            <strong>
                                <button type="button" onClick={() => onOpenTask(task)}>
                                    <span>#{task.id}</span> {task.name}
                                </button>
                            </strong>
                            <p>
                                {task.size} frames · {task.status === "processing" ? "Extracting" : "Ready"}
                            </p>
                        </div>
                        <button type="button" disabled={task.status !== "annotation" || task.size < 1} onClick={() => onAnnotate(task)}>
                            Annotate
                        </button>
                    </li>
                ))}
            </ul>
        </main>
    );
}
