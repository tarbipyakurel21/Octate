import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { api } from "../lib/api";
import type { Annotation, CanvasObjectState } from "../types";

const COLORS = ["#ff4d4f", "#1890ff", "#52c41a", "#faad14", "#722ed1", "#13c2c2", "#eb2f96"];

export type CvatEditorHandle = {
    states: () => CanvasObjectState[];
    size: () => { width: number; height: number };
    addAnnotations: (items: Annotation[]) => void;
    command: (command: EditorCommand, value?: number | boolean) => void;
    selected: () => number[];
};

export type EditorCommand =
    | "fit" | "undo" | "redo" | "rotate" | "delete" | "hide" | "lock"
    | "grid" | "bitmap" | "focus" | "select-all" | "clear-selection" | "activate"
    | "group" | "merge" | "join" | "split" | "slice";

type CanvasApi = {
    html: () => HTMLDivElement;
    setup: (frameData: unknown, objectStates: CanvasObjectState[]) => void;
    draw: (data: { enabled: boolean; shapeType?: string; crosshair?: boolean; rectDrawingMethod?: string }) => void;
    dragCanvas: (enable: boolean) => void;
    fit: () => void;
    fitCanvas: () => void;
    cancel: () => void;
    destroy: () => void;
    configure: (configuration: Record<string, unknown>) => void;
    activate: (clientID: number | null) => void;
    focus: (clientID: number, padding?: number) => void;
    rotate: (angle: number) => void;
    grid: (stepX: number, stepY: number) => void;
    bitmap: (enable: boolean) => void;
    selectRegion: (enable: boolean) => void;
    zoomCanvas: (enable: boolean) => void;
    selectObjects: (data: { enabled: boolean; once?: boolean }) => void;
    setSelectedObjects: (clientIDs: number[]) => void;
    undo: () => boolean;
    redo: () => boolean;
    group: (data: { enabled: boolean }) => void;
    merge: (data: { enabled: boolean }) => void;
    join: (data: { enabled: boolean }) => void;
    split: (data: { enabled: boolean }) => void;
    slice: (data: { enabled: boolean; clientID?: number }) => void;
};

function colorFor(name: string): string {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return COLORS[hash % COLORS.length];
}

function stateFromAnnotation(item: Annotation, clientID: number): CanvasObjectState {
    const color = colorFor(item.label);
    return {
        clientID,
        objectType: item.trackId ? "track" : "shape",
        shapeType: item.type,
        points: item.points.flatMap((point) => [point.x, point.y]),
        rotation: 0,
        frame: item.frame,
        label: { id: 0, name: item.label, color, attributes: [] },
        occluded: false,
        outside: false,
        hidden: false,
        lock: false,
        pinned: false,
        zOrder: 0,
        updated: 0,
        source: "manual",
        attributes: {},
        descriptions: [],
        group: { id: 0, color },
        color,
        keyframe: item.keyframe ?? true,
    };
}

function prepare(state: CanvasObjectState): CanvasObjectState {
    const color = state.color || colorFor(state.label?.name || "object");
    return {
        ...state,
        color,
        label: {
            id: state.label?.id ?? 0,
            name: state.label?.name || "object",
            color: state.label?.color || color,
            attributes: [],
        },
        group: state.group || { id: 0, color },
        attributes: state.attributes || {},
        descriptions: state.descriptions || [],
        rotation: state.rotation || 0,
    };
}

export const CvatEditor = forwardRef<CvatEditorHandle, {
    taskId: string;
    frame: number;
    label: string;
    tool: "select" | "move" | "zoom" | "region" | "rectangle" | "polygon" | "polyline" | "points" | "ellipse";
    onNotice: (message: string) => void;
    onSelectionChange?: (ids: number[]) => void;
    onStates?: (states: CanvasObjectState[]) => void;
}>(function CvatEditor({ taskId, frame, label, tool, onNotice, onSelectionChange, onStates }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<CanvasApi | null>(null);
    const statesRef = useRef<CanvasObjectState[]>([]);
    const sizeRef = useRef({ width: 0, height: 0 });
    const frameDataRef = useRef<ReturnType<typeof makeFrameData> | null>(null);
    const nextId = useRef(1);
    const selectedRef = useRef<number[]>([]);
    const gridRef = useRef(false);
    const bitmapRef = useRef(false);
    const labelRef = useRef(label);
    const toolRef = useRef(tool);
    const classicRef = useRef("By 2 points");
    const onStatesRef = useRef(onStates);
    labelRef.current = label;
    toolRef.current = tool;
    onStatesRef.current = onStates;
    const publish = () => onStatesRef.current?.(statesRef.current.slice());

    useImperativeHandle(ref, () => ({
        states: () => statesRef.current,
        size: () => sizeRef.current,
        selected: () => selectedRef.current,
        addAnnotations(items) {
            const added = items
                .filter((item) => item.frame === frame)
                .map((item) => stateFromAnnotation(item, nextId.current++));
            if (!added.length || !canvasRef.current || !frameDataRef.current) return;
            statesRef.current = [...statesRef.current, ...added];
            canvasRef.current.setup(frameDataRef.current, statesRef.current);
            publish();
        },
        command(command, value) {
            const canvas = canvasRef.current;
            if (!canvas || !frameDataRef.current) return;
            const selected = selectedRef.current;
            if (command === "fit") { canvas.fitCanvas(); canvas.fit(); return; }
            if (command === "undo") { canvas.undo(); return; }
            if (command === "redo") { canvas.redo(); return; }
            if (command === "rotate") { canvas.rotate(Number(value) || 90); return; }
            if (command === "grid") { gridRef.current = !gridRef.current; canvas.grid(gridRef.current ? 50 : 0, gridRef.current ? 50 : 0); return; }
            if (command === "bitmap") { bitmapRef.current = !bitmapRef.current; canvas.bitmap(bitmapRef.current); return; }
            if (command === "select-all") { selectedRef.current = statesRef.current.map(({ clientID }) => clientID); canvas.setSelectedObjects(selectedRef.current); onSelectionChange?.(selectedRef.current); return; }
            if (command === "clear-selection") { selectedRef.current = []; canvas.setSelectedObjects([]); canvas.activate(null); onSelectionChange?.([]); return; }
            if (command === "focus" && selected[0] != null) { canvas.focus(selected[0], 80); return; }
            if (command === "group") { canvas.group({ enabled: true }); return; }
            if (command === "merge") { canvas.merge({ enabled: true }); return; }
            if (command === "join") { canvas.join({ enabled: true }); return; }
            if (command === "split") { canvas.split({ enabled: true }); return; }
            if (command === "slice" && selected[0] != null) { canvas.slice({ enabled: true, clientID: selected[0] }); return; }
            if (command === "activate" && typeof value === "number") {
                selectedRef.current = [value];
                canvas.activate(value);
                canvas.setSelectedObjects([value]);
                onSelectionChange?.([value]);
                return;
            }
            if (command === "delete") statesRef.current = statesRef.current.filter(({ clientID }) => !selected.includes(clientID));
            if (command === "hide") statesRef.current = statesRef.current.map((state) => selected.includes(state.clientID) ? { ...state, hidden: !state.hidden } : state);
            if (command === "lock") statesRef.current = statesRef.current.map((state) => selected.includes(state.clientID) ? { ...state, lock: !state.lock } : state);
            selectedRef.current = command === "delete" ? [] : selectedRef.current;
            canvas.setup(frameDataRef.current, statesRef.current);
            canvas.setSelectedObjects(selectedRef.current);
            onSelectionChange?.(selectedRef.current);
            publish();
        },
    }));

    useEffect(() => {
        const node = host.current;
        if (!node) return;
        let cancelled = false;
        let canvas: CanvasApi | null = null;
        let fitFrame = 0;
        const observer = new ResizeObserver(() => {
            const current = canvasRef.current;
            if (!current || cancelled) return;
            cancelAnimationFrame(fitFrame);
            fitFrame = requestAnimationFrame(() => {
                current.fitCanvas();
                current.fit();
            });
        });
        observer.observe(node);
        const onDrawn = (event: Event) => {
            const detail = (event as CustomEvent<{ state?: { shapeType?: string; points?: number[]; rotation?: number } }>).detail;
            const drawn = detail?.state;
            if (!drawn?.points || !drawn.shapeType || !canvas || !frameDataRef.current) return;
            const color = colorFor(labelRef.current);
            const state = prepare({
                clientID: nextId.current++,
                objectType: "shape",
                shapeType: drawn.shapeType,
                points: drawn.points,
                rotation: drawn.rotation || 0,
                frame,
                label: { id: 0, name: labelRef.current, color, attributes: [] },
                occluded: false,
                outside: false,
                hidden: false,
                lock: false,
                pinned: false,
                zOrder: 0,
                updated: 0,
                source: "manual",
                attributes: {},
                descriptions: [],
                group: { id: 0, color },
                color,
                keyframe: true,
            });
            statesRef.current = [...statesRef.current, state];
            canvas.setup(frameDataRef.current, statesRef.current);
            applyTool(canvas, toolRef.current, classicRef.current);
            publish();
        };
        const onEdited = (event: Event) => {
            const detail = (event as CustomEvent<{ state?: { clientID?: number }; points?: number[]; rotation?: number }>).detail;
            const clientID = detail?.state?.clientID;
            if (typeof clientID !== "number" || !detail.points || !canvas || !frameDataRef.current) return;
            statesRef.current = statesRef.current.map((state) =>
                state.clientID === clientID
                    ? { ...state, points: detail.points as number[], rotation: detail.rotation || 0 }
                    : state,
            );
            canvas.setup(frameDataRef.current, statesRef.current);
            publish();
        };
        const onSelected = (event: Event) => {
            const detail = (event as CustomEvent<{ states?: Array<{ clientID?: number }> }>).detail;
            selectedRef.current = (detail?.states || []).flatMap((state) => typeof state.clientID === "number" ? [state.clientID] : []);
            canvas?.setSelectedObjects(selectedRef.current);
            onSelectionChange?.(selectedRef.current);
        };
        const onActivated = (event: Event) => {
            const id = (event as CustomEvent<{ state?: { clientID?: number } }>).detail?.state?.clientID;
            if (typeof id !== "number") return;
            selectedRef.current = [id];
            canvas?.setSelectedObjects([id]);
            onSelectionChange?.([id]);
        };

        (async () => {
            const [{ Canvas, RectDrawingMethod }, scene] = await Promise.all([
                import("cvat-canvas-editor"),
                api.canvasScene(taskId, frame).catch(() => null),
            ]);
            if (cancelled || !host.current) return;
            const response = await fetch(api.frameUrl(taskId, frame));
            if (!response.ok) {
                onNotice("This frame was not extracted.");
                return;
            }
            const bitmap = await createImageBitmap(await response.blob());
            if (cancelled || !host.current) return;
            sizeRef.current = { width: bitmap.width, height: bitmap.height };
            const loaded = (scene?.objectStates || []).map((state) => prepare(state));
            nextId.current = loaded.reduce((max, state) => Math.max(max, state.clientID), 0) + 1;
            statesRef.current = loaded;
            classicRef.current = RectDrawingMethod.CLASSIC;
            publish();
            const frameData = makeFrameData(frame, bitmap);
            frameDataRef.current = frameData;
            canvas = new Canvas() as CanvasApi;
            canvasRef.current = canvas;
            host.current.appendChild(canvas.html());
            canvas.configure({ colorBy: "instance", displayAllText: true, autoborders: true, resetZoom: true });
            canvas.html().addEventListener("canvas.drawn", onDrawn);
            canvas.html().addEventListener("canvas.edited", onEdited);
            canvas.html().addEventListener("canvas.selected", onSelected);
            canvas.html().addEventListener("canvas.activated", onActivated);
            canvas.fitCanvas();
            canvas.setup(frameData, statesRef.current);
            requestAnimationFrame(() => {
                if (cancelled || !canvas) return;
                canvas.fitCanvas();
                canvas.fit();
                applyTool(canvas, toolRef.current, RectDrawingMethod.CLASSIC);
            });
            onNotice("");
        })().catch((reason: unknown) => {
            onNotice(reason instanceof Error ? reason.message : "The annotation canvas failed to start.");
        });

        return () => {
            cancelled = true;
            observer.disconnect();
            cancelAnimationFrame(fitFrame);
            canvas?.html().removeEventListener("canvas.drawn", onDrawn);
            canvas?.html().removeEventListener("canvas.edited", onEdited);
            canvas?.html().removeEventListener("canvas.selected", onSelected);
            canvas?.html().removeEventListener("canvas.activated", onActivated);
            canvas?.destroy();
            canvasRef.current = null;
            if (node) node.replaceChildren();
        };
    }, [taskId, frame, onNotice, onSelectionChange]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        void import("cvat-canvas-editor").then(({ RectDrawingMethod }) => {
            applyTool(canvas, tool, RectDrawingMethod.CLASSIC);
        });
    }, [tool]);

    return <div ref={host} className="cvat-canvas-container" />;
});

function makeFrameData(frame: number, bitmap: ImageBitmap) {
    return {
        number: frame,
        deleted: false,
        width: bitmap.width,
        height: bitmap.height,
        data(onReset?: () => void) {
            onReset?.();
            return Promise.resolve({
                renderWidth: bitmap.width,
                renderHeight: bitmap.height,
                imageData: bitmap,
            });
        },
    };
}

function applyTool(canvas: CanvasApi, tool: string, classic: string) {
    canvas.cancel();
    if (tool === "move") {
        canvas.dragCanvas(true);
        return;
    }
    if (tool === "zoom") { canvas.zoomCanvas(true); return; }
    if (tool === "region") { canvas.selectObjects({ enabled: true }); return; }
    if (tool === "select") return;
    canvas.draw({
        enabled: true,
        shapeType: tool,
        crosshair: true,
        rectDrawingMethod: tool === "rectangle" ? classic : undefined,
    });
}
