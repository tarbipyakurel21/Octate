import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Canvas } from "cvat-canvas-editor";
import type { Geometry } from "../lib/canvas/jobAnnotations";
import type { CanvasObjectState } from "../types";

export type Tool = "select" | "move" | "zoom" | "region" | "rectangle" | "polygon" | "polyline" | "points" | "ellipse";

export type CvatEditorHandle = {
    fit: () => void;
    rotate: (angle: number) => void;
    grid: () => void;
    focus: (clientID: number) => void;
    activate: (clientID: number | null) => void;
    select: (clientIDs: number[]) => void;
    group: () => void;
};

type Frame = { number: number; image: ImageBitmap };

export const CvatEditor = forwardRef<CvatEditorHandle, {
    frame: Frame | null;
    states: CanvasObjectState[];
    tool: Tool;
    onDrawn: (shapeType: string, geometry: Geometry) => void;
    onEdited: (clientID: number, geometry: Geometry) => void;
    onSelectionChange: (clientIDs: number[]) => void;
    onGrouped: (clientIDs: number[]) => void;
    onError: (message: string) => void;
}>(function CvatEditor({ frame, states, tool, onDrawn, onEdited, onSelectionChange, onGrouped, onError }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<Canvas | null>(null);
    const classic = useRef("By 2 points");
    const gridOn = useRef(false);
    const handlers = useRef({ onDrawn, onEdited, onSelectionChange, onGrouped, onError, tool });
    handlers.current = { onDrawn, onEdited, onSelectionChange, onGrouped, onError, tool };
    const [ready, setReady] = useState(false);

    useImperativeHandle(ref, () => ({
        fit() {
            canvasRef.current?.fitCanvas();
            canvasRef.current?.fit();
        },
        rotate: (angle) => canvasRef.current?.rotate(angle),
        grid() {
            gridOn.current = !gridOn.current;
            canvasRef.current?.grid(50, 50);
            showGrid(host.current, gridOn.current);
        },
        focus: (clientID) => canvasRef.current?.focus(clientID, 80),
        activate: (clientID) => canvasRef.current?.activate(clientID),
        select: (clientIDs) => canvasRef.current?.setSelectedObjects(clientIDs),
        group: () => canvasRef.current?.group({ enabled: true }),
    }));

    useEffect(() => {
        const node = host.current;
        if (!node) return;
        let cancelled = false;
        let canvas: Canvas | null = null;
        let fitFrame = 0;
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(fitFrame);
            fitFrame = requestAnimationFrame(() => {
                canvas?.fitCanvas();
                canvas?.fit();
            });
        });
        const detail = <T,>(event: Event) => (event as CustomEvent<T>).detail;
        const listeners: Record<string, (event: Event) => void> = {
            "canvas.drawn": (event) => {
                const { state } = detail<{ state?: { shapeType?: string; points?: number[]; rotation?: number } }>(event);
                if (state?.shapeType && state.points) {
                    handlers.current.onDrawn(state.shapeType, { points: state.points, rotation: state.rotation });
                }
                if (canvas) applyTool(canvas, handlers.current.tool, classic.current);
            },
            "canvas.edited": (event) => {
                const { state, points, rotation } = detail<{ state?: { clientID?: number }; points?: number[]; rotation?: number }>(event);
                if (typeof state?.clientID === "number" && points) handlers.current.onEdited(state.clientID, { points, rotation });
            },
            "canvas.selected": (event) => {
                const { states: picked = [] } = detail<{ states?: { clientID?: number }[] }>(event);
                handlers.current.onSelectionChange(ids(picked));
            },
            "canvas.activated": (event) => {
                const { state } = detail<{ state?: { clientID?: number } }>(event);
                if (typeof state?.clientID === "number") handlers.current.onSelectionChange([state.clientID]);
            },
            "canvas.grouped": (event) => {
                const { states: grouped = [] } = detail<{ states?: { clientID?: number }[] }>(event);
                handlers.current.onGrouped(ids(grouped));
            },
        };

        import("cvat-canvas-editor")
            .then(({ Canvas, RectDrawingMethod }) => {
                if (cancelled) return;
                classic.current = RectDrawingMethod.CLASSIC;
                canvas = new Canvas();
                canvasRef.current = canvas;
                node.appendChild(canvas.html());
                showGrid(node, gridOn.current);
                canvas.configure({ colorBy: "label", displayAllText: true, autoborders: true, resetZoom: false });
                for (const [name, listener] of Object.entries(listeners)) canvas.html().addEventListener(name, listener);
                observer.observe(node);
                setReady(true);
            })
            .catch((reason: unknown) => {
                handlers.current.onError(reason instanceof Error ? reason.message : "The annotation canvas failed to start.");
            });

        return () => {
            cancelled = true;
            observer.disconnect();
            cancelAnimationFrame(fitFrame);
            if (canvas) for (const [name, listener] of Object.entries(listeners)) canvas.html().removeEventListener(name, listener);
            canvas?.destroy();
            canvasRef.current = null;
            setReady(false);
            node.replaceChildren();
        };
    }, []);

    const fitted = useRef(false);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!ready || !canvas || !frame) return;
        canvas.setup(frameData(frame), states);
        if (!fitted.current) {
            fitted.current = true;
            requestAnimationFrame(() => {
                canvas.fitCanvas();
                canvas.fit();
            });
        }
    }, [ready, frame, states]);

    useEffect(() => {
        if (ready && canvasRef.current) applyTool(canvasRef.current, tool, classic.current);
    }, [ready, tool]);

    return <div ref={host} className="cvat-canvas-container" />;
});

// The canvas always renders its grid; the host decides whether it is visible.
function showGrid(node: HTMLElement | null, visible: boolean) {
    const grid = node?.querySelector<SVGElement>("#cvat_canvas_grid");
    if (grid) grid.style.display = visible ? "block" : "none";
}

function ids(states: { clientID?: number }[]): number[] {
    return states.flatMap((state) => (typeof state.clientID === "number" ? [state.clientID] : []));
}

function frameData({ number, image }: Frame) {
    return {
        number,
        deleted: false,
        width: image.width,
        height: image.height,
        data(onReset?: () => void) {
            onReset?.();
            return Promise.resolve({ renderWidth: image.width, renderHeight: image.height, imageData: image });
        },
    };
}

function applyTool(canvas: Canvas, tool: Tool, classic: string) {
    canvas.cancel();
    if (tool === "move") canvas.dragCanvas(true);
    else if (tool === "zoom") canvas.zoomCanvas(true);
    else if (tool === "region") canvas.selectObjects({ enabled: true });
    else if (tool !== "select") {
        canvas.draw({
            enabled: true,
            shapeType: tool,
            crosshair: true,
            rectDrawingMethod: tool === "rectangle" ? classic : undefined,
        });
    }
}
