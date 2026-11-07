import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ReviewItem } from "../types";

export function ReviewPage({
    taskId,
    onBack,
    onJump,
}: {
    taskId: string;
    onBack: () => void;
    onJump: (frame: number) => void;
}) {
    const [items, setItems] = useState<ReviewItem[]>([]);
    const [error, setError] = useState("");
    const pending = items.filter((item) => item.status === "pending");
    const active = pending[0] ?? items[0];

    useEffect(() => {
        api.review(taskId)
            .then(setItems)
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Review items could not be loaded"));
    }, [taskId]);

    const update = async (status: "approved" | "rejected") => {
        if (!active) return;
        setItems(items.map((item) => (item.id === active.id ? { ...item, status } : item)));
        try {
            await api.reviewItem(active.id, status);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "The review update failed");
        }
    };

    return (
        <main className="tk-page">
            <div className="tk-editor-bar">
                <button type="button" onClick={onBack}>
                    Tasks
                </button>
                <strong>Review</strong>
            </div>
            {error && <p className="tk-error">{error}</p>}
            {!active && !error && <p className="tk-empty">Nothing is waiting for review.</p>}
            {active && (
                <article className="tk-review">
                    <img src={api.frameUrl(taskId, active.frame)} alt={`Frame ${active.frame}`} />
                    <div>
                        <h1>Frame {active.frame}</h1>
                        {active.reasons.map((reason) => (
                            <p key={reason}>{reason}</p>
                        ))}
                        <p>Uncertainty {Math.round(active.score * 100)}%</p>
                        <div className="tk-actions">
                            <button type="button" onClick={() => update("rejected")}>
                                Reject
                            </button>
                            <button type="button" onClick={() => onJump(active.frame)}>
                                Correct on the frame
                            </button>
                            <button type="button" className="tk-primary" onClick={() => update("approved")}>
                                Approve
                            </button>
                        </div>
                    </div>
                </article>
            )}
        </main>
    );
}
