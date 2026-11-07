import { useEffect, useState } from "react";
import { Folders } from "lucide-react";
import { api } from "../lib/api";
import type { Project } from "../types";

function when(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export function ProjectsPage({ onOpen }: { onOpen: (project: Project) => void }) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [error, setError] = useState("");

    useEffect(() => {
        api.projects()
            .then(setProjects)
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Projects could not be loaded"));
    }, []);

    return (
        <main className="tk-page">
            {error && <p className="tk-error-panel" role="alert">{error}</p>}
            {projects.length === 0 && !error && (
                <div className="tk-empty-panel">No projects yet. A task can be created on its own from Tasks.</div>
            )}
            <ul className="tk-list">
                {projects.map((project) => (
                    <li key={project.id} className="tk-task tk-task-plain">
                        <div className="tk-glyph" aria-hidden="true">
                            <Folders />
                        </div>
                        <div className="tk-task-copy">
                            <strong>
                                <button type="button" onClick={() => onOpen(project)}>
                                    <span>#{project.id}</span> {project.name}
                                </button>
                            </strong>
                            <p>Owner {project.owner}</p>
                            <p>Updated {when(project.updated_date)}</p>
                        </div>
                        <button type="button" onClick={() => onOpen(project)}>
                            Open
                        </button>
                    </li>
                ))}
            </ul>
        </main>
    );
}
