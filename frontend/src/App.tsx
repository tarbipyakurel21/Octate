import { useEffect, useState } from "react";
import { SiteHeader, type DashboardSection } from "./components/SiteHeader";
import { api } from "./lib/api";
import { AboutPage } from "./screens/AboutPage";
import { CreateTaskPage } from "./screens/CreateTaskPage";
import { JobsPage } from "./screens/JobsPage";
import { LandingPage } from "./screens/LandingPage";
import { LoginPage } from "./screens/LoginPage";
import { ProjectPage } from "./screens/ProjectPage";
import { ProjectsPage } from "./screens/ProjectsPage";
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
    | { screen: "projects" }
    | { screen: "project"; projectId: string }
    | { screen: "task"; taskId: string };

const protectedScreens = new Set<Route["screen"]>(["tasks", "create", "jobs", "projects", "project", "task"]);

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
    if (path === "/projects") return { screen: "projects" };
    const project = path.match(/^\/projects\/(\d+)$/);
    if (project) return { screen: "project", projectId: project[1] };
    const task = path.match(/^\/tasks\/(\d+)$/);
    if (task) return { screen: "task", taskId: task[1] };
    if (path === "/tasks") return { screen: "tasks" };
    return { screen: "landing" };
}

function sectionFor(route: Route): DashboardSection {
    if (route.screen === "create" || route.screen === "task") return "tasks";
    if (route.screen === "project") return "projects";
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
        window.location.assign(api.jobUrl(taskId, jobId));
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
                    <p className="tk-note">Loading workspace…</p>
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
                    {route.screen === "projects" && <ProjectsPage onOpen={(project) => go(`/projects/${project.id}`)} />}
                    {route.screen === "project" && (
                        <ProjectPage
                            projectId={route.projectId}
                            onBack={() => go("/projects")}
                            onOpenTask={(task) => go(`/tasks/${task.id}`)}
                            onAnnotate={(task) => void annotateTask(task.id)}
                        />
                    )}
                </>
            )}
        </>
    );
}
