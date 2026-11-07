# OCTATE — Application Simplification Plan

**Document Version:** 1.0  
**Date:** November 2026  
**Product:** Octate — AI-Assisted Surgical Video Annotation Platform  

---

## 1. User Experience Design: The 3-Section Octate Interface

Octate simplifies CVAT's enterprise dataset hierarchy (Organizations → Projects → Tasks → Jobs → Segments) into a straightforward, video-first application structured around three primary user views:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  OCTATE (Logo)       [ 1. Videos ]       [ 2. Annotate ]       [ 3. Export ]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### Section 1: Videos (`/videos`)
The landing dashboard for managing local surgical video files.

* **Capabilities:**
  - **Upload Local MP4 Videos:** Drag-and-drop or file picker for local surgical recordings.
  - **Video Gallery / List:** Displays video thumbnail, filename, duration, frame count, resolution, and annotation progress (e.g. "340 frames, 12 tracks").
  - **Processing Status:** Shows real-time ingestion status (Uploading → Decoding → Ready) using background request polling.
  - **One-Click "Open Annotation":** Directly opens the video in the annotation editor without requiring the user to navigate through Tasks and Jobs.
  - **Delete Video:** Deletes the video, chunks, and associated annotations from local storage and PostgreSQL.

---

### Section 2: Annotate (`/annotate/:job_id`)
Preserves CVAT's mature, full-featured annotation workspace with zero regression:

* **Capabilities:**
  - **Video Viewer & Canvas:** Hardware-accelerated frame playback with pan/zoom.
  - **Frame Timeline:** High-precision frame scrubber, play/pause, step forward/backward (1, 10 frames), keyframe indicators.
  - **Annotation Tools:** Bounding boxes, polygons, polylines, points, ellipses, and skeletons.
  - **Mask & Pixel Brush Editing:** Brush, eraser, polygon-to-mask conversion, offscreen canvas rasterization, and RLE mask export.
  - **Object Tracks & Keyframe Interpolation:** Multi-frame object continuity with native linear interpolation across keyframes.
  - **Layers & Object Sidebar:** Reorderable layer stack, lock/hide visibility, color assignment, and per-object attribute editing.
  - **Label Management:** Add/edit surgical labels (e.g. `grasper`, `scalpel`, `scissors`, `vessel`, `needle_driver`).
  - **Undo / Redo:** Instant multi-step undo/redo stack (`MAX_HISTORY_LENGTH = 32`).
  - **Save:** Direct atomic persistence to backend (`Ctrl+S` or top-bar Save button).

---

### Section 3: Export (`/export/:task_id`)
Focused dataset export interface:

* **Capabilities:**
  - Select format from standard computer vision formats:
    - **CVAT for Video 1.1** (lossless XML with tracks, keyframes, interpolation attributes)
    - **YOLO 1.1** (normalized bounding box annotations per frame)
    - **COCO 1.0** (standard object detection / instance segmentation JSON)
    - **Segmentation Mask 1.1** (PNG bitmasks per frame)
    - **Datumaro** (universal exchange format)
  - Options: Export annotations only (lightweight ZIP) or include extracted frames.
  - Background generation with progress spinner and one-click ZIP download.

---

## 2. Abstraction Automation Strategy

### Transparent Task and Job Management
In upstream CVAT, a user must:
1. (Optional) Create a Project.
2. Create a Task inside the project.
3. Configure Overlap, Segment Size, and Image Quality.
4. Wait for task initialization.
5. Click into the Task details page.
6. Click into "Job #1".

### The Octate Automation Layer:
In Octate, the concept of "Projects", "Tasks", and "Jobs" is completely automated behind the scenes:
1. When a user uploads a video `laparoscopy_cholecystectomy.mp4`:
   - Frontend calls `POST /api/tasks` with:
     ```json
     {
       "name": "laparoscopy_cholecystectomy.mp4",
       "mode": "interpolation",
       "segment_size": 100000,
       "overlap": 0,
       "labels": [{"name": "instrument"}]
     }
     ```
   - Frontend streams the MP4 file via TUS to `/api/tasks/{id}/data`.
   - Backend creates `Task`, `Data`, `Segment`, and single `Job` (ID: `JID`).
2. When the user clicks on the video card:
   - Frontend immediately routes to `/tasks/{task_id}/jobs/{job_id}` (aliased as `/annotate/{job_id}`).
   - The user is placed directly inside the annotation editor within 1 click.

---

## 3. UI Simplification & Hiding Strategy

To streamline navigation without breaking internal API expectations, components are **hidden or disabled in the frontend shell** rather than deleted from the database:

### Header Navigation Simplification ([`cvat-ui/src/components/header/header.tsx`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-ui/src/components/header/header.tsx))
- **Hide:**
  - `Projects` button
  - `Jobs` button
  - `Cloud Storages` button
  - `Requests` button
  - `Analytics` button
  - Organization switcher dropdown
- **Retain / Add:**
  - Octate Logo & Mascot
  - `Videos` link (replaces Tasks)
  - `Models` link (AI assistance status)
  - User profile / Settings

### App Router Simplification ([`cvat-ui/src/components/cvat-app.tsx`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-ui/src/components/cvat-app.tsx))
- Default redirect `/` points to `/tasks` (styled as `/videos`).
- `/tasks/:tid/jobs/:jid` preserved as the primary annotation workspace.

---

## 4. Component Action Table

| Component | Current Purpose | Core Dependency | Action | Risk | Verification Test |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`cvat-canvas`** | HTML5/SVG canvas | None | **KEEP** | Low | Draw, edit, and manipulate shapes; verify zero visual regression. |
| **`cvat-data`** | Wasm frame decoding | WebWorkers | **KEEP** | Low | Scrub video forward/backward; verify smooth frame rendering. |
| **`cvat-core`** | State, tracks, saver | REST API | **KEEP** | Low | Add tracks, keyframe positions; verify `PUT/PATCH` persistence. |
| **`annotation-page`**| Editor workspace | `cvat-canvas` | **KEEP** | Low | Verify timeline navigation, toolbar actions, sidebar layer stack. |
| **`Projects UI`** | Multi-task grouping | `cvat-core` | **HIDE** | Low | Verify tasks function standalone without a parent project. |
| **`Cloud Storages UI`**| S3/GCS sync | Django API | **HIDE** | Low | Verify local video file uploads function without cloud storage. |
| **`Organizations UI`**| Multi-tenancy | Django IAM | **HIDE** | Low | Verify single-user and local team operation without org ID. |
| **`Requests UI`** | Async task monitor | `models.Request`| **HIDE** | Low | Verify exports and uploads track progress via embedded spinners. |
| **`Analytics UI`** | Grafana/ClickHouse | ClickHouse | **REMOVE** | Low | Verify UI loads cleanly with analytics plugins disabled. |
| **`Webhooks UI`** | Webhook triggers | Webhook worker | **HIDE** | Low | Verify all annotation and export workflows operate cleanly. |

---

## 5. Risk Assessment & Rollback Strategy

1. **Database Migration Safety:**
   - **Rule:** Never delete Django models or run destructive migrations for `Project`, `Organization`, or `CloudStorage`.
   - **Reason:** Upstream foreign keys and migration history must remain pristine.
   - **Mitigation:** Leave database schema untouched; simply pass `null` or default values from frontend.

2. **Frontend Rollback Safety:**
   - All navigation changes are controlled in [`cvat-ui/src/components/header/header.tsx`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-ui/src/components/header/header.tsx) and [`cvat-app.tsx`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-ui/src/components/cvat-app.tsx).
   - Any UI adjustment can be rolled back immediately via Git without database restoration.

3. **Incremental Verification Protocol:**
   - Every UI modification will be verified using the end-to-end test checklist: Upload → Frame Scrubbing → Annotation → Keyframe Interpolation → Save → Export.
