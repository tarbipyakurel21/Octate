# OCTATE — Future AI Integration Architecture

**Document Version:** 1.0  
**Date:** November 2026  
**Product:** Octate — AI-Assisted Surgical Video Annotation Platform  

---

## 1. Executive Summary & Design Principles

Once Octate's core video annotation engine is stabilized, AI capabilities will be integrated to assist clinicians and annotators in labeling complex surgical procedures (e.g., laparoscopic cholecystectomy, robotic prostatectomy).

### Core Integration Principles:
1. **Zero Editor Rewrites:** AI capabilities must hook into CVAT's established extension points (the `interactor`, `detector`, and `tracker` interfaces) without modifying [`cvat-canvas`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-canvas) or [`cvat-core`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-core).
2. **Local-First & CPU Execution:** All baseline models must execute smoothly on local CPU / Apple Silicon (ARM64) without requiring enterprise cloud GPUs or paid external APIs.
3. **Human-in-the-Loop Supremacy:** AI models generate draft hypotheses (proposals); human annotators retain full control to adjust, verify, or reject annotations.
4. **Uncertainty-Aware Review:** Low-confidence predictions and tracking discontinuities are systematically flagged for human audit.

---

## 2. The Three Architectural AI Extension Points

CVAT natively defines three distinct AI function paradigms via its `lambda_manager` subsystem ([`cvat/apps/lambda_manager/`](file:///Users/tarbipyakurel/Developer/biolabel/cvat/apps/lambda_manager/)). Octate emulates this protocol via a lightweight microserver on port `8070`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OCTATE AI INTEGRATION PARADIGMS                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. INTERACTOR (Magic Wand)                                                  │
│    - Endpoint: POST /api/functions/facebook-sam2-hiera-tiny                │
│    - Input: Base64 frame + click points [{x, y, positive: true/false}]     │
│    - Output: Sub-second polygon contour or RLE binary mask                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. DETECTOR (Auto-Labeling)                                                 │
│    - Endpoint: POST /api/functions/octate-yolov8n-detector                 │
│    - Input: Base64 frame                                                    │
│    - Output: List of detected bounding boxes + labels + confidence scores   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. TRACKER (Multi-Frame Propagation)                                        │
│    - Endpoint: POST /api/functions/octate-cpu-tracker                       │
│    - Input: Current frame + Initial bounding box + Previous state           │
│    - Output: Updated bounding box coordinates on subsequent frames          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Surgical AI Capabilities & Roadmap

---

### Capability A: AI-Assisted Surgical Instrument Detection
* **Model Class:** Compact Object Detection (YOLOv8 Nano, YOLOv11 Nano, or RT-DETR).
* **Clinical Purpose:** Automatically detects laparoscopic and robotic instruments:
  - Graspers (Maryland, fenestrated, atraumatic)
  - Energy devices (Monopolar hook, harmonic scalpel, bipolar forceps)
  - Scissors and needle drivers
  - Clips and suction-irrigation tools
* **Integration Interface:** Registered as a `detector` in `/api/functions`.
* **Execution Flow:**
  - Annotator selects **AI Assistance** → **Auto-labeling**.
  - Sets frame range (e.g. `0` to `500`).
  - Worker passes frames sequentially to `http://host.docker.internal:8070`.
  - Predictions are mapped to project labels via CVAT's "From model" label alignment.

---

### Capability B: Segment Anything Mask Generation (SAM 2 on CPU)
* **Model Class:** Meta SAM 2 Hiera-Tiny (`facebook/sam2-hiera-tiny`) or TinySAM.
* **Clinical Purpose:** Delineates anatomical structures with pixel-level precision:
  - Gallbladder, liver bed, cystic duct, cystic artery (Calot's triangle)
  - Critical blood vessels, surgical margins, and surgical gauze/sponges
* **Integration Interface:** Registered as an `interactor` in `/api/functions`.
* **Execution Flow:**
  - Annotator selects **AI Assistance** → **Prompting** (Magic Wand icon).
  - Left-clicks on target organ (positive prompt) or right-clicks outside (negative prompt).
  - SAM 2 returns polygon vertices within `< 300 ms` on CPU.
  - Annotator presses `N` or clicks `Done` to commit the mask.

---

### Capability C: Video Object Tracking vs. Interpolation
* **The Distinction:**
  - **Native Interpolation:** Only connects two static user-drawn boxes linearly across frames. It fails during complex camera shifts, tissue retraction, or non-linear tool movements.
  - **AI Video Object Tracker:** Ingests visual feature maps across frames to actively follow the tool through occlusions, rotation, and lighting changes.
* **Integration Interface:** Registered as a `tracker` in `/api/functions`.
* **Execution Flow:**
  - User draws an instrument bounding box on frame 0.
  - User switches to **AI Assistance** → **Tracking**.
  - Tracker tracks the tool forward across subsequent frames, generating keyframes whenever movement deviates from linearity.

---

### Capability D: Automated Annotation Propagation
* **Mechanism:** Combining SAM 2's memory-attention architecture with video frame sequences.
* **Workflow:**
  1. Clinician masks an organ on frame $F_0$.
  2. Model propagates mask forward across frames $F_1, F_2, \dots, F_{30}$ using temporal attention features.
  3. Clinician scrubs through the timeline to review propagated masks.

---

### Capability E: Uncertainty-Aware Review Queues & Quality Control
* **Purpose:** Prevents subtle labeling errors by directing human attention to frames where AI confidence is lowest.
* **Metrics:**
  - **Prediction Entropy / Confidence Threshold:** Flags frames where instrument detection confidence drops below a threshold (e.g. $< 0.45$).
  - **Bounding Box Jump / Velocity Discontinuity:** Detects sudden spatial jumps ($> 50\text{ px}$ in 1 frame) indicating tracking drift or visual loss.
  - **Shape Deformation Anomaly:** Flags unexpected polygon area shifts ($> 40\%$ change between adjacent frames).
* **UI Integration:**
  - In [`player-navigation.tsx`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-ui/src/components/annotation-page/top-bar/player-navigation.tsx), uncertainty flags appear as amber/red markers along the video scrubber bar.
  - Clicking a warning marker jumps the playhead directly to the suspect frame for immediate clinician review and correction.

---

## 4. API Protocol & Emulation Contract

Octate AI services communicate with CVAT's native `lambda_manager` via a REST API protocol mimicking Nuclio serverless:

### 1. Function Discovery (`GET /api/functions`)
Returns available models with metadata, input specifications, and capabilities:

```json
{
  "octate-yolov8n-detector": {
    "metadata": {
      "name": "octate-yolov8n-detector",
      "annotations": {
        "name": "Octate YOLOv8 Nano (CPU Detector)",
        "type": "detector",
        "spec": "[{\"id\": 0, \"name\": \"instrument\", \"type\": \"rectangle\"}]"
      }
    },
    "spec": { "runtime": "python:3.11", "handler": "main:handler" },
    "status": { "state": "ready", "httpPort": 8070 }
  }
}
```

### 2. Interactive Inference (`POST /api/functions/{id}`)
Payload for interactive segmentation (`interactor`):
```json
{
  "image": "<base64_encoded_jpeg>",
  "pos_points": [[240, 180]],
  "neg_points": [[210, 150]]
}
```

Response:
```json
{
  "points": [220, 160, 260, 160, 260, 200, 220, 200],
  "mask": null
}
```

### 3. Tracking Inference (`POST /api/functions/{id}`)
Payload for video tracking (`tracker`):
```json
{
  "image": "<base64_encoded_jpeg>",
  "shapes": [{"type": "rectangle", "points": [100, 120, 250, 310]}],
  "states": []
}
```

Response:
```json
{
  "shapes": [{"type": "rectangle", "points": [104, 122, 254, 312]}],
  "state": "..."
}
```

---

## 5. Implementation Roadmap

```mermaid
flowchart LR
    Phase1["Phase 1: Architecture Audit (Complete)"] --> Phase2["Phase 2: Minimal Docker Deployment"]
    Phase2 --> Phase3["Phase 3: 3-Section UI Simplification"]
    Phase3 --> Phase4["Phase 4: AI Model Server Productionization"]
    Phase4 --> Phase5["Phase 5: Uncertainty Review Queues"]
```

By decoupling model inference through the standard `/api/functions` endpoint, Octate can upgrade, replace, or fine-tune surgical models (e.g. training on Cholec80 or HeiSurv) with zero changes to CVAT's core annotation canvas.
