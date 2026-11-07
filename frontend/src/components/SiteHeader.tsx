import type { ReactNode } from "react";
import { FolderKanban, Folders, Github, House, Info, ListTodo } from "lucide-react";
import { OctateBrand } from "./OctateBrand";

export type DashboardSection = "landing" | "about" | "projects" | "tasks" | "jobs" | "login";

export function SiteHeader({
    section,
    account,
    username,
    onNavigate,
    onSignIn,
    onSignOut,
    visited = [],
}: {
    section: DashboardSection;
    account: "unknown" | "in" | "out";
    username?: string | null;
    onNavigate: (href: string) => void;
    onSignIn: () => void;
    onSignOut: () => void;
    visited?: string[];
}) {
    const item = (id: DashboardSection, href: string, label: string, icon: ReactNode) => (
        <button
            type="button"
            className={`${section === id ? "active" : ""} ${visited.includes(id) ? "visited" : ""}`}
            onClick={() => onNavigate(href)}
        >
            {icon} {label}
        </button>
    );

    return (
        <header className="site-header">
            <button className="brand" type="button" aria-label="Octate home" onClick={() => onNavigate("/")}>
                <OctateBrand />
            </button>
            <nav className="landing-nav">
                {item("landing", "/", "Home", <House />)}
                {item("about", "/about", "About", <Info />)}
                {item("projects", "/projects", "Projects", <Folders />)}
                {item("tasks", "/tasks", "Tasks", <FolderKanban />)}
                {item("jobs", "/jobs", "Jobs", <ListTodo />)}
                <a
                    href="https://github.com/tarbipyakurel21/Octate"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open Octate on GitHub"
                    title="GitHub"
                >
                    <Github />
                </a>
                {account === "in" && username ? (
                    <button type="button" onClick={onSignOut} title={`Signed in as ${username}`}>
                        {username}
                    </button>
                ) : account === "out" ? (
                    <button type="button" className={section === "login" ? "active" : ""} onClick={onSignIn}>
                        Sign in
                    </button>
                ) : null}
            </nav>
        </header>
    );
}
