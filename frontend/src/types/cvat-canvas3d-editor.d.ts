declare module "cvat-canvas3d-editor" {
    type Views = {
        perspective: HTMLCanvasElement;
        top: HTMLCanvasElement;
        side: HTMLCanvasElement;
        front: HTMLCanvasElement;
    };
    export class Canvas3d {
        html(): Views;
        setup(frameData: unknown, objectStates: unknown[]): void;
        draw(data: { enabled: boolean; shapeType?: string }): void;
        dragCanvas(enable: boolean): void;
        activate(clientID: number | null): void;
        configure(configuration: Record<string, unknown>): void;
        fit(): void;
        focus(clientID: number): void;
        group(data: { enabled: boolean }): void;
        merge(data: { enabled: boolean }): void;
        split(data: { enabled: boolean }): void;
        cancel(): void;
        render(): void;
        keyControls(event: KeyboardEvent): void;
        destroy(): void;
    }
}
