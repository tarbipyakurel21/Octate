import { FolderKanban, Github, House, Info } from "lucide-react";
import { OctateBrand } from "./OctateBrand";

export function SiteHeader({
    screen,
    onNavigate,
    visited = [],
}: {
    screen: "landing" | "about" | "tasks" | "create" | "review";
    onNavigate: (screen: "landing" | "about" | "tasks") => void;
    visited?: string[];
}) {
    return (
        <header className="site-header">
            <button className="brand" aria-label="Octate home" onClick={() => onNavigate("landing")}>
                <OctateBrand />
            </button>
            <nav className="landing-nav">
                <button className={`${screen === "landing" ? "active" : ""} ${visited.includes("landing") ? "visited" : ""}`} onClick={() => onNavigate("landing")}>
                    <House /> Home
                </button>
                <button className={`${screen === "about" ? "active" : ""} ${visited.includes("about") ? "visited" : ""}`} onClick={() => onNavigate("about")}>
                    <Info /> About
                </button>
                <a
                    href="https://github.com/tarbipyakurel21/Octate"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open Octate on GitHub"
                    title="GitHub"
                >
                    <Github />
                </a>
                <button className={`${["tasks", "create", "review"].includes(screen) ? "active" : ""} ${visited.includes("tasks") ? "visited" : ""}`} onClick={() => onNavigate("tasks")}>
                    <FolderKanban /> Tasks
                </button>
            </nav>
        </header>
    );
}
