import { useState } from "react";
import { SiteHeader } from "./components/SiteHeader";
import { AboutPage } from "./screens/AboutPage";
import { AnnotatePage } from "./screens/AnnotatePage";
import { CreateTaskPage } from "./screens/CreateTaskPage";
import { LandingPage } from "./screens/LandingPage";
import { ReviewPage } from "./screens/ReviewPage";
import { TasksPage } from "./screens/TasksPage";
import "./tasks.css";

type Screen = "landing" | "about" | "tasks" | "create" | "annotate" | "review";

export default function App() {
    const [screen, setScreen] = useState<Screen>("landing");
    const [taskId, setTaskId] = useState<string | null>(null);
    const [frame, setFrame] = useState(0);
    const [visited, setVisited] = useState<Screen[]>(["landing"]);

    const navigate = (next: Screen) => {
        setVisited((current) => current.includes(next) ? current : [...current, next]);
        setScreen(next);
    };

    const openTask = (id: string) => {
        setTaskId(id);
        setFrame(0);
        navigate("annotate");
    };

    return (
        <>
            {screen === "annotate" ? null : (
                <SiteHeader
                    screen={screen}
                    onNavigate={(next) => navigate(next)}
                    visited={visited}
                />
            )}
            {screen === "landing" && <LandingPage onOpenTasks={() => navigate("tasks")} />}
            {screen === "about" && <AboutPage />}
            {screen === "tasks" && <TasksPage onCreate={() => navigate("create")} onOpen={(task) => openTask(task.id)} />}
            {screen === "create" && (
                <CreateTaskPage
                    onCancel={() => navigate("tasks")}
                    onCreated={() => navigate("tasks")}
                />
            )}
            {screen === "annotate" && taskId && (
                <AnnotatePage
                    taskId={taskId}
                    frame={frame}
                    setFrame={setFrame}
                    onBack={() => navigate("tasks")}
                    onReview={() => navigate("review")}
                />
            )}
            {screen === "review" && taskId && (
                <ReviewPage
                    taskId={taskId}
                    onBack={() => navigate("tasks")}
                    onJump={(next) => {
                        setFrame(next);
                        navigate("annotate");
                    }}
                />
            )}
        </>
    );
}
