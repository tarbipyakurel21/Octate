import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CvatEditor, type CvatEditorHandle, type Tool } from "../components/CvatEditor";
import { OctateBrand } from "../components/OctateBrand";
import { SelectedObjectMover } from "../components/SelectedObjectMover";
import { api } from "../lib/api";
import {
    addObject,
    addTrackSequence,
    editGeometry,
    fromServer,
    groupObjects,
    keyFrames,
    removeObjects,
    setLabel,
    setOutside,
    statesForFrame,
    toggleFlag,
    toServer,
    translatePoints,
    type CvatLabel,
    type Geometry,
    type JobModel,
} from "../lib/canvas/jobAnnotations";
import type { CvatModel } from "../lib/api";
import type { TaskJob } from "../types";

const DRAW_TOOLS: { name: Tool; title: string }[] = [
    { name: "move", title: "Move selected region (M)" },
    { name: "rectangle", title: "Rectangle (B)" },
    { name: "polygon", title: "Polygon (P) - Press Enter or N to finish" },
    { name: "polyline", title: "Polyline (L) - Press Enter or N to finish" },
    { name: "points", title: "Points (O) - Press Enter or N to finish" },
    { name: "ellipse", title: "Ellipse (E)" },
];
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
    const [models, setModels] = useState<CvatModel[]>([]);
    const [modelBusy, setModelBusy] = useState(false);
    const [aiOpen, setAiOpen] = useState(false);
    const [aiTab, setAiTab] = useState<"prompting" | "auto" | "tracking">("prompting");
    const [rightTab, setRightTab] = useState<"objects" | "labels">("objects");
    const [threshold, setThreshold] = useState(0.5);
    const [trackFrames, setTrackFrames] = useState(30);
    const [newLabelName, setNewLabelName] = useState("");
    const [newLabelColor, setNewLabelColor] = useState("#1890ff");
    const [labelBusy, setLabelBusy] = useState(false);
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
        api.models().then((items) => !cancel && setModels(items)).catch(() => undefined);
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
    const detector = models.find((item) => item.kind === "detector");
    const interactor = models.find((item) => item.kind === "interactor");
    const tracker = models.find((item) => item.kind === "tracker");

    const step = (next: number) => {
        setPlaying(false);
        setSelected([]);
        setFrame(Math.min(last, Math.max(first, next)));
    };

    const assignLabel = useCallback((clientIDs: number[], targetLabelId: number) => {
        commit((current) => setLabel(current, clientIDs, targetLabelId));
        const labelName = loaded?.labels.find((l) => l.id === targetLabelId)?.name ?? "label";
        setNotice(`Assigned "${labelName}" to ${clientIDs.length} object${clientIDs.length > 1 ? "s" : ""}.`);
    }, [commit, loaded]);

    const createEmptyObject = useCallback(() => {
        const imgW = image?.image.width ?? 800;
        const imgH = image?.image.height ?? 600;
        const boxW = Math.max(80, Math.round(imgW * 0.2));
        const boxH = Math.max(80, Math.round(imgH * 0.2));
        const cx = Math.round(imgW / 2);
        const cy = Math.round(imgH / 2);
        const points = [
            Math.round(cx - boxW / 2),
            Math.round(cy - boxH / 2),
            Math.round(cx + boxW / 2),
            Math.round(cy + boxH / 2),
        ];
        let newID = 0;
        commit((current) => {
            newID = current.nextID;
            return addObject(current, {
                frame: frameRef.current,
                type: "rectangle",
                points,
                labelId: 0,
                source: "manual",
                track: asTrack,
            });
        });
        setSelected([newID]);
        setTool("move");
        setRightTab("objects");
        setNotice("Empty object created. Move it into place and assign a label.");
    }, [asTrack, commit, image]);

    const save = async () => {
        if (!model) return;
        const knownLabelIds = new Set(loaded?.labels.map((l) => l.id) ?? []);
        const unassigned = [
            ...model.shapes.filter((s) => !s.label_id || !knownLabelIds.has(s.label_id)),
            ...model.tracks.filter((t) => !t.label_id || !knownLabelIds.has(t.label_id)),
        ];
        if (unassigned.length > 0) {
            setNotice(`Cannot save: ${unassigned.length} object${unassigned.length > 1 ? "s have" : " has"} no label assigned. Please assign a label first.`);
            setSelected([unassigned[0].clientID]);
            setRightTab("objects");
            return;
        }
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
        setModelBusy(true);
        setNotice("");
        try {
            const shapes = await api.detect(functionId, { task: Number(taskId), job: Number(jobId), frame, threshold });
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
            setModelBusy(false);
        }
    };

    const updateState = async (state: string) => {
        if (!loaded) return;
        const previous = loaded.job.state;
        setLoaded({ ...loaded, job: { ...loaded.job, state } });
        try {
            await api.updateJobState(jobId, state);
            setNotice(`Job state changed to ${state}.`);
        } catch (reason) {
            setLoaded({ ...loaded, job: { ...loaded.job, state: previous } });
            setNotice(reason instanceof Error ? reason.message : "Could not update job state.");
        }
    };

    const addLabel = async (name: string, color?: string) => {
        if (!name.trim() || !loaded) return;
        setLabelBusy(true);
        try {
            const updatedLabels = await api.addLabel(taskId, jobId, name.trim(), color);
            setLoaded({ ...loaded, labels: updatedLabels });
            const created = updatedLabels.find((l) => l.name.toLowerCase() === name.trim().toLowerCase());
            if (created) setLabelId(created.id);
            setNewLabelName("");
            setNotice(`Label "${name.trim()}" added.`);
        } catch (reason) {
            setNotice(reason instanceof Error ? reason.message : "Failed to add label.");
        } finally {
            setLabelBusy(false);
        }
    };

    const segmentBox = useCallback(async (box: [number, number, number, number]) => {
        if (!interactor || !loaded || labelId == null) return;
        const [x1, y1, x2, y2] = box;
        if (Math.abs(x2 - x1) < 5 || Math.abs(y2 - y1) < 5) return;
        setModelBusy(true);
        setNotice("SAM 2 is segmenting the selected region…");
        try {
            const cx = Math.round((x1 + x2) / 2);
            const cy = Math.round((y1 + y2) / 2);
            const result = await api.interact(interactor.id, {
                task: Number(taskId),
                job: Number(jobId),
                frame: frameRef.current,
                pos_points: [[cx, cy]],
                neg_points: [],
                obj_bbox: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)],
            });
            const shape = result.shapes?.[0];
            if (!shape?.points?.length) throw new Error("The segmenter did not return a region.");
            commit((current) => addObject(current, {
                frame: frameRef.current,
                type: shape.type || "polygon",
                points: shape.points,
                rotation: shape.rotation,
                labelId,
                source: "auto",
                track: asTrack,
            }));
            setNotice("SAM 2 segmented the region into a polygon mask.");
        } catch (reason) {
            setNotice(reason instanceof Error ? reason.message : "SAM segmentation failed.");
        } finally {
            setModelBusy(false);
        }
    }, [asTrack, commit, interactor, jobId, labelId, loaded, taskId]);

    const segment = useCallback(async (point: [number, number], negative: boolean) => {
        if (!interactor || !loaded || labelId == null || negative) {
            if (negative) setNotice("Start with a left-click. Alt-click/right-click refinement is available after a region exists.");
            return;
        }
        setModelBusy(true);
        setNotice("SAM 2 is segmenting this region…");
        try {
            const result = await api.interact(interactor.id, {
                task: Number(taskId),
                job: Number(jobId),
                frame: frameRef.current,
                pos_points: [[Math.round(point[0]), Math.round(point[1])]],
                neg_points: [],
            });
            const shape = result.shapes?.[0];
            if (!shape?.points?.length) throw new Error("The segmenter did not return a region.");
            commit((current) => addObject(current, {
                frame: frameRef.current,
                type: shape.type || "polygon",
                points: shape.points,
                rotation: shape.rotation,
                labelId,
                source: "auto",
                track: asTrack,
            }));
            setNotice("SAM 2 region added as a polygon mask.");
        } catch (reason) {
            setNotice(reason instanceof Error ? reason.message : "SAM segmentation failed.");
        } finally {
            setModelBusy(false);
        }
    }, [asTrack, commit, interactor, jobId, labelId, loaded, taskId]);

    const trackForward = async () => {
        const state = states.find((item) => selected.includes(item.clientID));
        if (!tracker) return setNotice("No CVAT tracker model is available.");
        if (!state || !["rectangle", "polygon"].includes(state.shapeType)) return setNotice("Select one rectangle or polygon to track.");
        setModelBusy(true);
        const end = Math.min(last, frame + Math.max(1, trackFrames));
        setNotice(`Tracking frame ${frame} through ${end}…`);
        try {
            let result = await api.track(tracker.id, {
                task: Number(taskId),
                job: Number(jobId),
                frame,
                shapes: [{ type: state.shapeType, points: state.points }],
            });
            const keyframes = [{ frame, points: result.shapes[0]?.points ?? state.points, rotation: state.rotation }];
            let trackerStates = result.states;
            for (let next = frame + 1; next <= end; next += 1) {
                result = await api.track(tracker.id, {
                    task: Number(taskId),
                    job: Number(jobId),
                    frame: next,
                    states: trackerStates,
                });
                trackerStates = result.states;
                const shape = result.shapes[0];
                if (!shape) break;
                keyframes.push({ frame: next, points: shape.points, rotation: 0 });
                setNotice(`Tracking frame ${next} of ${end}…`);
            }
            commit((current) => addTrackSequence(current, {
                clientID: state.clientID,
                labelId: state.label.id,
                type: keyframes[0].points.length > 4 ? "polygon" : state.shapeType,
                frames: keyframes,
            }));
            setAsTrack(true);
            setNotice(`AI track added across ${keyframes.length} frames. Intermediate positions interpolate automatically.`);
        } catch (reason) {
            setNotice(reason instanceof Error ? reason.message : "AI tracking failed.");
        } finally {
            setModelBusy(false);
        }
    };

    const onDrawn = useCallback((shapeType: string, geometry: Geometry) => {
        const targetLabelId = labelId ?? 0;
        let newID = 0;
        commit((current) => {
            newID = current.nextID;
            return addObject(current, {
                ...geometry,
                frame: frameRef.current,
                type: shapeType,
                labelId: targetLabelId,
                track: asTrack,
            });
        });
        setSelected([newID]);
        if (targetLabelId === 0) {
            setNotice("Empty object created. Please assign a label.");
            setRightTab("objects");
        }
    }, [asTrack, commit, labelId]);

    const onEdited = useCallback(
        (clientID: number, geometry: Geometry) => commit((current) => editGeometry(current, clientID, frameRef.current, geometry)),
        [commit],
    );
    const onMultipleEdited = useCallback(
        (updates: { clientID: number; geometry: Geometry }[]) => {
            commit((current) => {
                let next = current;
                for (const { clientID, geometry } of updates) {
                    next = editGeometry(next, clientID, frameRef.current, geometry);
                }
                return next;
            });
            setNotice(`Moved ${updates.length} selected region${updates.length > 1 ? "s" : ""}.`);
        },
        [commit],
    );
    const onGrouped = useCallback((ids: number[]) => commit((current) => groupObjects(current, ids)), [commit]);
    const onSelection = useCallback((ids: number[]) => setSelected(ids), []);
    const onError = useCallback((message: string) => setNotice(message), []);

    const selectedStates = useMemo(
        () => states.filter((s) => selected.includes(s.clientID)),
        [states, selected],
    );

    const moveSelected = useCallback(
        (dx: number, dy: number) => {
            const lockedSelected = states.filter((s) => selected.includes(s.clientID) && s.lock);
            const moving = states.filter((s) => selected.includes(s.clientID) && !s.lock && !s.hidden);
            if (moving.length === 0 && lockedSelected.length > 0) {
                setNotice("Selected object is locked. Unlock it to move.");
                return;
            }
            if (moving.length > 0) {
                commit((current) => {
                    let next = current;
                    for (const s of moving) {
                        const nextPts = translatePoints(s.points, dx, dy, s.shapeType);
                        next = editGeometry(next, s.clientID, frameRef.current, { points: nextPts, rotation: s.rotation });
                    }
                    return next;
                });
                setNotice(`Moved selected region (${dx ? `ΔX: ${dx > 0 ? `+${dx}` : dx}px` : ""}${dx && dy ? ", " : ""}${dy ? `ΔY: ${dy > 0 ? `+${dy}` : dy}px` : ""}).`);
            }
        },
        [commit, selected, states],
    );

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
            } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
                if (selected.length > 0 && (tool === "move" || tool === "select" || event.altKey)) {
                    event.preventDefault();
                    const delta = event.shiftKey ? 10 : 1;
                    const dx = event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0;
                    const dy = event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0;
                    moveSelected(dx, dy);
                    return;
                }
                if (event.key === "ArrowRight") {
                    event.preventDefault();
                    step(frameRef.current + 1);
                } else if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    step(frameRef.current - 1);
                }
            } else if (key === "f") {
                event.preventDefault();
                step(frameRef.current + 1);
            } else if (key === "d") {
                event.preventDefault();
                step(frameRef.current - 1);
            } else if (event.key === " ") {
                event.preventDefault();
                setPlaying((value) => !value);
            } else if (event.key === "Enter" || key === "n") {
                if (["polygon", "polyline", "points"].includes(tool)) {
                    event.preventDefault();
                    editor.current?.finish();
                }
            } else if (event.key === "Escape") {
                if (["polygon", "polyline", "points"].includes(tool)) {
                    editor.current?.cancel();
                }
                setTool("select");
            } else if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                act(selected, "delete");
            } else if (!mod) {
                if (key === "v") setTool("select");
                else if (key === "m" || key === "r") setTool((prev) => prev === "move" ? "select" : "move");
                else if (key === "b") setTool("rectangle");
                else if (key === "p") setTool("polygon");
                else if (key === "l") setTool("polyline");
                else if (key === "o") setTool("points");
                else if (key === "e") setTool("ellipse");
                else if (key === "w") {
                    setAiOpen(true);
                    setAiTab("prompting");
                    setTool("wand");
                }
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
            const isUnassigned = state.label.id === 0 || !loaded?.labels.some((l) => l.id === state.label.id);
            const name = isUnassigned ? "Unassigned" : state.label.name;
            const index = (counts.get(name) || 0) + 1;
            counts.set(name, index);
            return { state, title: `${isUnassigned ? "⚠️ " : ""}${name} ${index}`, isUnassigned };
        })
        .reverse();
    const labelCounts = new Map<number, number>();
    for (const state of states) labelCounts.set(state.label.id, (labelCounts.get(state.label.id) ?? 0) + 1);

    return (
        <main className="anno">
            <header className="anno-top">
                <button type="button" className="anno-menu" onClick={onBack}>
                    <OctateBrand compact /><span>Task {taskId}</span><i>/</i><b>Job {jobId}</b>
                </button>
                <div className="anno-history">
                    <select
                        aria-label="Job state"
                        value={loaded?.job.state || "new"}
                        onChange={(event) => void updateState(event.target.value)}
                        disabled={!loaded}
                    >
                        <option value="new">New</option>
                        <option value="in progress">In progress</option>
                        <option value="completed">Completed</option>
                    </select>
                    <button type="button" title="Undo (Ctrl+Z)" disabled={!history?.past.length} onClick={undo}><Icon name="undo" /></button>
                    <button type="button" title="Redo (Ctrl+Shift+Z)" disabled={!history?.future.length} onClick={redo}><Icon name="redo" /></button>
                </div>
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
                    <select
                        value={
                            selected.length === 1
                                ? (states.find((s) => s.clientID === selected[0])?.label.id ?? (labelId ?? ""))
                                : (labelId ?? "")
                        }
                        onChange={(event) => {
                            const newId = Number(event.target.value);
                            setLabelId(newId);
                            if (selected.length > 0 && newId > 0) {
                                assignLabel(selected, newId);
                            }
                        }}
                        disabled={!loaded?.labels.length}
                    >
                        {selected.length === 1 && states.find((s) => s.clientID === selected[0])?.label.id === 0 && (
                            <option value={0} disabled>⚠️ Unassigned (Select label...)</option>
                        )}
                        {loaded?.labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
                    </select>
                    <button
                        type="button"
                        className="anno-add-label-btn"
                        title="Add label"
                        onClick={() => {
                            setRightTab("labels");
                            const name = window.prompt("Enter new label name:");
                            if (name && name.trim()) void addLabel(name.trim());
                        }}
                    >
                        +
                    </button>
                    <button type="button" className="anno-save" onClick={() => void save()} disabled={saving || !dirty}>
                        {saving ? "Saving" : "Save"}
                    </button>
                </div>
            </header>
            <div className="anno-body">
                <aside className="anno-tools">
                    <small>2D</small>
                    <ToolButton name="select" tool={tool} setTool={setTool} title="Cursor (Esc / V)" />
                    <span className="anno-gap" />
                    {DRAW_TOOLS.map((t) => (
                        <ToolButton key={t.name} name={t.name} tool={tool} setTool={setTool} title={t.title} />
                    ))}
                    <span className="anno-gap" />
                    <button type="button" className={aiOpen ? "active" : ""} title="AI assistance (W)" onClick={() => { setAiOpen((value) => !value); setTool("select"); }}>
                        <Icon name="wand" />
                    </button>
                    <span className="anno-gap" />
                    <button type="button" title="Fit the frame" onClick={() => editor.current?.fit()}><Icon name="fit" /></button>
                </aside>
                {aiOpen && (
                    <aside className="anno-ai-panel">
                        <header><strong>AI assistance</strong><button type="button" onClick={() => setAiOpen(false)}>×</button></header>
                        <nav>
                            <button type="button" className={aiTab === "prompting" ? "active" : ""} onClick={() => setAiTab("prompting")}>Prompting</button>
                            <button type="button" className={aiTab === "auto" ? "active" : ""} onClick={() => setAiTab("auto")}>Auto-labeling</button>
                            <button type="button" className={aiTab === "tracking" ? "active" : ""} onClick={() => setAiTab("tracking")}>Tracking</button>
                        </nav>
                        <div className="anno-ai-form">
                            {aiTab === "prompting" && <>
                                <label>Model<select value={interactor?.id || ""} disabled={!interactor}><option value={interactor?.id || ""}>{interactor?.name || "No prompting model"}</option></select></label>
                                <label>Label<select value={labelId ?? ""} onChange={(event) => setLabelId(Number(event.target.value))}>{loaded?.labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select></label>
                                <p>Drag a box or click an object to prompt SAM 2. The result is added as a polygon mask.</p>
                                <button
                                    type="button"
                                    className="primary"
                                    disabled={!interactor || modelBusy || !image}
                                    onClick={() => setTool((prev) => prev === "wand" ? "select" : "wand")}
                                >
                                    {tool === "wand" ? "Visual prompt active: drag box or click…" : "Add visual prompts (click / drag)"}
                                </button>
                                {selected.length === 1 && (() => {
                                    const selObj = states.find((s) => selected.includes(s.clientID));
                                    if (selObj && selObj.shapeType === "rectangle" && selObj.points.length >= 4) {
                                        return (
                                            <button
                                                type="button"
                                                className="primary"
                                                style={{ marginTop: 8 }}
                                                disabled={!interactor || modelBusy}
                                                onClick={() => void segmentBox([selObj.points[0], selObj.points[1], selObj.points[2], selObj.points[3]])}
                                            >
                                                Segment selected box with SAM 2
                                            </button>
                                        );
                                    }
                                    return null;
                                })()}
                            </>}
                            {aiTab === "auto" && <>
                                <label>Model<select value={detector?.id || ""} disabled={!detector}><option value={detector?.id || ""}>{detector?.name || "No auto-labeling model"}</option></select></label>
                                <label>Threshold<input type="number" min="0" max="1" step="0.05" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label>
                                <p>Model labels are matched to the task labels by name.</p>
                                <button type="button" className="primary" disabled={!detector || modelBusy || !image} onClick={() => detector && void detect(detector.id)}>{modelBusy ? "Annotating…" : "Annotate frame"}</button>
                            </>}
                            {aiTab === "tracking" && <>
                                <label>Model<select value={tracker?.id || ""} disabled={!tracker}><option value={tracker?.id || ""}>{tracker?.name || "No tracking model"}</option></select></label>
                                <label>Track forward<input type="number" min="1" max={Math.max(1, last - frame)} value={trackFrames} onChange={(event) => setTrackFrames(Number(event.target.value))} /></label>
                                <label className="anno-ai-toggle"><input type="checkbox" checked={asTrack} onChange={(event) => setAsTrack(event.target.checked)} /> Interpolation mode for newly drawn shapes</label>
                                <p>Select a rectangle or polygon. SAM segments it and carries the accepted label forward.</p>
                                <button type="button" className="primary" disabled={!tracker || modelBusy || selected.length !== 1} onClick={() => void trackForward()}>{modelBusy ? "Tracking…" : "Track selected object"}</button>
                            </>}
                        </div>
                    </aside>
                )}
                <div className="anno-canvas">
                    {["polygon", "polyline", "points"].includes(tool) && (
                        <div className="anno-drawing-banner">
                            <span>Drawing {tool}: click to place points</span>
                            <button
                                type="button"
                                className="btn-finish"
                                onClick={() => editor.current?.finish()}
                            >
                                ✓ Finish (Enter / N)
                            </button>
                            <button
                                type="button"
                                className="btn-cancel"
                                onClick={() => {
                                    editor.current?.cancel();
                                    setTool("select");
                                }}
                            >
                                ✕ Cancel
                            </button>
                        </div>
                    )}
                    {tool === "move" && (
                        <div className="anno-drawing-banner">
                            <span>{selected.length ? `Moving ${selected.length} selected region${selected.length > 1 ? "s" : ""}: drag anywhere or use Arrow keys` : "Move tool: click a region to select and drag it"}</span>
                            <button
                                type="button"
                                className="btn-cancel"
                                onClick={() => setTool("select")}
                            >
                                Done (Esc)
                            </button>
                        </div>
                    )}
                    <CvatEditor
                        ref={editor}
                        frame={image}
                        states={states}
                        tool={tool}
                        selected={selected}
                        onDrawn={onDrawn}
                        onEdited={onEdited}
                        onMultipleEdited={onMultipleEdited}
                        onSelectionChange={onSelection}
                        onGrouped={onGrouped}
                        onPoint={(point, negative) => void segment(point, negative)}
                        onRegion={(box) => void segmentBox(box)}
                        onError={onError}
                    />
                    {notice && <p className="anno-note">{notice}</p>}
                </div>
                <aside className="anno-objects">
                    <header>
                        <div className="anno-side-tabs">
                            <button type="button" className={rightTab === "objects" ? "active" : ""} onClick={() => setRightTab("objects")}>Objects</button>
                            <button type="button" className={rightTab === "labels" ? "active" : ""} onClick={() => setRightTab("labels")}>Labels</button>
                        </div>
                        <div className="anno-objects-header-right">
                            <button
                                type="button"
                                className="anno-add-empty-obj-btn"
                                onClick={createEmptyObject}
                                title="Create an empty object (+ Object)"
                            >
                                + Empty Object
                            </button>
                            <span>{states.length}</span>
                        </div>
                    </header>
                    {rightTab === "labels" ? (
                        <>
                            <div className="anno-add-label-box">
                                <input
                                    type="text"
                                    placeholder="New label name..."
                                    value={newLabelName}
                                    onChange={(e) => setNewLabelName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && newLabelName.trim()) {
                                            e.preventDefault();
                                            void addLabel(newLabelName, newLabelColor);
                                        }
                                    }}
                                />
                                <input
                                    type="color"
                                    value={newLabelColor}
                                    onChange={(e) => setNewLabelColor(e.target.value)}
                                    title="Label color"
                                />
                                <button
                                    type="button"
                                    disabled={!newLabelName.trim() || labelBusy}
                                    onClick={() => void addLabel(newLabelName, newLabelColor)}
                                >
                                    {labelBusy ? "Adding…" : "+ Add"}
                                </button>
                            </div>
                            {selected.length > 0 && (
                                <div className="anno-assign-hint">
                                    <span>Click a label to assign to selected object{selected.length > 1 ? "s" : ""}:</span>
                                </div>
                            )}
                            <ul className="anno-label-list">
                                {loaded?.labels.map((label) => (
                                    <li key={label.id} className={labelId === label.id ? "active" : ""}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setLabelId(label.id);
                                                if (selected.length > 0) {
                                                    assignLabel(selected, label.id);
                                                }
                                            }}
                                        >
                                            <i style={{ background: label.color || "#1890ff" }} />
                                            <span><b>{label.name}</b><small>{labelCounts.get(label.id) ?? 0} on this frame</small></span>
                                            {selected.length > 0 && <span className="anno-assign-chip">Assign</span>}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <>
                            {selectedStates.length > 0 && (
                                <SelectedObjectMover
                                    selectedStates={selectedStates}
                                    imageDimensions={image ? { width: image.image.width, height: image.image.height } : null}
                                    onMove={moveSelected}
                                    onUnlock={(ids) => act(ids, "lock")}
                                    onDeselect={() => {
                                        setSelected([]);
                                        editor.current?.select([]);
                                    }}
                                />
                            )}
                            {rows.length === 0 ? (
                                <p>No objects on this frame.</p>
                            ) : (
                                <ul>
                                    {rows.map(({ state, title, isUnassigned }) => (
                                <li
                                    key={state.clientID}
                                    className={`anno-obj-item ${selected.includes(state.clientID) ? "active" : ""} ${isUnassigned ? "is-unassigned" : ""}`}
                                >
                                    <div className="anno-obj-row">
                                        <button
                                            type="button"
                                            className="anno-obj-main-btn"
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
                                    </div>
                                    {(selected.includes(state.clientID) || isUnassigned) && (
                                        <div className="anno-obj-label-bar" onClick={(e) => e.stopPropagation()}>
                                            <span className="anno-obj-label-prompt">Assign label:</span>
                                            <select
                                                className={`anno-obj-label-select ${isUnassigned ? "unassigned" : ""}`}
                                                value={loaded?.labels.some((l) => l.id === state.label.id) ? state.label.id : 0}
                                                onChange={(e) => {
                                                    const id = Number(e.target.value);
                                                    if (id > 0) assignLabel([state.clientID], id);
                                                }}
                                            >
                                                <option value={0} disabled>
                                                    ⚠️ Choose label...
                                                </option>
                                                {loaded?.labels.map((l) => (
                                                    <option key={l.id} value={l.id}>
                                                        {l.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    </>
                    )}
                </aside>
            </div>
        </main>
    );
}

function ToolButton({ name, tool, setTool, title, disabled = false }: { name: Tool; tool: Tool; setTool: (tool: Tool) => void; title: string; disabled?: boolean }) {
    return (
        <button
            type="button"
            title={title}
            disabled={disabled}
            className={tool === name ? "active" : ""}
            onClick={() => setTool(tool === name ? "select" : name)}
        >
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
            {name === "wand" && <><path d="M4 20L16 8M13 5l1-3M18 8l3-1M16 3l2-2M6 15l3 3" {...common} /><path d="M15 9l-3-3" {...common} /></>}
            {name === "detect" && <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" {...common} /><circle cx="12" cy="12" r="3" {...common} /></>}
            {name === "interpolate" && <><rect x="3" y="8" width="5" height="8" rx="1" {...common} /><rect x="16" y="8" width="5" height="8" rx="1" {...common} /><path d="M9 12h6M12 9l3 3-3 3" {...common} /></>}
            {name === "track-ai" && <><path d="M4 18c3-8 7-10 16-12M15 5l5 1-2 5" {...common} /><rect x="3" y="14" width="6" height="6" rx="1" {...common} /></>}
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
