import { ArrowRight } from "lucide-react";

export function LandingPage({ onOpenTasks }: { onOpenTasks: () => void }) {
    return (
        <main className="landing">
            <section className="landing-hero">
                <h1>
                    Turn surgical video into <em>trusted annotation.</em>
                </h1>
                <p>
                    The Octate dashboard holds tasks and jobs. The annotation workspace keeps shapes, tracks, masks, and the timeline.
                </p>
                <button className="primary landing-action" onClick={onOpenTasks}>
                    Open tasks <ArrowRight />
                </button>
            </section>
        </main>
    );
}
