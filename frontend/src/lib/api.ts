import type { CvatLabel, ServerAnnotations } from "./canvas/jobAnnotations";
import type { Task, TaskJob } from "../types";

const headers = { "Content-Type": "application/json" };

function publicMessage(value: string): string {
    return value
        .replace(/Computer Vision Annotation Tool/gi, "Octate")
        .replace(/\bcvat\b/gi, "Octate");
}

function errorText(raw: string): string {
    try {
        const body = JSON.parse(raw) as {
            error?: string;
            detail?: string;
            non_field_errors?: string[];
        };
        if (body.error) return publicMessage(body.error);
        if (typeof body.detail === "string") return publicMessage(body.detail);
        if (body.non_field_errors?.length) return publicMessage(body.non_field_errors.join(" "));
    } catch {
        /* The server sometimes returns plain text. */
    }
    return publicMessage(raw || "Request failed");
}

function cookie(name: string): string {
    if (typeof document === "undefined") return "";
    const item = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
    return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : "";
}

function writeHeaders(extra?: HeadersInit): Headers {
    const result = new Headers(extra);
    const csrf = cookie("csrftoken");
    if (csrf) result.set("X-CSRFToken", csrf);
    return result;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { credentials: "same-origin", ...init, headers: writeHeaders(init?.headers) });
    const text = await response.text();
    if (!response.ok) throw new Error(errorText(text));
    return text ? (JSON.parse(text) as T) : (undefined as T);
}

export type TaskDraft = {
    name: string;
    imageQuality: number;
    segmentSize: number;
    file: File;
};

type ModelCatalog = Record<string, { metadata?: { annotations?: { type?: string; spec?: string } } }>;

export type CvatModel = {
    id: string;
    name: string;
    kind: "detector" | "interactor" | "tracker" | string;
    description?: string;
    min_pos_points?: number;
    min_neg_points?: number;
    supported_shape_types?: string[];
};

const FALLBACK_SURGICAL_LABELS = [
    "Grasper", "Scissors", "Hook cautery", "Clip applier",
    "Suction", "Needle driver", "Trocar", "Specimen bag",
];

async function detectorLabels(): Promise<{ name: string; type: "any"; attributes: [] }[]> {
    try {
        const catalog = await request<ModelCatalog>("/model-api/api/functions");
        const names: string[] = [];
        for (const item of Object.values(catalog)) {
            const annotations = item.metadata?.annotations;
            if (annotations?.type !== "detector") continue;
            const spec = JSON.parse(annotations.spec || "[]") as { name?: string }[];
            for (const label of spec) {
                if (label.name && !names.includes(label.name)) names.push(label.name);
            }
        }
        if (names.length) return names.map((name) => ({ name, type: "any", attributes: [] }));
    } catch {
        // Model gateway not available yet — use the built-in surgical vocabulary.
    }
    return FALLBACK_SURGICAL_LABELS.map((name) => ({ name, type: "any", attributes: [] }));
}

async function collection<T>(url: string): Promise<T[]> {
    const page = await request<{ results?: T[] } | T[]>(url);
    if (Array.isArray(page)) return page;
    return page.results ?? [];
}

export const api = {
    async currentUser() {
        return request<{ username: string }>("/api/users/self");
    },
    async login(username: string, password: string) {
        await fetch("/api/server/about", { credentials: "same-origin" });
        const user = await request<{ username?: string } | undefined>("/api/auth/login", {
            method: "POST",
            headers,
            body: JSON.stringify({ username, password }),
        });
        return { username: user?.username || username };
    },
    logout() {
        return request<void>("/api/auth/logout", { method: "POST" });
    },
    tasks: async () => (await collection<CvatTask>("/api/tasks?page_size=100")).map(normalizeTask),
    task: async (id: string) => normalizeTask(await request<CvatTask>(`/api/tasks/${id}`)),
    deleteTask: (id: string) => request<void>(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }),
    jobs: async () => (await collection<CvatJob>("/api/jobs?page_size=100")).map(normalizeJob),
    taskJobs: async (taskId: string) =>
        (await collection<CvatJob>(`/api/jobs?task_id=${encodeURIComponent(taskId)}&page_size=100`)).map(normalizeJob),
    jobUrl: (taskId: string, jobId: string) => `/tasks/${taskId}/jobs/${jobId}`,
    async exportTask(id: string, format: string) {
        const started = await request<{ rq_id: string }>(
            `/api/tasks/${id}/dataset/export?format=${encodeURIComponent(format)}&save_images=false&location=local`,
            { method: "POST", headers, body: "{}" },
        );
        for (;;) {
            const processing = await request<CvatRequest>(`/api/requests/${started.rq_id}`);
            const status = String(processing.status || "").toLowerCase();
            if (status === "finished") {
                if (!processing.result_url) throw new Error("Export finished without a download");
                return processing.result_url;
            }
            if (status === "failed") throw new Error(processing.message || "Export failed");
            await wait(1000);
        }
    },
    async uploadTask(draft: TaskDraft, onProgress: (loaded: number, total: number) => void) {
        // Chrome reports ERR_UPLOAD_FILE_CHANGED when the browser can no longer
        // read the selected local file. Check readability before creating a
        // server task so this case gets an actionable message instead of a
        // misleading generic network error.
        try {
            await draft.file.slice(0, Math.min(draft.file.size, 1)).arrayBuffer();
        } catch {
            throw new Error("The selected video could not be read. Reselect a stable local copy and try again.");
        }

        const created = await request<CvatTask>("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: draft.name,
                segment_size: draft.segmentSize || 0,
                labels: await detectorLabels(),
            }),
        });

        try {
            try {
                await request(`/api/tasks/${created.id}/data`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Upload-Start": "true" },
                    body: "{}",
                });
            } catch (reason) {
                throw reason;
            }

            await new Promise<void>((resolve, reject) => {
                const body = new FormData();
                body.append("client_files[0]", draft.file, draft.file.name);
                const xhr = new XMLHttpRequest();
                xhr.open("POST", `/api/tasks/${created.id}/data`);
                xhr.withCredentials = true;
                const csrf = cookie("csrftoken");
                if (csrf) xhr.setRequestHeader("X-CSRFToken", csrf);
                xhr.setRequestHeader("Upload-Multiple", "true");
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) onProgress(event.loaded, event.total);
                };
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) resolve();
                    else {
                        const message = errorText(xhr.responseText);
                        reject(new Error(message === "Request failed" ? `Upload request failed (HTTP ${xhr.status})` : message));
                    }
                };
                xhr.onerror = () => {
                    reject(new Error("The video upload could not be read or sent. Reselect a stable local copy and try again."));
                };
                xhr.send(body);
            });

            let upload: { rq_id: string };
            try {
                upload = await request<{ rq_id: string }>(`/api/tasks/${created.id}/data`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Upload-Finish": "true" },
                    body: JSON.stringify({
                        image_quality: draft.imageQuality,
                        use_cache: true,
                        use_zip_chunks: false,
                        sorting_method: "lexicographical",
                        server_files: [],
                        remote_files: [],
                    }),
                });
            } catch (reason) {
                throw reason;
            }

            for (;;) {
                const processing = await request<CvatRequest>(`/api/requests/${upload.rq_id}`);
                const status = String(processing.status || "").toLowerCase();
                if (status === "finished") break;
                if (status === "failed") {
                    throw new Error(publicMessage(processing.message || "The uploaded video could not be processed"));
                }
                await wait(1000);
            }

            return normalizeTask(await request<CvatTask>(`/api/tasks/${created.id}`));
        } catch (reason) {
            try {
                await request<void>(`/api/tasks/${encodeURIComponent(created.id)}`, { method: "DELETE" });
            } catch {
                // Preserve the upload error; cleanup is best effort.
            }
            throw reason;
        }
    },
    previewUrl: (id: string) => `/api/tasks/${id}/preview`,
    job: async (id: string) => normalizeJob(await request<CvatJob>(`/api/jobs/${id}`)),
    updateJobState: (id: string, state: string) => request<CvatJob>(`/api/jobs/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ state }),
    }),
    addLabel: async (taskId: string, jobId: string, name: string, color?: string) => {
        const currentTask = await request<CvatTask>(`/api/tasks/${taskId}`);
        const existing = (currentTask.labels || []).map((l) => ({ id: l.id, name: l.name, color: l.color }));
        const colors = ["#1890ff", "#52c41a", "#faad14", "#ff4d4f", "#722ed1", "#13c2c2", "#eb2f96", "#fa8c16", "#13a8a8"];
        const newColor = color || colors[existing.length % colors.length];
        await request<CvatTask>(`/api/tasks/${taskId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                labels: [...existing, { name: name.trim(), color: newColor, type: "any" }],
            }),
        });
        return collection<CvatLabel>(`/api/labels?job_id=${encodeURIComponent(jobId)}&page_size=500`);
    },
    jobLabels: (jobId: string) => collection<CvatLabel>(`/api/labels?job_id=${encodeURIComponent(jobId)}&page_size=500`),
    jobFrameUrl: (jobId: string, frame: number) =>
        `/api/jobs/${jobId}/data?type=frame&quality=compressed&number=${frame}`,
    jobAnnotations: (jobId: string) => request<ServerAnnotations>(`/api/jobs/${jobId}/annotations/`),
    saveJobAnnotations: (jobId: string, body: ServerAnnotations) =>
        request<void>(`/api/jobs/${jobId}/annotations/`, {
            method: "PUT",
            headers,
            body: JSON.stringify(body),
        }),
    models: () => request<CvatModel[]>("/model-api/api/models"),
    detect: async (functionId: string, body: { task: number; job: number; frame: number; threshold?: number }) => {
        // CVAT proxies to the model gateway; the gateway returns {"shapes": [...]} for the detector.
        const result = await request<DetectedShape[] | { shapes?: DetectedShape[] }>(
            `/api/lambda/functions/${encodeURIComponent(functionId)}`,
            { method: "POST", headers, body: JSON.stringify({ cleanup: false, quality: "original", conv_mask_to_poly: true, ...body }) },
        );
        // Normalise: some CVAT versions return the array directly, some wrap it.
        return Array.isArray(result) ? result : (result.shapes ?? []);
    },
    interact: (functionId: string, body: {
        task: number;
        job: number;
        frame: number;
        pos_points: number[][];
        neg_points: number[][];
        obj_bbox?: number[] | number[][];
    }) => {
        const payload: Record<string, unknown> = { ...body };
        if (body.obj_bbox) {
            const bbox = body.obj_bbox;
            if (Array.isArray(bbox) && bbox.length === 4 && typeof bbox[0] === "number") {
                payload.obj_bbox = [[bbox[0], bbox[1]], [bbox[2], bbox[3]]];
            }
        }
        return request<{ shapes: DetectedShape[] }>(`/api/lambda/functions/${encodeURIComponent(functionId)}`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });
    },
    track: (functionId: string, body: {
        task: number;
        job: number;
        frame: number;
        shapes?: { type: string; points: number[] }[];
        states?: Record<string, unknown>[];
    }) => request<{ shapes: ({ type: string; points: number[] } | null)[]; states: Record<string, unknown>[] }>(
        `/api/lambda/functions/${encodeURIComponent(functionId)}`,
        { method: "POST", headers, body: JSON.stringify(body) },
    ),
};

export type DetectedShape = {
    type: string;
    points: number[];
    label?: string;
    label_id?: number;
    confidence?: number | string;
    rotation?: number;
};

type CvatTask = {
    id: number;
    name: string;
    size?: number;
    mode?: string;
    labels?: Task["labels"];
    owner?: { username: string } | null;
    created_date?: string;
    updated_date?: string;
    segment_size?: number;
    jobs?: { completed?: number; count?: number };
};

type CvatJob = {
    id: number;
    task_id: number;
    status?: string;
    state?: string;
    stage?: string;
    start_frame?: number;
    stop_frame?: number;
    type?: string;
};

type CvatRequest = {
    status: "queued" | "started" | "finished" | "failed" | string;
    message?: string;
    progress?: number;
    result_url?: string | null;
};

function normalizeJob(job: CvatJob): TaskJob {
    return {
        id: String(job.id),
        task_id: String(job.task_id),
        status: job.stage || job.state || job.status || "annotation",
        state: job.state || "new",
        stage: job.stage || "annotation",
        start_frame: job.start_frame ?? 0,
        stop_frame: job.stop_frame ?? 0,
        type: job.type || "annotation",
    };
}

function normalizeTask(task: CvatTask): Task {
    const size = task.size ?? 0;
    const now = new Date().toISOString();
    return {
        id: String(task.id),
        name: task.name,
        status: size > 0 ? "annotation" : "processing",
        size,
        mode: task.mode ?? "annotation",
        labels: Array.isArray(task.labels) ? task.labels : [],
        owner: task.owner ?? { username: "Octate" },
        created_date: task.created_date ?? now,
        updated_date: task.updated_date ?? now,
        image_quality: 70,
        segment_size: task.segment_size ?? 0,
        video_name: task.name,
        fps: 0,
        uncertain: 0,
        frames: size,
        videoName: task.name,
        updatedAt: task.updated_date ?? now,
        jobs: [],
        progress: {
            completed_jobs: task.jobs?.completed ?? 0,
            total_jobs: task.jobs?.count ?? 0,
            validation_jobs: 0,
            annotation_jobs: task.jobs?.count ?? 0,
        },
    };
}
