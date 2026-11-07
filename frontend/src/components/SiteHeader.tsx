import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, FolderKanban, Folders, Github, House, Info, ListTodo, LogOut } from "lucide-react";
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
            <nav className="landing-nav" aria-label="Primary">
                {item("landing", "/", "Home", <House />)}
                {item("about", "/about", "About", <Info />)}
                {item("projects", "/projects", "Projects", <Folders />)}
                {item("tasks", "/tasks", "Tasks", <FolderKanban />)}
                {item("jobs", "/jobs", "Jobs", <ListTodo />)}
            </nav>
            <div className="header-tools">
                <a
                    className="header-icon"
                    href="https://github.com/tarbipyakurel21/Octate"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open Octate on GitHub"
                    title="GitHub"
                >
                    <Github />
                </a>
                <div className="header-account">
                    {account === "in" && username ? (
                        <AccountMenu username={username} onSignOut={onSignOut} />
                    ) : account === "out" ? (
                        <button type="button" className={section === "login" ? "sign-in active" : "sign-in"} onClick={onSignIn}>
                            Sign in
                        </button>
                    ) : (
                        <span className="header-account-pending" aria-hidden="true" />
                    )}
                </div>
            </div>
        </header>
    );
}

function AccountMenu({ username, onSignOut }: { username: string; onSignOut: () => void }) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const initial = username.trim().charAt(0).toUpperCase() || "?";

    useEffect(() => {
        if (!open) return;
        const closeOnOutside = (event: MouseEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", closeOnOutside);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("mousedown", closeOnOutside);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [open]);

    return (
        <div className="account-menu" ref={root}>
            <button
                type="button"
                className="account-button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`Account menu for ${username}`}
                onClick={() => setOpen((value) => !value)}
            >
                <span className="avatar" aria-hidden="true">{initial}</span>
                <span className="account-name">{username}</span>
                <ChevronDown className="account-chevron" aria-hidden="true" />
            </button>
            {open ? (
                <div className="account-dropdown" role="menu" aria-label="Account">
                    <p className="account-dropdown-user">{username}</p>
                    <button
                        type="button"
                        role="menuitem"
                        className="account-logout"
                        onClick={() => {
                            setOpen(false);
                            onSignOut();
                        }}
                    >
                        <LogOut aria-hidden="true" />
                        Log out
                    </button>
                </div>
            ) : null}
        </div>
    );
}
