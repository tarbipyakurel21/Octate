import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { CvatEditor, type CvatEditorHandle, type EditorCommand } from "../components/CvatEditor";
import { Cvat3dEditor, type Cvat3dEditorHandle } from "../components/Cvat3dEditor";
import { OctateBrand } from "../components/OctateBrand";
import type { Annotation, CanvasObjectState, ReviewItem, Task } from "../types";

type Tool = "select" | "move" | "zoom" | "region" | "rectangle" | "polygon" | "polyline" | "points" | "ellipse";

const DRAW_TOOLS: Tool[] = ["rectangle", "polygon", "polyline", "points", "ellipse"];

export function AnnotatePage({
    taskId,
    frame,
    setFrame,
    onBack,
    onReview,
}: {
    taskId: string;
    frame: number;
    setFrame: (frame: number) => void;
    onBack: () => void;
    onReview: () => void;
}) {
    const [task, setTask] = useState<Task | null>(null);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
    const [states, setStates] = useState<CanvasObjectState[]>([]);
    const editor = useRef<CvatEditorHandle>(null);
    const editor3d = useRef<Cvat3dEditorHandle>(null);
    const [dimension, setDimension] = useState<"2d" | "3d">("2d");
    const [tool, setTool] = useState<Tool>("select");
    const [label, setLabel] = useState("");
    const [notice, setNotice] = useState("");
    const [saving, setSaving] = useState(false);
    const [action, setAction] = useState("");
    const [selected, setSelected] = useState<number[]>([]);
    const [playing, setPlaying] = useState(false);
    const [draft, setDraft] = useState("0");
    const frameRef = useRef(frame);
    frameRef.current = frame;

    useEffect(() => {
        let cancel = false;
        api.task(taskId)
            .then((loaded) => {
                if (cancel) return;
                setTask(loaded);
                setLabel(loaded.labels[0]?.name ?? "object");
            })
            .catch((reason: unknown) => {
                if (!cancel) setNotice(reason instanceof Error ? reason.message : "Task could not be loaded");
            });
        api.annotations(taskId)
            .then((rows) => {
                if (!cancel) setAnnotations(rows);
            })
            .catch(() => {
                if (!cancel) setNotice("Saved annotations could not be loaded.");
            });
        api.review(taskId)
            .then((rows) => {
                if (!cancel) setReviewItems(rows);
            })
            .catch(() => undefined);
        return () => {
            cancel = true;
        };
    }, [taskId]);

    const last = Math.max(0, (task?.size ?? 1) - 1);

    useEffect(() => {
        setDraft(String(frame));
    }, [frame]);

    useEffect(() => {
        if (!playing || !task) return;
        const delay = Math.max(40, Math.round(1000 / (task.fps || 30)));
        const id = window.setInterval(() => {
            const next = frameRef.current + 1;
            if (next >= task.size) {
                setPlaying(false);
                return;
            }
            setFrame(next);
        }, delay);
        return () => window.clearInterval(id);
    }, [playing, task, setFrame]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
            const key = event.key.toLowerCase();
            if (key === "f" || event.key === "ArrowRight") {
                event.preventDefault();
                setPlaying(false);
                setFrame(Math.min(last, frameRef.current + 1));
            } else if (key === "d" || event.key === "ArrowLeft") {
                event.preventDefault();
                setPlaying(false);
                setFrame(Math.max(0, frameRef.current - 1));
            } else if (event.key === " ") {
                event.preventDefault();
                setPlaying((value) => !value);
            } else if (event.key === "Escape") {
                setTool("select");
            } else if ((event.key === "Delete" || event.key === "Backspace") && editor.current?.selected().length) {
                event.preventDefault();
                editor.current.command("delete");
            } else if ((event.metaKey || event.ctrlKey) && key === "z") {
                event.preventDefault();
                editor.current?.command(event.shiftKey ? "redo" : "undo");
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [last, setFrame]);

    const marks = [
        ...new Set([
            ...annotations.map((annotation) => annotation.frame),
            ...states.map((state) => state.frame),
            ...reviewItems.filter((item) => item.status === "pending").map((item) => item.frame),
        ]),
    ];

    const run = async (kind: "detect" | "segment" | "track") => {
        const size = editor.current?.size();
        if (!task || !size?.width) {
            setNotice("Wait until the extracted frame has loaded.");
            return;
        }
        setAction(kind);
        setNotice("");
        try {
            const result = await api.infer(kind, task.id, frame, size);
            editor.current?.addAnnotations(result.annotations);
            setAnnotations([...annotations, ...result.annotations]);
            if (result.review_items?.length) setReviewItems([...reviewItems, ...result.review_items]);
            setNotice(result.mode === "deterministic-demo" ? "Deterministic model: no weights are loaded." : "");
        } catch (reason) {
            setNotice(reason instanceof Error ? reason.message : "The model request failed.");
        } finally {
            setAction("");
        }
    };

    const save = async () => {
        if (!task) return;
        setSaving(true);
        setNotice("");
        try {
            if (dimension === "3d" && editor3d.current) {
                await api.saveCanvas3d(task.id, frame, editor3d.current.states());
            } else if (editor.current) {
                const size = editor.current.size();
                await api.saveCanvas(task.id, frame, { objectStates: editor.current.states(), width: size.width, height: size.height });
            }
            setNotice("Saved.");
        } catch (reason) {
            setNotice(reason instanceof Error ? reason.message : "Save failed.");
        } finally {
            setSaving(false);
        }
    };

    const command = (name: EditorCommand, value?: number | boolean) => editor.current?.command(name, value);
    const step = (next: number) => {
        setPlaying(false);
        setFrame(Math.min(last, Math.max(0, next)));
    };
    const commitFrame = () => {
        const next = Number(draft);
        if (Number.isFinite(next)) step(Math.trunc(next));
        else setDraft(String(frame));
    };

    const counts = new Map<string, number>();
    const rows = states.map((state) => {
        const name = state.label?.name || "object";
        const index = (counts.get(name) || 0) + 1;
        counts.set(name, index);
        return { state, title: `${name} ${index}` };
    }).reverse();

    return (
        <main className="anno">
            <header className="anno-top">
                <button type="button" className="anno-menu" onClick={onBack}>
                    <OctateBrand compact /><span>Tasks</span><i>/</i><b>{task?.name || "Job"}</b>
                </button>
                <div className="anno-dimension" role="group" aria-label="Canvas dimension">
                    <button className={dimension === "2d" ? "active" : ""} onClick={() => setDimension("2d")}>2D</button>
                    <button className={dimension === "3d" ? "active" : ""} onClick={() => setDimension("3d")}>3D</button>
                </div>
                <div className="anno-player">
                    <button type="button" title="First frame" onClick={() => step(0)}><Icon name="first" /></button>
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
                            onKeyDown={(event) => {
                                if (event.key === "Enter") commitFrame();
                            }}
                        />
                        <span>/ {task?.size ?? 0}</span>
                    </label>
                    <div className="anno-slider">
                        <input
                            type="range"
                            min={0}
                            max={last}
                            value={Math.min(frame, last)}
                            onChange={(event) => step(Number(event.target.value))}
                        />
                        {marks.map((mark) => (
                            <i key={mark} style={{ left: `${last > 0 ? (mark / last) * 100 : 0}%` }} />
                        ))}
                    </div>
                    <span className="anno-file" title={task?.video_name}>{task?.video_name || task?.name || ""}</span>
                </div>
                <div className="anno-actions">
                    <label>
                        {task && task.labels.length > 0 ? (
                            <select value={label} onChange={(event) => setLabel(event.target.value)}>
                                {task.labels.map((item) => (
                                    <option key={item.id} value={item.name}>{item.name}</option>
                                ))}
                            </select>
                        ) : (
                            <input value={label} onChange={(event) => setLabel(event.target.value)} />
                        )}
                    </label>
                    {(["detect", "segment", "track"] as const).map((kind) => (
                        <button key={kind} type="button" disabled={!!action} onClick={() => run(kind)}>
                            {action === kind ? "…" : kind[0].toUpperCase() + kind.slice(1)}
                        </button>
                    ))}
                    <button type="button" className="anno-save" onClick={save} disabled={saving}>
                        {saving ? "Saving" : "Save"}
                    </button>
                    <button type="button" onClick={onReview}>
                        Review {reviewItems.filter((item) => item.status === "pending").length}
                    </button>
                </div>
            </header>
            <div className="anno-body">
                <aside className="anno-tools">
                    <small>{dimension.toUpperCase()}</small>
                    {dimension === "3d" ? (
                        <>
                            <button type="button" title="Cursor" onClick={() => editor3d.current?.command("cursor")}><Icon name="select" /></button>
                            <button type="button" title="Move point cloud" onClick={() => editor3d.current?.command("move")}><Icon name="move" /></button>
                            <button type="button" title="Draw cuboid" onClick={() => editor3d.current?.command("draw")}><Icon name="cuboid" /></button>
                            <button type="button" title="Fit point cloud" onClick={() => editor3d.current?.command("fit")}><Icon name="fit" /></button>
                            <button type="button" title="Focus selected cuboid" onClick={() => editor3d.current?.command("focus")}><Icon name="focus" /></button>
                            <span className="anno-gap" />
                            <button type="button" title="Group cuboids" onClick={() => editor3d.current?.command("group")}><Icon name="group" /></button>
                            <button type="button" title="Merge cuboids" onClick={() => editor3d.current?.command("merge")}><Icon name="merge" /></button>
                            <button type="button" title="Split track" onClick={() => editor3d.current?.command("split")}><Icon name="split" /></button>
                        </>
                    ) : <>
                    <ToolButton name="select" tool={tool} setTool={setTool} title="Cursor" />
                    <ToolButton name="move" tool={tool} setTool={setTool} title="Move the image" />
                    <ToolButton name="zoom" tool={tool} setTool={setTool} title="Zoom" />
                    <ToolButton name="region" tool={tool} setTool={setTool} title="Select a region" />
                    <span className="anno-gap" />
                    {DRAW_TOOLS.map((name) => (
                        <ToolButton key={name} name={name} tool={tool} setTool={setTool} title={name[0].toUpperCase() + name.slice(1)} />
                    ))}
                    <span className="anno-gap" />
                    <button type="button" title="Fit the frame" onClick={() => command("fit")}><Icon name="fit" /></button>
                    <button type="button" title="Rotate the frame" onClick={() => command("rotate", 90)}><Icon name="rotate" /></button>
                    <button type="button" title="Undo" onClick={() => command("undo")}><Icon name="undo" /></button>
                    <button type="button" title="Redo" onClick={() => command("redo")}><Icon name="redo" /></button>
                    <span className="anno-gap" />
                    <button type="button" title="Group objects (G)" onClick={() => command("group")}><Icon name="group" /></button>
                    <button type="button" title="Merge objects (M)" onClick={() => command("merge")}><Icon name="merge" /></button>
                    <button type="button" title="Join masks" onClick={() => command("join")}><Icon name="join" /></button>
                    <button type="button" title="Slice polygon" onClick={() => command("slice")}><Icon name="slice" /></button>
                    <button type="button" title="Split track" onClick={() => command("split")}><Icon name="split" /></button>
                    </>}
                </aside>
                <div className="anno-canvas">
                    {dimension === "2d" ? <CvatEditor
                        ref={editor}
                        taskId={taskId}
                        frame={frame}
                        label={label}
                        tool={tool}
                        onNotice={setNotice}
                        onSelectionChange={setSelected}
                        onStates={setStates}
                    /> : <Cvat3dEditor
                        ref={editor3d}
                        taskId={taskId}
                        frame={frame}
                        label={label}
                        onNotice={setNotice}
                        onSelectionChange={setSelected}
                        onStatesChange={setStates}
                    />}
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
                            {rows.map(({ state, title }) => {
                                const active = selected.includes(state.clientID);
                                return (
                                    <li key={state.clientID} className={active ? "active" : ""}>
                                        <button type="button" onClick={() => command("activate", state.clientID)}>
                                            <i style={{ background: state.color || "#1890ff" }} />
                                            <span>
                                                <b>{title}</b>
                                                <small>{state.shapeType}{state.source === "manual" ? "" : ` · ${state.source}`}</small>
                                            </span>
                                        </button>
                                        <button type="button" title={state.hidden ? "Show" : "Hide"} className={state.hidden ? "on" : ""} onClick={() => { command("activate", state.clientID); command("hide"); }}>
                                            <Icon name={state.hidden ? "eye-off" : "eye"} />
                                        </button>
                                        <button type="button" title={state.lock ? "Unlock" : "Lock"} className={state.lock ? "on" : ""} onClick={() => { command("activate", state.clientID); command("lock"); }}>
                                            <Icon name="lock" />
                                        </button>
                                        <button type="button" title="Delete" onClick={() => { command("activate", state.clientID); command("delete"); }}>
                                            <Icon name="trash" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </aside>
            </div>
        </main>
    );
}

function ToolButton({
    name,
    tool,
    setTool,
    title,
}: {
    name: Tool;
    tool: Tool;
    setTool: (tool: Tool) => void;
    title: string;
}) {
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
            {name === "cuboid" && <><path d="M5 8l7-4 7 4-7 4-7-4zM5 8v8l7 4 7-4V8M12 12v8" {...common} /></>}
            {name === "focus" && <><circle cx="12" cy="12" r="3" {...common}/><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" {...common}/></>}
            {name === "group" && <><rect x="3" y="7" width="8" height="8" {...common}/><rect x="13" y="9" width="8" height="8" {...common}/></>}
            {name === "merge" && <path d="M5 7h6v4H5zM13 13h6v4h-6zM9 9l6 6" {...common}/>} 
            {name === "split" && <path d="M12 3v6M12 15v6M7 8l5 4 5-4M7 16l5-4 5 4" {...common}/>} 
            {name === "join" && <path d="M4 6h6v6H4zM14 12h6v6h-6zM9 10l6 4" {...common}/>} 
            {name === "slice" && <><path d="M4 18L18 4M7 4l13 13" {...common}/><circle cx="6" cy="19" r="2" {...common}/><circle cx="19" cy="6" r="2" {...common}/></>} 
            {name === "fit" && <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" {...common} />}
            {name === "rotate" && <path d="M19 12a7 7 0 1 1-2-4.9M19 4v4h-4" {...common} />}
            {name === "undo" && <path d="M8 8H4v4M5 10a7 7 0 1 1-1 4" {...common} />}
            {name === "redo" && <path d="M16 8h4v4M19 10a7 7 0 1 0 1 4" {...common} />}
            {name === "first" && <path d="M6 6v12M18 7l-7 5 7 5V7z" {...common} />}
            {name === "prev" && <path d="M15 6l-6 6 6 6" {...common} />}
            {name === "play" && <path d="M8 5.5v13l11-6.5-11-6.5z" {...common} />}
            {name === "pause" && <path d="M8 5v14M16 5v14" {...common} />}
            {name === "next" && <path d="M9 6l6 6-6 6" {...common} />}
            {name === "last" && <path d="M18 6v12M6 7l7 5-7 5V7z" {...common} />}
            {name === "eye" && <><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" {...common} /><circle cx="12" cy="12" r="2.4" {...common} /></>}
            {name === "eye-off" && <path d="M4 5l16 14M9.5 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2M6.2 7.6C4.2 9 2.5 12 2.5 12S6 17.5 12 17.5c1.4 0 2.7-.3 3.8-.8M10 6.7A9 9 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5s-.7 1.1-2 2.3" {...common} />}
            {name === "lock" && <><rect x="6" y="10" width="12" height="9" rx="1.4" {...common} /><path d="M8.5 10V8a3.5 3.5 0 0 1 7 0v2" {...common} /></>}
            {name === "trash" && <path d="M5 8h14M9 8V6h6v2M7 8l1 11h8l1-11" {...common} />}
        </svg>
    );
}
