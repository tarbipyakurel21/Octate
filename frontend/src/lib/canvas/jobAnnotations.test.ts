import { describe, expect, it } from "vitest";
import {
    addObject,
    editGeometry,
    fromServer,
    removeObjects,
    setOutside,
    statesForFrame,
    toServer,
    trackShapeAt,
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
});
