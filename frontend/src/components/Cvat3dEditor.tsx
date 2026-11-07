import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { api } from "../lib/api";
import type { CanvasObjectState } from "../types";

export type Cvat3dEditorHandle = {
    states: () => CanvasObjectState[];
    command: (name: "cursor" | "move" | "draw" | "fit" | "focus" | "group" | "merge" | "split") => void;
};

export const Cvat3dEditor = forwardRef<Cvat3dEditorHandle, {
    taskId: string;
    frame: number;
    label: string;
    onNotice: (message: string) => void;
    onStatesChange: (states: CanvasObjectState[]) => void;
    onSelectionChange: (ids: number[]) => void;
}>(function Cvat3dEditor({ taskId, frame, label, onNotice, onStatesChange, onSelectionChange }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<InstanceType<typeof import("cvat-canvas3d-editor").Canvas3d> | null>(null);
    const statesRef = useRef<CanvasObjectState[]>([]);
    const selectedRef = useRef<number | null>(null);
    const nextId = useRef(1);
    const labelRef = useRef(label);
    labelRef.current = label;

    useImperativeHandle(ref, () => ({
        states: () => statesRef.current,
        command(name) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.cancel();
            if (name === "move") canvas.dragCanvas(true);
            if (name === "draw") canvas.draw({ enabled: true, shapeType: "cuboid" });
            if (name === "fit") canvas.fit();
            if (name === "focus" && selectedRef.current !== null) canvas.focus(selectedRef.current);
            if (name === "group") canvas.group({ enabled: true });
            if (name === "merge") canvas.merge({ enabled: true });
            if (name === "split") canvas.split({ enabled: true });
        },
    }));

    useEffect(() => {
        let disposed = false;
        let animation = 0;
        let canvas: InstanceType<typeof import("cvat-canvas3d-editor").Canvas3d> | null = null;
        const cleanups: Array<() => void> = [];
        const listen = (node: HTMLElement, name: string, handler: EventListener) => {
            node.addEventListener(name, handler);
            cleanups.push(() => node.removeEventListener(name, handler));
        };
        (async () => {
            const [{ Canvas3d }, scene] = await Promise.all([
                import("cvat-canvas3d-editor"),
                api.canvas3dScene(taskId, frame),
            ]);
            if (disposed || !host.current) return;
            if (!scene.frameData.cloud) {
                onNotice("No PCD point cloud is attached to this frame. Upload one through the 3D canvas API first.");
                return;
            }
            statesRef.current = scene.objectStates;
            onStatesChange(statesRef.current);
            nextId.current = statesRef.current.reduce((max, state) => Math.max(max, state.clientID), 0) + 1;
            canvas = new Canvas3d();
            canvasRef.current = canvas;
            const views = canvas.html();
            host.current.replaceChildren();
            for (const [name, node] of Object.entries(views)) {
                const panel = document.createElement("div");
                panel.className = `cvat3d-view cvat3d-${name}`;
                panel.dataset.view = name;
                panel.appendChild(node);
                host.current.appendChild(panel);
            }
            const perspective = views.perspective;
            listen(perspective, "canvas.selected", ((event: CustomEvent<{ clientID: number | null }>) => {
                selectedRef.current = event.detail.clientID;
                onSelectionChange(event.detail.clientID === null ? [] : [event.detail.clientID]);
                canvas?.activate(event.detail.clientID);
            }) as EventListener);
            listen(perspective, "canvas.drawn", ((event: CustomEvent<{ state: Partial<CanvasObjectState> }>) => {
                const color = "#ff4d4f";
                const state = {
                    ...event.detail.state,
                    clientID: nextId.current++, objectType: "shape", shapeType: "cuboid", frame,
                    label: { id: 0, name: labelRef.current, color, attributes: [] }, color,
                    occluded: false, outside: false, hidden: false, lock: false, pinned: false,
                    zOrder: 0, updated: 0, source: "manual", attributes: {}, descriptions: [],
                    group: { id: 0, color }, keyframe: true, rotation: 0,
                } as CanvasObjectState;
                statesRef.current = [...statesRef.current, state];
                onStatesChange(statesRef.current);
                canvas?.setup(makeFrameData(scene.frameData), statesRef.current);
            }) as EventListener);
            listen(perspective, "canvas.edited", ((event: CustomEvent<{ state: CanvasObjectState; points: number[] }>) => {
                statesRef.current = statesRef.current.map((state) => state.clientID === event.detail.state.clientID ? { ...state, points: event.detail.points } : state);
                onStatesChange(statesRef.current);
            }) as EventListener);
            const frameData = makeFrameData(scene.frameData);
            canvas.configure({ colorBy: "label", shapeOpacity: 40, selectedShapeOpacity: 60, controlPointsSize: 8, focusedObjectPadding: 50 });
            canvas.setup(frameData, statesRef.current);
            const animate = () => { canvas?.render(); animation = requestAnimationFrame(animate); };
            animate();
            const onKeyDown = (event: KeyboardEvent) => canvas?.keyControls(event);
            document.addEventListener("keydown", onKeyDown);
            cleanups.push(() => document.removeEventListener("keydown", onKeyDown));
            onNotice("");
        })().catch((error: unknown) => onNotice(error instanceof Error ? error.message : "The 3D canvas failed to start."));
        return () => {
            disposed = true;
            cancelAnimationFrame(animation);
            cleanups.forEach((cleanup) => cleanup());
            canvas?.destroy();
            canvasRef.current = null;
            host.current?.replaceChildren();
        };
    }, [taskId, frame, onNotice, onSelectionChange, onStatesChange]);

    return <div ref={host} className="cvat3d-grid" />;
});

function makeFrameData(data: { number: number; width: number; height: number; deleted: boolean; cloud: string | null }) {
    return {
        ...data,
        data(onReset?: () => void) {
            onReset?.();
            if (!data.cloud) return Promise.reject(new Error("Point cloud is missing"));
            return fetch(data.cloud).then((response) => {
                if (!response.ok) throw new Error("Point cloud could not be loaded");
                return response.blob();
            }).then((imageData) => ({ imageData }));
        },
    };
}
