import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Canvas, RectDrawingMethod } from "cvat-canvas-editor";
import { translatePoints, type Geometry } from "../lib/canvas/jobAnnotations";
import type { CanvasObjectState } from "../types";

export type Tool = "select" | "move" | "zoom" | "region" | "rectangle" | "polygon" | "polyline" | "points" | "ellipse" | "wand";

export type CvatEditorHandle = {
    fit: () => void;
    rotate: (angle: number) => void;
    grid: () => void;
    focus: (clientID: number) => void;
    activate: (clientID: number | null) => void;
    select: (clientIDs: number[]) => void;
    group: () => void;
    finish: () => void;
    cancel: () => void;
};

type Frame = { number: number; image: ImageBitmap };

export function getCanvasClientID(target: EventTarget | null): number | null {
    const element = target && typeof (target as Element).closest === "function" ?
        (target as Element).closest<SVGElement>('[id^="cvat_canvas_shape_"], [clientID]') : null;
    if (!element) return null;
    const rawID = element.getAttribute('clientID') || element.id.replace('cvat_canvas_shape_', '');
    const clientID = Number(rawID);
    return Number.isFinite(clientID) ? clientID : null;
}

export const CvatEditor = forwardRef<CvatEditorHandle, {
    frame: Frame | null;
    states: CanvasObjectState[];
    tool: Tool;
    selected?: number[];
    onDrawn: (shapeType: string, geometry: Geometry) => void;
    onEdited: (clientID: number, geometry: Geometry) => void;
    onMultipleEdited?: (updates: { clientID: number; geometry: Geometry }[]) => void;
    onSelectionChange: (clientIDs: number[]) => void;
    onGrouped: (clientIDs: number[]) => void;
    onPoint: (point: [number, number], negative: boolean) => void;
    onRegion?: (box: [number, number, number, number]) => void;
    onError: (message: string) => void;
}>(function CvatEditor({ frame, states, tool, selected = [], onDrawn, onEdited, onMultipleEdited, onSelectionChange, onGrouped, onPoint, onRegion, onError }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<Canvas | null>(null);
    const classic = useRef("By 2 points");
    const gridOn = useRef(false);
    const handlers = useRef({ onDrawn, onEdited, onMultipleEdited, onSelectionChange, onGrouped, onPoint, onRegion, onError, tool, states, selected });
    handlers.current = { onDrawn, onEdited, onMultipleEdited, onSelectionChange, onGrouped, onPoint, onRegion, onError, tool, states, selected };
    const [ready, setReady] = useState(false);
    const [promptBox, setPromptBox] = useState<{ screenX: number; screenY: number; width: number; height: number } | null>(null);
    const [clickMarker, setClickMarker] = useState<{ screenX: number; screenY: number } | null>(null);
    const [moveDelta, setMoveDelta] = useState<{ dx: number; dy: number; count: number } | null>(null);

    useImperativeHandle(ref, () => ({
        fit() {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.fitCanvas();
            const model = (canvas as any).model;
            if (model) {
                model.resetScale();
                model.notify?.("image_fitted");
                model.notify?.("objects_updated");
            } else {
                canvas.fit();
            }
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
        finish: () => canvasRef.current?.draw({ enabled: false }),
        cancel: () => canvasRef.current?.cancel(),
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
            "canvas.setup": () => {
                cancelAnimationFrame(fitFrame);
                fitFrame = requestAnimationFrame(() => {
                    canvas?.fitCanvas();
                    canvas?.fit();
                });
            },
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
            "canvas.clicked": (event) => {
                const { state } = detail<{ state?: { clientID?: number } }>(event);
                if (typeof state?.clientID === "number") {
                    canvas?.activate(state.clientID);
                    canvas?.setSelectedObjects([state.clientID]);
                    handlers.current.onSelectionChange([state.clientID]);
                }
            },
            "canvas.groupmoved": (event) => {
                const { states = [] } = detail<{ states?: { state: { clientID: number }; points: number[] }[] }>(event);
                const updates: { clientID: number; geometry: Geometry }[] = [];
                for (const item of states) {
                    if (typeof item.state?.clientID === "number" && item.points) {
                        updates.push({ clientID: item.state.clientID, geometry: { points: item.points } });
                    }
                }
                if (updates.length) {
                    if (handlers.current.onMultipleEdited) {
                        handlers.current.onMultipleEdited(updates);
                    } else {
                        for (const u of updates) handlers.current.onEdited(u.clientID, u.geometry);
                    }
                }
            },
            "canvas.grouped": (event) => {
                const { states: grouped = [] } = detail<{ states?: { clientID?: number }[] }>(event);
                handlers.current.onGrouped(ids(grouped));
            },
        };
        let startClient: { x: number; y: number } | null = null;
        let startSVG: { x: number; y: number } | null = null;
        let isDragging = false;

        let panStartClient: { x: number; y: number } | null = null;
        let isPanDragging = false;

        let moveStartClient: { x: number; y: number } | null = null;
        let moveStartSVG: { x: number; y: number } | null = null;
        let moveInitialPoints = new Map<number, number[]>();
        let moveStates: CanvasObjectState[] = [];
        let isMoveDragging = false;

        const getSVGPoint = (clientX: number, clientY: number) => {
            const content = node.querySelector<SVGSVGElement>("#cvat_canvas_content");
            const matrix = content?.getScreenCTM();
            if (!content || !matrix) return null;
            const point = content.createSVGPoint();
            point.x = clientX;
            point.y = clientY;
            const translated = point.matrixTransform(matrix.inverse());
            return { x: translated.x, y: translated.y };
        };

        const onPointerDown = (event: PointerEvent) => {
            const activeTool = handlers.current.tool;
            if (event.button > 2) return;

            // Middle click or Alt+click anywhere pans the image
            if (event.button === 1 || (event.button === 0 && event.altKey)) {
                isPanDragging = true;
                panStartClient = { x: event.clientX, y: event.clientY };
                node.classList.add("is-panning");
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            if (activeTool === "move" || activeTool === "select") {
                if (event.button !== 0) return;
                const pt = getSVGPoint(event.clientX, event.clientY);
                if (!pt) return;

                const clickedId = getCanvasClientID(event.target);

                // If a shape was clicked directly:
                if (clickedId !== null) {
                    const targetState = handlers.current.states.find((s) => s.clientID === clickedId);
                    if (targetState?.lock) {
                        handlers.current.onError(`"${targetState.label?.name || "Object"}" is locked. Unlock it to move.`);
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }

                    const currentSelected = handlers.current.selected ?? [];
                    let targetIDs: number[] = [];
                    if (!currentSelected.includes(clickedId)) {
                        targetIDs = [clickedId];
                        handlers.current.onSelectionChange([clickedId]);
                        canvasRef.current?.activate(clickedId);
                        canvasRef.current?.setSelectedObjects([clickedId]);
                    } else {
                        targetIDs = currentSelected;
                    }

                    const moving = handlers.current.states.filter((s) => targetIDs.includes(s.clientID) && !s.lock && !s.hidden);
                    if (!moving.length) {
                        handlers.current.onError("Selected object is locked. Unlock it to move.");
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }

                    moveStartClient = { x: event.clientX, y: event.clientY };
                    moveStartSVG = pt;
                    moveInitialPoints = new Map(moving.map((s) => [s.clientID, [...s.points]]));
                    moveStates = moving;
                    isMoveDragging = false;
                    node.classList.add("is-moving");
                    // Do not prevent default immediately so single clicks can focus/select if no drag happens
                    return;
                }

                // Clicked on the canvas background: drag to pan/move the image
                isPanDragging = true;
                panStartClient = { x: event.clientX, y: event.clientY };
                node.classList.add("is-panning");
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            if (activeTool !== "wand" && activeTool !== "region") return;
            const pt = getSVGPoint(event.clientX, event.clientY);
            if (!pt) return;
            startClient = { x: event.clientX, y: event.clientY };
            startSVG = pt;
            isDragging = false;
            event.preventDefault();
            event.stopPropagation();
        };

        const onPointerMove = (event: PointerEvent) => {
            const activeTool = handlers.current.tool;

            if (isPanDragging && panStartClient) {
                const dx = event.clientX - panStartClient.x;
                const dy = event.clientY - panStartClient.y;
                panStartClient = { x: event.clientX, y: event.clientY };
                const model = (canvasRef.current as any)?.model;
                if (model?.move) {
                    model.move(dy, dx);
                }
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            if (activeTool === "move" || activeTool === "select") {
                if (!moveStartClient || !moveStartSVG || !moveStates.length) return;
                const clientDx = event.clientX - moveStartClient.x;
                const clientDy = event.clientY - moveStartClient.y;
                if (Math.abs(clientDx) > 2 || Math.abs(clientDy) > 2) {
                    isMoveDragging = true;
                    const currentSVG = getSVGPoint(event.clientX, event.clientY);
                    if (!currentSVG) return;
                    const svgDx = currentSVG.x - moveStartSVG.x;
                    const svgDy = currentSVG.y - moveStartSVG.y;

                    for (const s of moveStates) {
                        const shapeEl = node.querySelector<SVGGraphicsElement>(`#cvat_canvas_shape_${s.clientID}`);
                        if (shapeEl) {
                            shapeEl.style.transform = `translate(${svgDx}px, ${svgDy}px)`;
                        }
                        const textEl = node.querySelector<SVGGraphicsElement>(`#cvat_canvas_text_${s.clientID}, [data-client-id="${s.clientID}"]`);
                        if (textEl) {
                            textEl.style.transform = `translate(${svgDx}px, ${svgDy}px)`;
                        }
                    }
                    setMoveDelta({ dx: Math.round(svgDx), dy: Math.round(svgDy), count: moveStates.length });
                }
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            if ((activeTool !== "wand" && activeTool !== "region") || !startClient) return;
            const dx = Math.abs(event.clientX - startClient.x);
            const dy = Math.abs(event.clientY - startClient.y);
            if (dx > 4 || dy > 4) {
                isDragging = true;
                const nodeRect = node.getBoundingClientRect();
                setPromptBox({
                    screenX: Math.min(startClient.x, event.clientX) - nodeRect.left,
                    screenY: Math.min(startClient.y, event.clientY) - nodeRect.top,
                    width: Math.abs(event.clientX - startClient.x),
                    height: Math.abs(event.clientY - startClient.y),
                });
            }
        };

        const onPointerUp = (event: PointerEvent) => {
            const activeTool = handlers.current.tool;

            if (isPanDragging) {
                isPanDragging = false;
                panStartClient = null;
                node.classList.remove("is-panning");
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            if (activeTool === "move" || activeTool === "select") {
                node.classList.remove("is-moving");
                setMoveDelta(null);
                if (isMoveDragging && moveStartSVG && moveStates.length) {
                    const currentSVG = getSVGPoint(event.clientX, event.clientY);
                    for (const s of moveStates) {
                        const shapeEl = node.querySelector<SVGGraphicsElement>(`#cvat_canvas_shape_${s.clientID}`);
                        if (shapeEl) shapeEl.style.transform = "";
                        const textEl = node.querySelector<SVGGraphicsElement>(`#cvat_canvas_text_${s.clientID}, [data-client-id="${s.clientID}"]`);
                        if (textEl) textEl.style.transform = "";
                    }
                    if (currentSVG) {
                        const svgDx = currentSVG.x - moveStartSVG.x;
                        const svgDy = currentSVG.y - moveStartSVG.y;
                        if (Math.abs(svgDx) >= 0.5 || Math.abs(svgDy) >= 0.5) {
                            const updates: { clientID: number; geometry: Geometry }[] = [];
                            for (const s of moveStates) {
                                const initPts = moveInitialPoints.get(s.clientID) ?? s.points;
                                const nextPts = translatePoints(initPts, svgDx, svgDy, s.shapeType);
                                updates.push({ clientID: s.clientID, geometry: { points: nextPts, rotation: s.rotation } });
                            }
                            if (updates.length > 1 && handlers.current.onMultipleEdited) {
                                handlers.current.onMultipleEdited(updates);
                            } else {
                                for (const u of updates) handlers.current.onEdited(u.clientID, u.geometry);
                            }
                        }
                    }
                    event.preventDefault();
                    event.stopPropagation();
                } else {
                    for (const s of moveStates) {
                        const shapeEl = node.querySelector<SVGGraphicsElement>(`#cvat_canvas_shape_${s.clientID}`);
                        if (shapeEl) shapeEl.style.transform = "";
                    }
                }
                moveStartClient = null;
                moveStartSVG = null;
                moveInitialPoints = new Map();
                moveStates = [];
                isMoveDragging = false;
                return;
            }

            if ((activeTool !== "wand" && activeTool !== "region") || !startClient || !startSVG) return;
            const currentSVG = getSVGPoint(event.clientX, event.clientY);
            const nodeRect = node.getBoundingClientRect();
            if (isDragging && currentSVG && handlers.current.onRegion) {
                const x1 = Math.min(startSVG.x, currentSVG.x);
                const y1 = Math.min(startSVG.y, currentSVG.y);
                const x2 = Math.max(startSVG.x, currentSVG.x);
                const y2 = Math.max(startSVG.y, currentSVG.y);
                handlers.current.onRegion([x1, y1, x2, y2]);
            } else if (activeTool === "wand") {
                handlers.current.onPoint([startSVG.x, startSVG.y], event.button === 2 || event.altKey);
                setClickMarker({
                    screenX: startClient.x - nodeRect.left,
                    screenY: startClient.y - nodeRect.top,
                });
                setTimeout(() => setClickMarker(null), 1500);
            }
            startClient = null;
            startSVG = null;
            isDragging = false;
            setPromptBox(null);
            event.preventDefault();
            event.stopPropagation();
        };

        const onContextMenu = (event: MouseEvent) => {
            if (!['select', 'move'].includes(handlers.current.tool)) return;
            const clientID = getCanvasClientID(event.target);
            if (clientID === null) return;
            const targetState = handlers.current.states.find((state) => state.clientID === clientID);
            if (!targetState || targetState.hidden || targetState.outside) return;

            canvasRef.current?.activate(clientID);
            canvasRef.current?.setSelectedObjects([clientID]);
            handlers.current.onSelectionChange([clientID]);
            event.preventDefault();
            event.stopPropagation();
        };

        const stopMenu = (event: Event) => {
            if (handlers.current.tool === "wand") event.preventDefault();
        };

        const onDoubleClick = (event: MouseEvent) => {
            if (["polygon", "polyline", "points"].includes(handlers.current.tool)) {
                event.preventDefault();
                event.stopPropagation();
                canvasRef.current?.draw({ enabled: false });
            }
        };

        try {
            classic.current = RectDrawingMethod.CLASSIC;
            canvas = new Canvas();
            canvasRef.current = canvas;
            node.appendChild(canvas.html());
            node.addEventListener("pointerdown", onPointerDown, true);
            node.addEventListener("pointermove", onPointerMove, true);
            node.addEventListener("pointerup", onPointerUp, true);
            node.addEventListener("dblclick", onDoubleClick, true);
            node.addEventListener("contextmenu", onContextMenu, true);
            node.addEventListener("contextmenu", stopMenu);
            showGrid(node, gridOn.current);
            canvas.configure({ colorBy: "label", displayAllText: true, autoborders: true, resetZoom: false });
            for (const [name, listener] of Object.entries(listeners)) canvas.html().addEventListener(name, listener);
            observer.observe(node);
            setReady(true);
        } catch (reason: unknown) {
            const message = reason instanceof Error ? reason.message : "The annotation canvas failed to start.";
            handlers.current.onError(message);
        }

        return () => {
            cancelled = true;
            observer.disconnect();
            cancelAnimationFrame(fitFrame);
            if (canvas) for (const [name, listener] of Object.entries(listeners)) canvas.html().removeEventListener(name, listener);
            node.removeEventListener("pointerdown", onPointerDown, true);
            node.removeEventListener("pointermove", onPointerMove, true);
            node.removeEventListener("pointerup", onPointerUp, true);
            node.removeEventListener("dblclick", onDoubleClick, true);
            node.removeEventListener("contextmenu", onContextMenu, true);
            node.removeEventListener("contextmenu", stopMenu);
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
        const node = host.current;
        if (!node) return;
        const grid = node.querySelector<SVGElement>("#cvat_canvas_grid");
        if (grid) grid.style.display = "none";
        for (const s of states) {
            const el = node.querySelector<SVGElement>(`#cvat_canvas_shape_${s.clientID}`);
            if (el) {
                if (s.lock) {
                    el.setAttribute("data-locked", "true");
                    el.classList.add("cvat_canvas_shape_locked");
                } else {
                    el.removeAttribute("data-locked");
                    el.classList.remove("cvat_canvas_shape_locked");
                }
            }
        }
    }, [ready, frame, states]);

    useEffect(() => {
        if (ready && canvasRef.current) applyTool(canvasRef.current, tool, classic.current);
    }, [ready, tool]);

    return (
        <div
            ref={host}
            className={`cvat-canvas-container${tool === "wand" ? " magic-wand-active" : ""}${tool === "move" ? " move-tool-active" : ""}${tool === "region" ? " region-tool-active" : ""}`}
        >
            {moveDelta && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 16,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(0,0,0,0.85)",
                        color: "#fff",
                        padding: "6px 14px",
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        pointerEvents: "none",
                        zIndex: 9999,
                        boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                    }}
                >
                    <span>Moving {moveDelta.count > 1 ? `${moveDelta.count} regions` : "region"}:</span>
                    <span style={{ color: "#40a9ff" }}>ΔX: {moveDelta.dx > 0 ? `+${moveDelta.dx}` : moveDelta.dx}px</span>
                    <span style={{ color: "#73d13d" }}>ΔY: {moveDelta.dy > 0 ? `+${moveDelta.dy}` : moveDelta.dy}px</span>
                </div>
            )}
            {promptBox && (
                <div
                    style={{
                        position: "absolute",
                        left: `${promptBox.screenX}px`,
                        top: `${promptBox.screenY}px`,
                        width: `${promptBox.width}px`,
                        height: `${promptBox.height}px`,
                        border: "2px dashed #1890ff",
                        background: "rgba(24, 144, 255, 0.2)",
                        boxShadow: "0 0 10px rgba(24, 144, 255, 0.5)",
                        pointerEvents: "none",
                        zIndex: 9999,
                        boxSizing: "border-box",
                    }}
                >
                    <span
                        style={{
                            position: "absolute",
                            top: -22,
                            left: 0,
                            background: "#1890ff",
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: "bold",
                            padding: "2px 6px",
                            borderRadius: 3,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {tool === "wand" ? "SAM Prompt Region" : "Region Selector"} ({Math.round(promptBox.width)}×{Math.round(promptBox.height)})
                    </span>
                </div>
            )}
            {clickMarker && (
                <div
                    style={{
                        position: "absolute",
                        left: `${clickMarker.screenX - 8}px`,
                        top: `${clickMarker.screenY - 8}px`,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#52c41a",
                        border: "2px solid #ffffff",
                        boxShadow: "0 0 12px #52c41a",
                        pointerEvents: "none",
                        zIndex: 9999,
                    }}
                />
            )}
        </div>
    );
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
    if (tool === "zoom") canvas.zoomCanvas(true);
    else if (tool === "region") canvas.selectObjects({ enabled: true });
    else if (tool !== "select" && tool !== "move" && tool !== "wand") {
        canvas.draw({
            enabled: true,
            shapeType: tool,
            crosshair: true,
            rectDrawingMethod: tool === "rectangle" ? classic : undefined,
        });
    }
}
