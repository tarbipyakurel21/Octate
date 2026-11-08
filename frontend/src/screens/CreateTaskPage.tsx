import { useState } from "react";
import { ChevronDown, Upload } from "lucide-react";
import { api, type TaskDraft } from "../lib/api";
import type { Task } from "../types";

export function CreateTaskPage({ onCancel, onCreated }: { onCancel: () => void; onCreated: (task: Task) => void }) {
    const [name, setName] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [imageQuality, setImageQuality] = useState(70);
    const [segmentSize, setSegmentSize] = useState(0);
    const [advanced, setAdvanced] = useState(false);
    const [qualityOpen, setQualityOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [phase, setPhase] = useState<"upload" | "extract" | "">("");
    const [loaded, setLoaded] = useState(0);
    const [error, setError] = useState("");

    const submit = async () => {
        if (!name.trim() || !file) return;
        const draft: TaskDraft = {
            name: name.trim(),
            imageQuality,
            segmentSize,
            file,
        };
        setSubmitting(true);
        setError("");
        setPhase("upload");
        setLoaded(0);
        try {
            const task = await api.uploadTask(draft, (sent, total) => {
                setLoaded(total ? sent / total : 0);
                if (total && sent >= total) setPhase("extract");
            });
            onCreated(task);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "The task could not be created");
            setPhase("");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="tk-page tk-page-narrow">
            <form
                className="tk-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <label>
                    Name <i>*</i>
                    <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <p className="tk-note">The instrument detector adds its own labels when the task is created.</p>
                <p className="tk-required">
                    Video <i>*</i>
                </p>
                <label className={`tk-drop ${file ? "has-file" : ""}`}>
                    <Upload />
                    <strong>{file ? file.name : "Click or drag a video to this area"}</strong>
                    <span>The video is decoded, split into frame chunks, and turned into an annotation job.</span>
                    <input
                        type="file"
                        accept="video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v"
                        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                </label>
                <button type="button" className={`tk-disclosure ${advanced ? "open" : ""}`} onClick={() => setAdvanced(!advanced)}>
                    <ChevronDown /> Advanced configuration
                </button>
                {advanced && (
                    <label>
                        Segment size
                        <input
                            type="number"
                            min={0}
                            value={segmentSize || ""}
                            placeholder="All frames in one job"
                            onChange={(event) => setSegmentSize(Math.max(0, Number(event.target.value) || 0))}
                        />
                        <small>A job is a frame range. Leave this empty to keep the whole video in one job.</small>
                    </label>
                )}
                <button type="button" className={`tk-disclosure ${qualityOpen ? "open" : ""}`} onClick={() => setQualityOpen(!qualityOpen)}>
                    <ChevronDown /> Quality
                </button>
                {qualityOpen && (
                    <label>
                        Image quality {imageQuality}
                        <input
                            type="range"
                            min={1}
                            max={100}
                            value={imageQuality}
                            onChange={(event) => setImageQuality(Number(event.target.value))}
                        />
                        <small>Passed to FFmpeg when it writes the frame JPEGs.</small>
                    </label>
                )}
                {submitting && (
                    <p className="tk-banner">
                        {phase === "extract"
                            ? "Extracting frames with FFmpeg…"
                            : `Uploading task data to the server ${Math.round(loaded * 100)}%.`}
                    </p>
                )}
                {error && <p className="tk-error" role="alert">{error}</p>}
                <div className="tk-actions">
                    <button type="button" onClick={onCancel} disabled={submitting}>
                        Cancel
                    </button>
                    <button className="tk-primary" type="submit" disabled={!name.trim() || !file || submitting}>
                        {submitting ? "Creating…" : "Create task"}
                    </button>
                </div>
            </form>
        </main>
    );
}
