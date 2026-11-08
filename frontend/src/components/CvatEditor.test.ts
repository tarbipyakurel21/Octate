import { describe, expect, it } from "vitest";
import { getCanvasClientID } from "./CvatEditor";

describe("CvatEditor canvas interactions", () => {
    it("reads a completed shape client ID from its SVG node", () => {
        const shape = { id: "cvat_canvas_shape_42", getAttribute: () => null } as unknown as Element;
        expect(getCanvasClientID({ closest: () => shape } as unknown as EventTarget)).toBe(42);
    });

    it("reads client IDs from nested SVG targets", () => {
        const shape = { id: "", getAttribute: () => "7" } as unknown as Element;
        expect(getCanvasClientID({ closest: () => shape } as unknown as EventTarget)).toBe(7);
    });

    it("ignores unrelated targets", () => {
        expect(getCanvasClientID({} as EventTarget)).toBeNull();
        expect(getCanvasClientID(null)).toBeNull();
    });
});
