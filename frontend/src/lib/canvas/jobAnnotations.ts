import type { CanvasObjectState } from "../../types";

export type CvatLabel = { id: number; name: string; color?: string; type?: string };
export type CvatAttribute = { spec_id: number; value: string };

export type ServerShape = {
    id?: number;
    type: string;
    frame: number;
    label_id: number;
    group?: number;
    source?: string;
    occluded: boolean;
    outside?: boolean;
    z_order: number;
    rotation?: number;
    points: number[];
    attributes: CvatAttribute[];
    elements?: ServerShape[];
};

export type ServerTrack = {
    id?: number;
    frame: number;
    label_id: number;
    group?: number;
    source?: string;
    shapes: ServerShape[];
    attributes: CvatAttribute[];
    elements?: ServerTrack[];
};

export type ServerAnnotations = {
    version?: number;
    tags: unknown[];
    shapes: ServerShape[];
    tracks: ServerTrack[];
    intervals?: unknown[];
};

type Local = { clientID: number; updated: number; hidden?: boolean; lock?: boolean };
export type LocalShape = ServerShape & Local;
export type LocalTrack = ServerTrack & Local;
export type JobModel = { tags: unknown[]; intervals: unknown[]; shapes: LocalShape[]; tracks: LocalTrack[]; nextID: number };

export type Geometry = { points: number[]; rotation?: number };
export type NewObject = Geometry & { frame: number; type: string; labelId: number; source?: string; track?: boolean };

// The canvas cannot render skeleton elements without cvat-core's ObjectState, so they stay server-only.
const RENDERABLE = new Set(["rectangle", "polygon", "polyline", "points", "ellipse", "cuboid", "mask"]);
const FALLBACK = ["#ff4d4f", "#1890ff", "#52c41a", "#faad14", "#722ed1", "#13c2c2", "#eb2f96"];

export function labelColor(label: CvatLabel | undefined): string {
    if (label?.color) return label.color;
    return FALLBACK[Math.abs(label?.id ?? 0) % FALLBACK.length];
}

export function fromServer(data: ServerAnnotations): JobModel {
    let nextID = 1;
    const shapes = data.shapes.map((shape) => ({ ...shape, clientID: nextID++, updated: 1 }));
    const tracks = data.tracks.map((track) => ({
        ...track,
        shapes: [...track.shapes].sort((a, b) => a.frame - b.frame),
        clientID: nextID++,
        updated: 1,
    }));
    return { tags: data.tags, intervals: data.intervals ?? [], shapes, tracks, nextID };
}

export function toServer(model: JobModel): ServerAnnotations {
    // PUT replaces the job's annotations, so ids are dropped and the server assigns new ones.
    const shape = ({ id: _id, elements, ...rest }: ServerShape): ServerShape => ({
        ...rest,
        ...(elements ? { elements: elements.map(shape) } : {}),
    });
    const track = ({ id: _id, shapes, elements, ...rest }: ServerTrack): ServerTrack => ({
        ...rest,
        shapes: shapes.map(shape),
        ...(elements ? { elements: elements.map(track) } : {}),
    });
    const strip = <T extends Local>({ clientID: _c, updated: _u, hidden: _h, lock: _l, ...rest }: T) => rest;
    const withoutId = (item: unknown) => {
        const { id: _id, ...rest } = item as { id?: number };
        return rest;
    };
    return {
        tags: model.tags.map(withoutId),
        intervals: model.intervals.map(withoutId),
        shapes: model.shapes.map((item) => shape(strip(item))),
        tracks: model.tracks.map((item) => track(strip(item))),
    };
}

/** The track's shape on `frame`, interpolated between keyframes. Null when the track is outside. */
export function trackShapeAt(track: ServerTrack, frame: number): (ServerShape & { keyframe: boolean }) | null {
    const shapes = track.shapes;
    let prev: ServerShape | undefined;
    let next: ServerShape | undefined;
    for (const shape of shapes) {
        if (shape.frame <= frame) prev = shape;
        else if (!next) next = shape;
    }
    if (!prev || prev.outside) return null;
    if (prev.frame === frame) return { ...prev, keyframe: true };
    const end = next;
    if (!end || end.outside || end.type !== prev.type || end.points.length !== prev.points.length || prev.type === "mask") {
        return { ...prev, frame, keyframe: false };
    }
    const t = (frame - prev.frame) / (end.frame - prev.frame);
    const lerp = (a: number, b: number) => a + (b - a) * t;
    return {
        ...prev,
        frame,
        keyframe: false,
        points: prev.points.map((value, index) => lerp(value, end.points[index])),
        rotation: lerp(prev.rotation ?? 0, end.rotation ?? 0),
    };
}

export function statesForFrame(model: JobModel, frame: number, labels: CvatLabel[]): CanvasObjectState[] {
    const byId = new Map(labels.map((label) => [label.id, label]));
    const state = (
        item: Local & { label_id: number; group?: number; source?: string },
        shape: ServerShape,
        objectType: "shape" | "track",
        keyframe: boolean,
    ): CanvasObjectState => {
        const label = byId.get(item.label_id);
        const color = labelColor(label);
        return {
            clientID: item.clientID,
            objectType,
            shapeType: shape.type,
            points: shape.points,
            rotation: shape.rotation ?? 0,
            frame,
            label: { id: item.label_id, name: label?.name ?? "object", color, attributes: [] },
            occluded: shape.occluded,
            outside: false,
            hidden: Boolean(item.hidden),
            lock: Boolean(item.lock),
            pinned: false,
            zOrder: shape.z_order,
            updated: item.updated,
            source: item.source ?? "manual",
            attributes: {},
            descriptions: [],
            group: { id: item.group ?? 0, color },
            color,
            keyframe,
        };
    };
    const shapes = model.shapes
        .filter((shape) => shape.frame === frame && RENDERABLE.has(shape.type))
        .map((shape) => state(shape, shape, "shape", true));
    const tracks = model.tracks.flatMap((track) => {
        const shape = trackShapeAt(track, frame);
        return shape && RENDERABLE.has(shape.type) ? [state(track, shape, "track", shape.keyframe)] : [];
    });
    return [...shapes, ...tracks];
}

export function addObject(model: JobModel, item: NewObject): JobModel {
    const shape: ServerShape = {
        type: item.type,
        frame: item.frame,
        label_id: item.labelId,
        group: 0,
        source: item.source ?? "manual",
        occluded: false,
        outside: false,
        z_order: 0,
        rotation: item.rotation ?? 0,
        points: item.points,
        attributes: [],
    };
    const local = { clientID: model.nextID, updated: 1 };
    if (item.track) {
        const track: LocalTrack = {
            frame: item.frame,
            label_id: item.labelId,
            group: 0,
            source: shape.source,
            shapes: [shape],
            attributes: [],
            ...local,
        };
        return { ...model, tracks: [...model.tracks, track], nextID: model.nextID + 1 };
    }
    return { ...model, shapes: [...model.shapes, { ...shape, ...local }], nextID: model.nextID + 1 };
}

function upsertKeyframe(track: LocalTrack, frame: number, change: (shape: ServerShape) => ServerShape): LocalTrack {
    const current = trackShapeAt(track, frame);
    const base: ServerShape = current
        ? (({ keyframe: _k, ...rest }) => rest)(current)
        : { ...track.shapes[track.shapes.length - 1], frame, outside: false };
    const shapes = [...track.shapes.filter((shape) => shape.frame !== frame), change({ ...base, frame })];
    shapes.sort((a, b) => a.frame - b.frame);
    return { ...track, shapes, updated: track.updated + 1 };
}

export function editGeometry(model: JobModel, clientID: number, frame: number, geometry: Geometry): JobModel {
    const apply = <T extends ServerShape>(shape: T): T => ({
        ...shape,
        points: geometry.points,
        rotation: geometry.rotation ?? shape.rotation ?? 0,
    });
    return {
        ...model,
        shapes: model.shapes.map((shape) =>
            shape.clientID === clientID ? { ...apply(shape), updated: shape.updated + 1 } : shape,
        ),
        tracks: model.tracks.map((track) =>
            track.clientID === clientID ? upsertKeyframe(track, frame, apply) : track,
        ),
    };
}

/** Ends the track on `frame`. Earlier frames keep their shapes. */
export function setOutside(model: JobModel, clientIDs: number[], frame: number): JobModel {
    return {
        ...model,
        tracks: model.tracks.map((track) =>
            clientIDs.includes(track.clientID) && trackShapeAt(track, frame)
                ? upsertKeyframe(track, frame, (shape) => ({ ...shape, outside: true }))
                : track,
        ),
    };
}

export function removeObjects(model: JobModel, clientIDs: number[]): JobModel {
    return {
        ...model,
        shapes: model.shapes.filter((shape) => !clientIDs.includes(shape.clientID)),
        tracks: model.tracks.filter((track) => !clientIDs.includes(track.clientID)),
    };
}

export function toggleFlag(model: JobModel, clientIDs: number[], flag: "hidden" | "lock"): JobModel {
    const toggle = <T extends Local>(item: T): T =>
        clientIDs.includes(item.clientID) ? { ...item, [flag]: !item[flag], updated: item.updated + 1 } : item;
    return { ...model, shapes: model.shapes.map(toggle), tracks: model.tracks.map(toggle) };
}

export function groupObjects(model: JobModel, clientIDs: number[]): JobModel {
    const used = [...model.shapes, ...model.tracks].map((item) => item.group ?? 0);
    const group = Math.max(0, ...used) + 1;
    const assign = <T extends Local & { group?: number }>(item: T): T =>
        clientIDs.includes(item.clientID) ? { ...item, group, updated: item.updated + 1 } : item;
    return { ...model, shapes: model.shapes.map(assign), tracks: model.tracks.map(assign) };
}

/** Frames that hold a shape or a track keyframe, for the timeline. */
export function keyFrames(model: JobModel): number[] {
    const frames = new Set<number>();
    for (const shape of model.shapes) frames.add(shape.frame);
    for (const track of model.tracks) for (const shape of track.shapes) frames.add(shape.frame);
    return [...frames].sort((a, b) => a - b);
}
