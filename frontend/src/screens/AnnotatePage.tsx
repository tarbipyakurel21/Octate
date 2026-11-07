import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CvatEditor, type CvatEditorHandle, type Tool } from "../components/CvatEditor";
import { OctateBrand } from "../components/OctateBrand";
import { api } from "../lib/api";
import {
    addObject,
    editGeometry,
    fromServer,
    groupObjects,
    keyFrames,
    removeObjects,
    setOutside,
    statesForFrame,
    toggleFlag,
    toServer,
    type CvatLabel,
    type Geometry,
    type JobModel,
} from "../lib/canvas/jobAnnotations";
import type { TaskJob } from "../types";

const DRAW_TOOLS: Tool[] = ["rectangle", "polygon", "polyline", "points", "ellipse"];
const HISTORY = 100;
const CACHE = 40;

type Loaded = { job: TaskJob; labels: CvatLabel[] };
type History = { past: JobModel[]; present: JobModel; future: JobModel[] };

export function AnnotatePage({ taskId, jobId, onBack }: { taskId: string; jobId: string; onBack: () => void }) {
    const editor = useRef<CvatEditorHandle>(null);
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [history, setHistory] = useState<History | null>(null);
    const [saved, setSaved] = useState<JobModel | null>(null);
    const [frame, setFrame] = useState(0);
    const [image, setImage] = useState<{ number: number; image: ImageBitmap } | null>(null);
    const [tool, setTool] = useState<Tool>("select");
    const [labelId, setLabelId] = useState<number | null>(null);
    const [asTrack, setAsTrack] = useState(false);
    const [selected, setSelected] = useState<number[]>([]);
    const [notice, setNotice] = useState("");
    const [saving, setSaving] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [draft, setDraft] = useState("0");
    const [detectors, setDetectors] = useState<{ id: string; name: string }[]>([]);
    const [detecting, setDetecting] = useState(false);
    const cache = useRef(new Map<number, Promise<ImageBitmap>>());
    const frameRef = useRef(frame);
    frameRef.current = frame;

    const model = history?.present ?? null;
    const dirty = model !== null && model !== saved;
    const first = loaded?.job.start_frame ?? 0;
    const last = loaded?.job.stop_frame ?? 0;

    useEffect(() => {
        let cancel = false;
        Promise.all([api.job(jobId), api.jobLabels(jobId), api.jobAnnotations(jobId)])
            .then(([job, labels, annotations]) => {
                if (cancel) return;
                const initial = fromServer(annotations);
                setLoaded({ job, labels });
                setHistory({ past: [], present: initial, future: [] });
                setSaved(initial);
                setFrame(job.start_frame);
                setLabelId(labels[0]?.id ?? null);
            })
            .catch((reason: unknown) => {
                if (!cancel) setNotice(reason instanceof Error ? reason.message : "This job could not be loaded.");
            });
        api.detectors().then((items) => !cancel && setDetectors(items)).catch(() => undefined);
        return () => {
            cancel = true;
        };
    }, [jobId]);

    const bitmap = useCallback(
        (number: number) => {
            const known = cache.current.get(number);
            if (known) return known;
            const pending = fetch(api.jobFrameUrl(jobId, number), { credentials: "same-origin" })
                .then((response) => {
                    if (!response.ok) throw new Error(`Frame ${number} could not be loaded.`);
                    return response.blob();
                })
                .then((blob) => createImageBitmap(blob));
            pending.catch(() => cache.current.delete(number));
            cache.current.set(number, pending);
            if (cache.current.size > CACHE) cache.current.delete(cache.current.keys().next().value as number);
            return pending;
        },
        [jobId],
    );

    useEffect(() => {
        if (!loaded) return;
        let cancel = false;
        bitmap(frame)
            .then((next) => !cancel && setImage({ number: frame, image: next }))
            .catch((reason: unknown) => !cancel && setNotice(reason instanceof Error ? reason.message : "Frame failed."));
        if (frame + 1 <= last) void bitmap(frame + 1).catch(() => undefined);
        return () => {
            cancel = true;
        };
    }, [bitmap, frame, last, loaded]);

    useEffect(() => setDraft(String(frame)), [frame]);

    useEffect(() => {
        if (!playing) return;
        const id = window.setInterval(() => {
            if (frameRef.current >= last) setPlaying(false);
            else setFrame(frameRef.current + 1);
        }, 1000 / 25);
        return () => window.clearInterval(id);
    }, [playing, last]);

    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    const commit = useCallback((change: (current: JobModel) => JobModel) => {
        setHistory((current) => {
            if (!current) return current;
            const next = change(current.present);
            if (next === current.present) return current;
            return { past: [...current.past, current.present].slice(-HISTORY), present: next, future: [] };
        });
    }, []);

    const undo = () =>
        setHistory((current) =>
            current?.past.length
                ? { past: current.past.slice(0, -1), present: current.past[current.past.length - 1], future: [current.present, ...current.future] }
                : current,
        );
    const redo = () =>
        setHistory((current) =>
            current?.future.length
                ? { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) }
                : current,
        );

    const states = useMemo(
        () => (model && loaded && image ? statesForFrame(model, image.number, loaded.labels) : []),
        [model, loaded, image],
    );

    const step = (next: number) => {
        setPlaying(false);
        setSelected([]);
        setFrame(Math.min(last, Math.max(first, next)));
    };

    const save = async () => {
        if (!model) return;
        setSaving(true);
        setNotice("");
        try {
            await api.saveJobAnnotations(jobId, toServer(model));
            setSaved(model);
            setNotice("Saved.");
        } catch (reason) {
            setNotice(reason instanceof Error ? reason.message : "Save failed.");
        } finally {
            setSaving(false);
        }
    };

    const detect = async (functionId: string) => {
        if (!loaded) return;
        setDetecting(true);
        setNotice("");
        try {
            const shapes = await api.detect(functionId, { task: Number(taskId), job: Number(jobId), frame, threshold: 0.5 });
            const byName = new Map(loaded.labels.map((label) => [label.name.toLowerCase(), label.id]));
            const known = new Set(loaded.labels.map((label) => label.id));
            const matched = shapes.flatMap((shape) => {
                const id = shape.label_id != null && known.has(shape.label_id)
                    ? shape.label_id
                    : byName.get(String(shape.label ?? "").toLowerCase());
                return id == null ? [] : [{ frame, type: shape.type, points: shape.points, rotation: shape.rotation, labelId: id, source: "auto" }];
            });
            if (matched.length) commit((current) => matched.reduce(addObject, current));
            setNotice(shapes.length ? `${matched.length} of ${shapes.length} detections match a task label.` : "No detections on this frame.");
        } catch (reason) {
            setNotice(reason instanceof Error ? reason.message : "The model request failed.");
        } finally {
            setDetecting(false);
        }
    };

    const onDrawn = useCallback((shapeType: string, geometry: Geometry) => {
        if (labelId == null) {
            setNotice("This task has no labels to draw with.");
            return;
        }
        commit((current) => addObject(current, { ...geometry, frame: frameRef.current, type: shapeType, labelId, track: asTrack }));
    }, [asTrack, commit, labelId]);

    const onEdited = useCallback(
        (clientID: number, geometry: Geometry) => commit((current) => editGeometry(current, clientID, frameRef.current, geometry)),
        [commit],
    );
    const onGrouped = useCallback((ids: number[]) => commit((current) => groupObjects(current, ids)), [commit]);
    const onSelection = useCallback((ids: number[]) => setSelected(ids), []);
    const onError = useCallback((message: string) => setNotice(message), []);

    const act = (ids: number[], action: "delete" | "hide" | "lock" | "outside") => {
        if (!ids.length) return;
        if (action === "delete") {
            commit((current) => removeObjects(current, ids));
            setSelected([]);
        } else if (action === "outside") commit((current) => setOutside(current, ids, frameRef.current));
        else commit((current) => toggleFlag(current, ids, action === "hide" ? "hidden" : "lock"));
    };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
            const key = event.key.toLowerCase();
            const mod = event.metaKey || event.ctrlKey;
            if (mod && key === "s") {
                event.preventDefault();
                void save();
            } else if (mod && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redo();
                else undo();
            } else if (key === "f" || event.key === "ArrowRight") {
                event.preventDefault();
                step(frameRef.current + 1);
            } else if (key === "d" || event.key === "ArrowLeft") {
                event.preventDefault();
                step(frameRef.current - 1);
            } else if (event.key === " ") {
                event.preventDefault();
                setPlaying((value) => !value);
            } else if (event.key === "Escape") {
                setTool("select");
            } else if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                act(selected, "delete");
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    const commitFrame = () => {
        const next = Number(draft);
        if (Number.isFinite(next)) step(Math.trunc(next));
        else setDraft(String(frame));
    };

    const marks = model ? keyFrames(model) : [];
    const span = Math.max(1, last - first);
    const counts = new Map<string, number>();
    const rows = states
        .map((state) => {
            const name = state.label.name;
            const index = (counts.get(name) || 0) + 1;
            counts.set(name, index);
            return { state, title: `${name} ${index}` };
        })
        .reverse();

    return (
        <main className="anno">
            <header className="anno-top">
                <button type="button" className="anno-menu" onClick={onBack}>
                    <OctateBrand compact /><span>Task {taskId}</span><i>/</i><b>Job {jobId}</b>
                </button>
                <div className="anno-player">
                    <button type="button" title="First frame" onClick={() => step(first)}><Icon name="first" /></button>
                    <button type="button" title="Previous frame (D)" onClick={() => step(frame - 1)}><Icon name="prev" /></button>
                    <button type="button" className="anno-play" title="Play or pause (Space)" onClick={() => setPlaying((value) => !value)}>
                        <Icon name={playing ? "pause" : "play"} />
                    </button>
                    <button type="button" title="Next frame (F)" onClick={() => step(frame + 1)}><Icon name="next" /></button>
                    <button type="button" title="Last frame" onClick={() => step(last)}><Icon name="last" /></button>
                    <label className="anno-frame">
                        <input
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onBlur={commitFrame}
                            onKeyDown={(event) => event.key === "Enter" && commitFrame()}
                        />
                        <span>/ {last}</span>
                    </label>
                    <div className="anno-slider">
                        <input type="range" min={first} max={last} value={frame} onChange={(event) => step(Number(event.target.value))} />
                        {marks.map((mark) => <i key={mark} style={{ left: `${((mark - first) / span) * 100}%` }} />)}
                    </div>
                </div>
                <div className="anno-actions">
                    <select value={labelId ?? ""} onChange={(event) => setLabelId(Number(event.target.value))} disabled={!loaded?.labels.length}>
                        {loaded?.labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
                    </select>
                    <label className="anno-track">
                        <input type="checkbox" checked={asTrack} onChange={(event) => setAsTrack(event.target.checked)} /> Track
                    </label>
                    {detectors.map((item) => (
                        <button key={item.id} type="button" disabled={detecting || !image} onClick={() => void detect(item.id)} title={item.name}>
                            {detecting ? "Detecting…" : "Detect"}
                        </button>
                    ))}
                    <button type="button" className="anno-save" onClick={() => void save()} disabled={saving || !dirty}>
                        {saving ? "Saving" : "Save"}
                    </button>
                </div>
            </header>
            <div className="anno-body">
                <aside className="anno-tools">
                    <small>2D</small>
                    <ToolButton name="select" tool={tool} setTool={setTool} title="Cursor (Esc)" />
                    <ToolButton name="move" tool={tool} setTool={setTool} title="Move the image" />
                    <ToolButton name="zoom" tool={tool} setTool={setTool} title="Zoom to a region" />
                    <ToolButton name="region" tool={tool} setTool={setTool} title="Select objects in a region" />
                    <span className="anno-gap" />
                    {DRAW_TOOLS.map((name) => (
                        <ToolButton key={name} name={name} tool={tool} setTool={setTool} title={name[0].toUpperCase() + name.slice(1)} />
                    ))}
                    <span className="anno-gap" />
                    <button type="button" title="Fit the frame" onClick={() => editor.current?.fit()}><Icon name="fit" /></button>
                    <button type="button" title="Rotate the frame" onClick={() => editor.current?.rotate(90)}><Icon name="rotate" /></button>
                    <button type="button" title="Show or hide the grid" onClick={() => editor.current?.grid()}><Icon name="grid" /></button>
                    <button type="button" title="Undo (Ctrl+Z)" disabled={!history?.past.length} onClick={undo}><Icon name="undo" /></button>
                    <button type="button" title="Redo (Ctrl+Shift+Z)" disabled={!history?.future.length} onClick={redo}><Icon name="redo" /></button>
                    <span className="anno-gap" />
                    <button type="button" title="Group objects" onClick={() => editor.current?.group()}><Icon name="group" /></button>
                </aside>
                <div className="anno-canvas">
                    <CvatEditor
                        ref={editor}
                        frame={image}
                        states={states}
                        tool={tool}
                        onDrawn={onDrawn}
                        onEdited={onEdited}
                        onSelectionChange={onSelection}
                        onGrouped={onGrouped}
                        onError={onError}
                    />
                    {notice && <p className="anno-note">{notice}</p>}
                </div>
                <aside className="anno-objects">
                    <header>
                        <strong>Objects</strong>
                        <span>{states.length}</span>
                    </header>
                    {rows.length === 0 ? (
                        <p>No objects on this frame.</p>
                    ) : (
                        <ul>
                            {rows.map(({ state, title }) => (
                                <li key={state.clientID} className={selected.includes(state.clientID) ? "active" : ""}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelected([state.clientID]);
                                            editor.current?.activate(state.clientID);
                                            editor.current?.select([state.clientID]);
                                        }}
                                        onDoubleClick={() => editor.current?.focus(state.clientID)}
                                    >
                                        <i style={{ background: state.color }} />
                                        <span>
                                            <b>{title}</b>
                                            <small>
                                                {state.shapeType}
                                                {state.objectType === "track" ? ` · track${state.keyframe ? " keyframe" : ""}` : ""}
                                                {state.source === "manual" ? "" : ` · ${state.source}`}
                                            </small>
                                        </span>
                                    </button>
                                    {state.objectType === "track" && (
                                        <button type="button" title="End the track on this frame" onClick={() => act([state.clientID], "outside")}>
                                            <Icon name="outside" />
                                        </button>
                                    )}
                                    <button type="button" title={state.hidden ? "Show" : "Hide"} className={state.hidden ? "on" : ""} onClick={() => act([state.clientID], "hide")}>
                                        <Icon name={state.hidden ? "eye-off" : "eye"} />
                                    </button>
                                    <button type="button" title={state.lock ? "Unlock" : "Lock"} className={state.lock ? "on" : ""} onClick={() => act([state.clientID], "lock")}>
                                        <Icon name="lock" />
                                    </button>
                                    <button type="button" title="Delete" onClick={() => act([state.clientID], "delete")}>
                                        <Icon name="trash" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </aside>
            </div>
        </main>
    );
}

function ToolButton({ name, tool, setTool, title }: { name: Tool; tool: Tool; setTool: (tool: Tool) => void; title: string }) {
    return (
        <button type="button" title={title} className={tool === name ? "active" : ""} onClick={() => setTool(name)}>
            <Icon name={name} />
        </button>
    );
}

function Icon({ name }: { name: string }) {
    const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            {name === "select" && <path d="M5 3.5l5.2 14.2 2.1-5.1 5.2-1.2L5 3.5z" {...common} />}
            {name === "move" && <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" {...common} />}
            {name === "zoom" && <><circle cx="10.5" cy="10.5" r="5.5" {...common} /><path d="M15 15l4 4M10.5 8v5M8 10.5h5" {...common} /></>}
            {name === "region" && <path d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" {...common} />}
            {name === "rectangle" && <rect x="4.5" y="6" width="15" height="12" rx="1" {...common} />}
            {name === "polygon" && <path d="M12 4l7 5.2-2.6 8.3H7.6L5 9.2 12 4z" {...common} />}
            {name === "polyline" && <path d="M4 16l5-8 4 5 7-9" {...common} />}
            {name === "points" && <><circle cx="7" cy="8" r="1.4" fill="currentColor" /><circle cx="12" cy="15" r="1.4" fill="currentColor" /><circle cx="17" cy="7" r="1.4" fill="currentColor" /></>}
            {name === "ellipse" && <ellipse cx="12" cy="12" rx="7.5" ry="5" {...common} />}
            {name === "group" && <><rect x="3" y="7" width="8" height="8" {...common} /><rect x="13" y="9" width="8" height="8" {...common} /></>}
            {name === "fit" && <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" {...common} />}
            {name === "grid" && <path d="M4 4h16v16H4zM4 12h16M12 4v16" {...common} />}
            {name === "rotate" && <path d="M19 12a7 7 0 1 1-2-4.9M19 4v4h-4" {...common} />}
            {name === "undo" && <path d="M8 8H4v4M5 10a7 7 0 1 1-1 4" {...common} />}
            {name === "redo" && <path d="M16 8h4v4M19 10a7 7 0 1 0 1 4" {...common} />}
            {name === "first" && <path d="M6 6v12M18 7l-7 5 7 5V7z" {...common} />}
            {name === "prev" && <path d="M15 6l-6 6 6 6" {...common} />}
            {name === "play" && <path d="M8 5.5v13l11-6.5-11-6.5z" {...common} />}
            {name === "pause" && <path d="M8 5v14M16 5v14" {...common} />}
            {name === "next" && <path d="M9 6l6 6-6 6" {...common} />}
            {name === "last" && <path d="M18 6v12M6 7l7 5-7 5V7z" {...common} />}
            {name === "outside" && <path d="M5 12h9M11 8l4 4-4 4M19 5v14" {...common} />}
            {name === "eye" && <><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" {...common} /><circle cx="12" cy="12" r="2.4" {...common} /></>}
            {name === "eye-off" && <path d="M4 5l16 14M9.5 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2M6.2 7.6C4.2 9 2.5 12 2.5 12S6 17.5 12 17.5c1.4 0 2.7-.3 3.8-.8M10 6.7A9 9 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5s-.7 1.1-2 2.3" {...common} />}
            {name === "lock" && <><rect x="6" y="10" width="12" height="9" rx="1.4" {...common} /><path d="M8.5 10V8a3.5 3.5 0 0 1 7 0v2" {...common} /></>}
            {name === "trash" && <path d="M5 8h14M9 8V6h6v2M7 8l1 11h8l1-11" {...common} />}
        </svg>
    );
}
