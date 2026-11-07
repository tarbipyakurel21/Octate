import { ClipboardList, LayoutDashboard } from "lucide-react";
import { OctateBrand } from "./OctateBrand";

export function WorkspaceHeader({
    screen,
    onNavigate,
    visited = [],
}: {
    screen: "tasks" | "create" | "annotate" | "review";
    onNavigate: (screen: "tasks") => void;
    visited?: string[];
}) {
    const tasksActive = screen === "tasks" || screen === "create" || screen === "annotate" || screen === "review";
    return (
        <header className="tk-top">
            <button className="tk-brand" onClick={() => onNavigate("tasks")}>
                <OctateBrand />
            </button>
            <nav>
                <button className={`${tasksActive ? "active" : ""} ${visited.includes("tasks") ? "visited" : ""}`} onClick={() => onNavigate("tasks")}>
                    <LayoutDashboard /> Dashboard
                </button>
            </nav>
            <span className="tk-session"><ClipboardList /><span>Annotation workspace</span></span>
            <span className="tk-user">AN</span>
        </header>
    );
}
