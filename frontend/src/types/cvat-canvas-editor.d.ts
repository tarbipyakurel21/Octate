declare module "cvat-canvas-editor" {
    export class Canvas {
        html(): HTMLDivElement;
        setup(frameData: unknown, objectStates: unknown[]): void;
        draw(data: { enabled: boolean; shapeType?: string; crosshair?: boolean; rectDrawingMethod?: string }): void;
        dragCanvas(enable: boolean): void;
        fit(): void;
        fitCanvas(): void;
        cancel(): void;
        destroy(): void;
        configure(configuration: Record<string, unknown>): void;
        activate(clientID: number | null): void;
        focus(clientID: number, padding?: number): void;
        rotate(angle: number): void;
        grid(stepX: number, stepY: number): void;
        bitmap(enable: boolean): void;
        selectRegion(enable: boolean): void;
        zoomCanvas(enable: boolean): void;
        selectObjects(data: { enabled: boolean; once?: boolean }): void;
        setSelectedObjects(clientIDs: number[]): void;
        undo(): boolean;
        redo(): boolean;
        group(data: { enabled: boolean }): void;
        merge(data: { enabled: boolean }): void;
        join(data: { enabled: boolean }): void;
        split(data: { enabled: boolean }): void;
        slice(data: { enabled: boolean; clientID?: number }): void;
    }
    export const RectDrawingMethod: { CLASSIC: string };
}
