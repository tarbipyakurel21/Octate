import { useState } from "react";
import { Upload } from "lucide-react";
import { api, type TaskDraft } from "../lib/api";
import { SURGICAL_PROTOCOLS } from "../lib/surgical";
import type { Task } from "../types";

export function CreateTaskPage({ onCancel, onCreated }: { onCancel: () => void; onCreated: (task: Task) => void }) {
    const [name, setName] = useState("");
    const [protocol, setProtocol] = useState(SURGICAL_PROTOCOLS[0].id);
    const [labelInput, setLabelInput] = useState("");
    const [labels, setLabels] = useState<string[]>(SURGICAL_PROTOCOLS[0].labels);
    const [file, setFile] = useState<File | null>(null);
    const [imageQuality, setImageQuality] = useState(70);
    const [segmentSize, setSegmentSize] = useState(0);
    const [advanced, setAdvanced] = useState(false);
    const [qualityOpen, setQualityOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [phase, setPhase] = useState<"upload" | "extract" | "">("");
    const [loaded, setLoaded] = useState(0);
    const [error, setError] = useState("");

    const addLabel = () => {
        const next = labelInput.trim();
        if (!next || labels.includes(next)) return;
        setLabels([...labels, next]);
        setLabelInput("");
    };

    const submit = async () => {
        if (!name.trim() || !file) return;
        const draft: TaskDraft = {
            name: name.trim(),
            labels,
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
        <main className="tk-create">
            <h1>Create a new task</h1>
            <section className="tk-form">
                <h2>Basic configuration</h2>
                <label>
                    Name <i>*</i>
                    <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label>
                    Procedure
                    <select
                        value={protocol}
                        onChange={(event) => {
                            const next = SURGICAL_PROTOCOLS.find((item) => item.id === event.target.value);
                            setProtocol(event.target.value);
                            if (next) setLabels(next.labels);
                        }}
                    >
                        {SURGICAL_PROTOCOLS.map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                    </select>
                </label>
                <label>
                    Labels
                    <span className="tk-label-row">
                        <input
                            value={labelInput}
                            placeholder="Add a label"
                            onChange={(event) => setLabelInput(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    addLabel();
                                }
                            }}
                        />
                        <button type="button" onClick={addLabel}>
                            Add
                        </button>
                    </span>
                </label>
                {labels.length > 0 && (
                    <ul className="tk-labels">
                        {labels.map((label) => (
                            <li key={label}>
                                {label}
                                <button type="button" aria-label={`Remove ${label}`} onClick={() => setLabels(labels.filter((item) => item !== label))}>
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="tk-actions">
                    <button className="tk-primary" disabled={!name.trim() || !file || labels.length === 0 || submitting} onClick={submit}>
                        {submitting ? "Creating" : "Create task"}
                    </button>
                    <button type="button" onClick={onCancel} disabled={submitting}>
                        Cancel
                    </button>
                </div>
                <p className="tk-required">
                    Video <i>*</i>
                </p>
                <label className="tk-drop">
                    <Upload />
                    <strong>Click or drag a video to this area</strong>
                    <span>CVAT decodes the video, builds frame chunks, and creates the annotation job.</span>
                    <input
                        type="file"
                        accept="video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v"
                        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                </label>
                {file && <p className="tk-file">{file.name}</p>}
                <button type="button" className="tk-disclosure" onClick={() => setAdvanced(!advanced)}>
                    {advanced ? "▾" : "▸"} Advanced configuration
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
                <button type="button" className="tk-disclosure" onClick={() => setQualityOpen(!qualityOpen)}>
                    {qualityOpen ? "▾" : "▸"} Quality
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
                {error && <p className="tk-error">{error}</p>}
            </section>
        </main>
    );
}
