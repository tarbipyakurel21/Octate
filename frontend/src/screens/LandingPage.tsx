import { Upload } from "lucide-react";

export function LandingPage({ onOpenTasks }: { onOpenTasks: () => void }) {
    return (
        <main className="landing">
            <section className="landing-hero">
                <h1>
                    Turn surgical video into <em>trusted annotation.</em>
                </h1>
                <p>
                    Upload a video as a task. FFmpeg extracts every frame, then you label those frames and run a model on the frame you are looking at.
                </p>
                <button className="primary landing-action" onClick={onOpenTasks}>
                    Open tasks <Upload />
                </button>
            </section>
        </main>
    );
}
