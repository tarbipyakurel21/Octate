import type { Annotation, CanvasObjectState, Project, ReviewItem, Task, TaskJob } from "../types";

const headers = { "Content-Type": "application/json" };

function errorText(raw: string): string {
    try {
        const body = JSON.parse(raw) as {
            error?: string;
            detail?: string;
            non_field_errors?: string[];
        };
        if (body.error) return body.error;
        if (typeof body.detail === "string") return body.detail;
        if (body.non_field_errors?.length) return body.non_field_errors.join(" ");
    } catch {
        /* The server sometimes returns plain text. */
    }
    return raw || "Request failed";
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
    labels: string[];
    imageQuality: number;
    segmentSize: number;
    file: File;
};

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
    tasks: async (projectId?: string) => {
        const filter = projectId ? `&project_id=${encodeURIComponent(projectId)}` : "";
        return (await collection<CvatTask>(`/api/tasks?page_size=100${filter}`)).map(normalizeTask);
    },
    task: async (id: string) => normalizeTask(await request<CvatTask>(`/api/tasks/${id}`)),
    projects: async () => (await collection<CvatProject>("/api/projects?page_size=100")).map(normalizeProject),
    project: async (id: string) => normalizeProject(await request<CvatProject>(`/api/projects/${id}`)),
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
        const created = await request<CvatTask>("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: draft.name,
                segment_size: draft.segmentSize || 0,
                labels: draft.labels.map((name) => ({ name, type: "any", attributes: [] })),
            }),
        });

        await request(`/api/tasks/${created.id}/data`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Upload-Start": "true" },
            body: "{}",
        });

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
                else reject(new Error(errorText(xhr.responseText)));
            };
            xhr.onerror = () => reject(new Error("Upload failed"));
            xhr.send(body);
        });

        const upload = await request<{ rq_id: string }>(`/api/tasks/${created.id}/data`, {
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

        for (;;) {
            const processing = await request<CvatRequest>(`/api/requests/${upload.rq_id}`);
            const status = String(processing.status || "").toLowerCase();
            if (status === "finished") break;
            if (status === "failed") {
                throw new Error(processing.message || "CVAT could not process the uploaded video");
            }
            await wait(1000);
        }

        return normalizeTask(await request<CvatTask>(`/api/tasks/${created.id}`));
    },
    frameUrl: (id: string, frame: number) => `/api/tasks/${id}/frames/${frame}`,
    canvasScene: (id: string, frame: number) =>
        request<{
            frameData: { width: number; height: number; image: string | null };
            objectStates: CanvasObjectState[];
        }>(`/api/canvas/2d/${id}/frames/${frame}`),
    saveCanvas: (id: string, frame: number, body: { objectStates: CanvasObjectState[]; width: number; height: number }) =>
        request<{ objectStates: CanvasObjectState[] }>(`/api/canvas/2d/${id}/frames/${frame}`, {
            method: "PUT",
            headers,
            body: JSON.stringify(body),
        }),
    canvas3dScene: (id: string, frame: number) =>
        request<{
            frameData: { number: number; width: number; height: number; deleted: boolean; cloud: string | null };
            objectStates: CanvasObjectState[];
        }>(`/api/canvas/3d/${id}/frames/${frame}`),
    saveCanvas3d: (id: string, frame: number, objectStates: CanvasObjectState[]) =>
        request<{ objectStates: CanvasObjectState[] }>(`/api/canvas/3d/${id}/frames/${frame}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ objectStates }),
        }),
    previewUrl: (id: string) => `/api/tasks/${id}/preview`,
    annotations: (id: string) => request<Annotation[]>(`/api/projects/${id}/annotations`),
    saveAnnotations: (id: string, items: Annotation[]) =>
        request<{ saved: number }>(`/api/projects/${id}/annotations`, {
            method: "PUT",
            headers,
            body: JSON.stringify(items),
        }),
    review: (id: string) => request<ReviewItem[]>(`/api/projects/${id}/review`),
    reviewItem: (id: string, status: "approved" | "rejected") =>
        request<ReviewItem>(`/api/review/${id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ status }),
        }),
    infer: (
        action: "detect" | "segment" | "track",
        id: string,
        frame: number,
        size?: { width: number; height: number },
    ) =>
        request<{ annotations: Annotation[]; review_items: ReviewItem[]; mode?: string }>(
            `/api/inference/${action}`,
            {
                method: "POST",
                headers,
                body: JSON.stringify({
                    project_id: id,
                    frame,
                    width: size?.width ?? 0,
                    height: size?.height ?? 0,
                }),
            },
        ),
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

type CvatProject = {
    id: number;
    name: string;
    owner?: { username: string } | null;
    created_date?: string;
    updated_date?: string;
};

type CvatRequest = {
    status: "queued" | "started" | "finished" | "failed" | string;
    message?: string;
    progress?: number;
    result_url?: string | null;
};

function normalizeProject(project: CvatProject): Project {
    const now = new Date().toISOString();
    return {
        id: String(project.id),
        name: project.name,
        owner: project.owner?.username || "Octate",
        created_date: project.created_date ?? now,
        updated_date: project.updated_date ?? now,
    };
}

function normalizeJob(job: CvatJob): TaskJob {
    return {
        id: String(job.id),
        task_id: String(job.task_id),
        status: job.stage || job.state || job.status || "annotation",
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
