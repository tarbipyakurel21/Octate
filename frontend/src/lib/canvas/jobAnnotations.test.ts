import { describe, expect, it } from "vitest";
import {
    addObject,
    addTrackSequence,
    editGeometry,
    fromServer,
    getBoundingBox,
    getCombinedBoundingBox,
    removeObjects,
    setLabel,
    setOutside,
    statesForFrame,
    toServer,
    trackShapeAt,
    translatePoints,
    type ServerAnnotations,
    type ServerShape,
} from "./jobAnnotations";

const labels = [{ id: 7, name: "Grasper", color: "#ff0000" }];

const box = (frame: number, points: number[], extra: Partial<ServerShape> = {}): ServerShape => ({
    type: "rectangle",
    frame,
    label_id: 7,
    occluded: false,
    outside: false,
    z_order: 0,
    rotation: 0,
    points,
    attributes: [],
    ...extra,
});

const data: ServerAnnotations = {
    version: 3,
    tags: [{ id: 1, frame: 0, label_id: 7 }],
    shapes: [{ ...box(2, [1, 1, 5, 5]), id: 11 }],
    tracks: [{
        id: 21,
        frame: 0,
        label_id: 7,
        attributes: [],
        shapes: [{ ...box(10, [20, 40, 60, 80]), id: 2 }, { ...box(0, [10, 20, 40, 60]), id: 1 }, box(20, [0, 0, 0, 0], { outside: true })],
    }],
};

describe("jobAnnotations", () => {
    it("interpolates tracks between keyframes and hides them once outside", () => {
        const [track] = fromServer(data).tracks;
        expect(trackShapeAt(track, 5)?.points).toEqual([15, 30, 50, 70]);
        expect(trackShapeAt(track, 5)?.keyframe).toBe(false);
        expect(trackShapeAt(track, 10)?.keyframe).toBe(true);
        expect(trackShapeAt(track, 15)?.points).toEqual([20, 40, 60, 80]);
        expect(trackShapeAt(track, 20)).toBeNull();
    });

    it("builds canvas states for one frame", () => {
        const model = fromServer(data);
        expect(statesForFrame(model, 2, labels).map((state) => state.objectType)).toEqual(["shape", "track"]);
        const [track] = statesForFrame(model, 4, labels);
        expect(track.label).toMatchObject({ id: 7, name: "Grasper", color: "#ff0000" });
        expect(track.updated).toBeGreaterThan(0);
    });

    it("edits a track by adding a keyframe on the current frame", () => {
        let model = fromServer(data);
        const clientID = model.tracks[0].clientID;
        model = editGeometry(model, clientID, 5, { points: [0, 0, 9, 9] });
        expect(model.tracks[0].shapes.map((shape) => shape.frame)).toEqual([0, 5, 10, 20]);
        expect(trackShapeAt(model.tracks[0], 5)?.points).toEqual([0, 0, 9, 9]);
        model = setOutside(model, [clientID], 7);
        expect(trackShapeAt(model.tracks[0], 8)).toBeNull();
    });

    it("turns a selected rectangle into an AI track sequence", () => {
        let model = fromServer({ tags: [], shapes: [box(2, [1, 2, 11, 12])], tracks: [] });
        const clientID = model.shapes[0].clientID;
        model = addTrackSequence(model, {
            clientID,
            labelId: 7,
            type: "rectangle",
            frames: [
                { frame: 2, points: [1, 2, 11, 12] },
                { frame: 4, points: [5, 6, 15, 16] },
            ],
        });
        expect(model.shapes).toHaveLength(0);
        expect(model.tracks).toHaveLength(1);
        expect(model.tracks[0].source).toBe("auto");
        expect(trackShapeAt(model.tracks[0], 3)?.points).toEqual([3, 4, 13, 14]);
    });

    it("round-trips to the job annotations payload without ids or local fields", () => {
        let model = fromServer(data);
        model = addObject(model, { frame: 3, type: "polygon", labelId: 7, points: [0, 0, 4, 0, 4, 4] });
        model = removeObjects(model, [model.shapes[0].clientID]);
        const payload = toServer(model);
        expect(payload.shapes).toHaveLength(1);
        expect(payload.shapes[0]).not.toHaveProperty("clientID");
        expect(payload.tracks[0]).not.toHaveProperty("id");
        expect(payload.tracks[0].shapes.every((shape) => !("id" in shape))).toBe(true);
        expect(payload.tags[0]).toEqual({ frame: 0, label_id: 7 });
    });

    it("translates shape points by delta X and delta Y", () => {
        expect(translatePoints([10, 20, 50, 60], 5, -5)).toEqual([15, 15, 55, 55]);
        expect(translatePoints([0, 0, 10, 20, 20, 40], -2, 3)).toEqual([-2, 3, 8, 23, 18, 43]);
        expect(translatePoints([1, 2, 3, 10, 20, 30, 40], 4, 6, "mask")).toEqual([1, 2, 3, 14, 26, 34, 46]);
    });

    it("refuses to edit geometry of a locked shape or track", () => {
        let model = fromServer(data);
        const clientID = model.shapes[0].clientID;
        model.shapes[0].lock = true;
        const unchanged = editGeometry(model, clientID, 2, { points: [99, 99, 100, 100] });
        expect(unchanged.shapes[0].points).toEqual([1, 1, 5, 5]);

        model.shapes[0].lock = false;
        const modified = editGeometry(model, clientID, 2, { points: [99, 99, 100, 100] });
        expect(modified.shapes[0].points).toEqual([99, 99, 100, 100]);
    });

    it("assigns a new label to shapes and tracks", () => {
        let model = fromServer(data);
        const shapeId = model.shapes[0].clientID;
        const trackId = model.tracks[0].clientID;
        model = setLabel(model, [shapeId], 42);
        expect(model.shapes[0].label_id).toBe(42);
        expect(model.shapes[0].updated).toBeGreaterThan(1);

        model = setLabel(model, [trackId], 99);
        expect(model.tracks[0].label_id).toBe(99);
        expect(model.tracks[0].shapes.every((s) => s.label_id === 99)).toBe(true);
    });

    it("calculates bounding box and combined bounding box correctly", () => {
        const rectBox = getBoundingBox([10, 20, 50, 60], "rectangle");
        expect(rectBox).toEqual({
            minX: 10,
            minY: 20,
            maxX: 50,
            maxY: 60,
            width: 40,
            height: 40,
            centerX: 30,
            centerY: 40,
        });

        const polyBox = getBoundingBox([0, 10, 20, 0, 40, 30], "polygon");
        expect(polyBox).toEqual({
            minX: 0,
            minY: 0,
            maxX: 40,
            maxY: 30,
            width: 40,
            height: 30,
            centerX: 20,
            centerY: 15,
        });

        const combined = getCombinedBoundingBox([
            { points: [10, 20, 50, 60], shapeType: "rectangle" },
            { points: [0, 0, 10, 10], shapeType: "rectangle" },
        ]);
        expect(combined).toEqual({
            minX: 0,
            minY: 0,
            maxX: 50,
            maxY: 60,
            width: 50,
            height: 60,
            centerX: 25,
            centerY: 30,
        });

        // Mask shape type (last 4 numbers are bbox [xtl, ytl, xbr, ybr])
        const maskBox = getBoundingBox([1, 0, 1, 100, 200, 300, 400], "mask");
        expect(maskBox).toEqual({
            minX: 100,
            minY: 200,
            maxX: 300,
            maxY: 400,
            width: 200,
            height: 200,
            centerX: 200,
            centerY: 300,
        });

        // Test frame centering computation
        const frameWidth = 1920;
        const frameHeight = 1080;
        const dx = Math.round(frameWidth / 2 - rectBox!.centerX);
        const dy = Math.round(frameHeight / 2 - rectBox!.centerY);
        const centeredPoints = translatePoints([10, 20, 50, 60], dx, dy, "rectangle");
        const centeredBox = getBoundingBox(centeredPoints, "rectangle");
        expect(centeredBox?.centerX).toBe(frameWidth / 2);
        expect(centeredBox?.centerY).toBe(frameHeight / 2);
    });
});
