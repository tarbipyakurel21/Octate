import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { confirmTaskDeletion } from "../screens/TasksPage";

afterEach(() => vi.restoreAllMocks());

describe("task deletion", () => {
    it("deletes through the CVAT task endpoint", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
        await api.deleteTask("42");
        expect(fetchMock).toHaveBeenCalledWith("/api/tasks/42", expect.objectContaining({ method: "DELETE", credentials: "same-origin" }));
    });

    it("does not request deletion when confirmation is cancelled", async () => {
        const deleteTask = vi.fn().mockResolvedValue(undefined);
        expect(await confirmTaskDeletion(false, "42", deleteTask)).toBe(false);
        expect(deleteTask).not.toHaveBeenCalled();
    });

    it("surfaces the actual API error", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "Task is locked" }), { status: 403 }));
        await expect(api.deleteTask("42")).rejects.toThrow("Task is locked");
    });
});
