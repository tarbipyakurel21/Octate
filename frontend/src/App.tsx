import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { SiteHeader, type DashboardSection } from "./components/SiteHeader";
import { api } from "./lib/api";
import { AboutPage } from "./screens/AboutPage";
const AnnotatePage = dynamic(() => import("./screens/AnnotatePage").then((mod) => mod.AnnotatePage), { ssr: false });
import { CreateTaskPage } from "./screens/CreateTaskPage";
import { JobsPage } from "./screens/JobsPage";
import { LandingPage } from "./screens/LandingPage";
import { LoginPage } from "./screens/LoginPage";
import { TaskPage } from "./screens/TaskPage";
import { TasksPage } from "./screens/TasksPage";
import "./tasks.css";

type Route =
    | { screen: "landing" }
    | { screen: "about" }
    | { screen: "login" }
    | { screen: "tasks" }
    | { screen: "create" }
    | { screen: "jobs" }
    | { screen: "task"; taskId: string }
    | { screen: "annotate"; taskId: string; jobId: string };

const protectedScreens = new Set<Route["screen"]>(["tasks", "create", "jobs", "task", "annotate"]);

function locationPath(): string {
    if (typeof window === "undefined") return "/";
    const path = window.location.pathname.replace(/\/$/, "");
    return path || "/";
}

function routeFrom(path: string): Route {
    if (path === "/about") return { screen: "about" };
    if (path === "/login" || path === "/auth/login") return { screen: "login" };
    if (path === "/tasks/new") return { screen: "create" };
    if (path === "/jobs") return { screen: "jobs" };
    const job = path.match(/^\/tasks\/(\d+)\/jobs\/(\d+)$/);
    if (job) return { screen: "annotate", taskId: job[1], jobId: job[2] };
    const task = path.match(/^\/tasks\/(\d+)$/);
    if (task) return { screen: "task", taskId: task[1] };
    if (path === "/tasks") return { screen: "tasks" };
    return { screen: "landing" };
}

function sectionFor(route: Route): DashboardSection {
    if (route.screen === "create" || route.screen === "task" || route.screen === "annotate") return "tasks";
    if (route.screen === "login") return "login";
    return route.screen;
}

export default function App() {
    const [path, setPath] = useState<string | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [account, setAccount] = useState<"unknown" | "in" | "out">("unknown");
    const [afterLogin, setAfterLogin] = useState("/tasks");
    const [visited, setVisited] = useState<string[]>(["landing"]);

    useEffect(() => {
        const sync = () => setPath(locationPath());
        sync();
        window.addEventListener("popstate", sync);
        return () => window.removeEventListener("popstate", sync);
    }, []);

    useEffect(() => {
        api.currentUser()
            .then((user) => {
                setUsername(user.username);
                setAccount("in");
            })
            .catch(() => {
                setUsername(null);
                setAccount("out");
            });
    }, []);

    useEffect(() => {
        if (!path || account !== "out") return;
        const destination = routeFrom(path);
        if (protectedScreens.has(destination.screen)) setAfterLogin(path);
    }, [account, path]);

    const route = routeFrom(path ?? "/");
    const section = sectionFor(route);

    const go = (href: string) => {
        const next = href.startsWith("/") ? href : `/${href}`;
        window.history.pushState(null, "", next);
        const current = locationPath();
        setPath(current);
        const nextSection = sectionFor(routeFrom(current));
        setVisited((seen) => (seen.includes(nextSection) ? seen : [...seen, nextSection]));
    };

    const requireAccount = (href: string) => {
        if (account === "out") {
            setAfterLogin(href);
            go("/login");
            return;
        }
        go(href);
    };

    const openAnnotation = (taskId: string, jobId: string) => {
        requireAccount(api.jobUrl(taskId, jobId));
    };

    const annotateTask = async (taskId: string) => {
        try {
            const jobs = (await api.taskJobs(taskId)).filter((job) => job.type !== "ground_truth");
            if (jobs.length === 1) {
                openAnnotation(taskId, jobs[0].id);
                return;
            }
        } catch {
            /* The task page explains a missing job. */
        }
        go(`/tasks/${taskId}`);
    };

    if (path === null) return null;

    const needsAccount = protectedScreens.has(route.screen);
    const showLogin = route.screen === "login" || (account === "out" && needsAccount);

    if (route.screen === "annotate" && account === "in") {
        return <AnnotatePage key={route.jobId} taskId={route.taskId} jobId={route.jobId} onBack={() => go(`/tasks/${route.taskId}`)} />;
    }

    return (
        <>
            <SiteHeader
                section={showLogin ? "login" : section}
                account={account}
                username={username}
                visited={visited}
                onNavigate={(href) => {
                    const destination = routeFrom(href);
                    if (protectedScreens.has(destination.screen)) requireAccount(href);
                    else go(href);
                }}
                onSignIn={() => {
                    setAfterLogin(needsAccount ? path : "/tasks");
                    go("/login");
                }}
                onSignOut={() => {
                    api.logout().catch(() => undefined);
                    setUsername(null);
                    setAccount("out");
                    go("/");
                }}
            />
            {account === "unknown" && needsAccount && route.screen !== "login" ? (
                <main className="tk-page">
                    <div className="tk-empty-panel" role="status">Loading workspace…</div>
                </main>
            ) : showLogin ? (
                <LoginPage
                    onSubmit={async (name, password) => {
                        const user = await api.login(name, password);
                        setUsername(user.username);
                        setAccount("in");
                        go(afterLogin);
                    }}
                />
            ) : (
                <>
                    {route.screen === "landing" && <LandingPage onOpenTasks={() => requireAccount("/tasks")} />}
                    {route.screen === "about" && <AboutPage />}
                    {route.screen === "tasks" && (
                        <TasksPage
                            onCreate={() => go("/tasks/new")}
                            onOpen={(task) => go(`/tasks/${task.id}`)}
                            onAnnotate={(task) => void annotateTask(task.id)}
                        />
                    )}
                    {route.screen === "create" && (
                        <CreateTaskPage onCancel={() => go("/tasks")} onCreated={(task) => go(`/tasks/${task.id}`)} />
                    )}
                    {route.screen === "task" && (
                        <TaskPage
                            taskId={route.taskId}
                            onBack={() => go("/tasks")}
                            onAnnotate={(jobId) => openAnnotation(route.taskId, jobId)}
                        />
                    )}
                    {route.screen === "jobs" && <JobsPage onOpen={(job) => openAnnotation(job.task_id, job.id)} />}
                </>
            )}
        </>
    );
}
