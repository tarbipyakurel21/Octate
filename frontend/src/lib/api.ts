import type { Annotation, CanvasObjectState, ReviewItem, Task, TaskJob } from "../types";

const headers = { "Content-Type": "application/json" };

function errorText(raw: string): string {
    try {
        const body = JSON.parse(raw) as { error?: string };
        if (body.error) return body.error;
    } catch {
        /* The server sometimes returns plain text. */
    }
    return raw || "Request failed";
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
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

export const api = {
    tasks: () => request<Task[]>("/api/tasks"),
    task: (id: string) => request<Task>(`/api/tasks/${id}`),
    jobs: () => request<TaskJob[]>("/api/jobs"),
    uploadTask(draft: TaskDraft, onProgress: (loaded: number, total: number) => void) {
        return new Promise<Task>((resolve, reject) => {
            const body = new FormData();
            body.append("name", draft.name);
            body.append("labels", JSON.stringify(draft.labels));
            body.append("image_quality", String(draft.imageQuality));
            body.append("segment_size", String(draft.segmentSize));
            body.append("files", draft.file, draft.file.name);
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/tasks/upload");
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) onProgress(event.loaded, event.total);
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText) as Task);
                else reject(new Error(errorText(xhr.responseText)));
            };
            xhr.onerror = () => reject(new Error("Upload failed"));
            xhr.send(body);
        });
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
