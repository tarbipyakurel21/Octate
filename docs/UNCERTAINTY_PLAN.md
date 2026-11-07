# Uncertainty quantification: future plans

Status: planned. Nothing in this document is implemented yet unless it says so.

Surgical video is long and mostly repetitive, so reviewers should spend their time on the frames where the models are most likely wrong. The aim is to give each model output an uncertainty estimate, combine those into a per-frame score, and use it to order review, mark the timeline, and decide what to send back for relabeling or retraining.

Every model result still needs human review. Uncertainty decides the order and emphasis of review, not whether review happens.

## Where things stand

- The detector in `model-server/local_models.py` returns a `confidence` per box. It is a heuristic from the shape's aspect ratio and border contact, not a calibrated probability.
- The segmenter and tracker return no confidence at all.
- The job editor (`frontend/src/screens/AnnotatePage.tsx`) uses detector results to create shapes with `source: "auto"`, but it drops `confidence`. CVAT's annotation API has a `score` field on shapes that can store it.
- `frontend/src/lib/uncertainty/` exists but is empty. `Task.uncertain` in `frontend/src/types/index.ts` is always `0`.
- The legacy `app-server/` had a review queue with reasons such as "Low detection confidence". It is not part of the runtime, but its idea of attaching readable reasons to every flag carries over.

## Principles

1. **Explainable flags.** Every flag carries a short reason a reviewer can check by looking at the frame, for example "Detector confidence 0.41", "Box jumped 38% of its width between frames 120 and 121", or "Two models disagree on the label".
2. **Stored with the annotation.** Scores live in CVAT (`score` on shapes, attributes for reasons), so they survive export and reload and need no extra database.
3. **Calibrated before trusted.** A raw score is shown as a ranking signal until it has been calibrated against reviewed data. Thresholds come from data, not guesses.
4. **Cheap by default.** Signals that need extra model passes (ensembles, test-time augmentation) are opt-in per job, because they multiply inference cost on long videos.

## Signals

### Per prediction

| Signal | Applies to | Notes |
| --- | --- | --- |
| Model confidence | Detector | Already produced. Persist it as `score`. |
| Softmax entropy or margin | Detector, once it is a learned classifier | Margin between the top two labels catches "grasper or clip applier?" cases that plain confidence misses. |
| Mask boundary uncertainty | Segmenter | Per-pixel probability near 0.5 along the contour. Summarize as the fraction of uncertain boundary pixels. |
| Tracker match quality | Tracker | Template-match or feature-match score per frame. A sharp drop usually means occlusion or a lost track. |
| Test-time augmentation spread | All, opt-in | Run on flipped or brightness-shifted frames and measure box or mask IoU across runs. |
| Ensemble or MC-dropout disagreement | Learned models, opt-in | Variance across members. Most reliable estimate, highest cost. |

### Across frames

| Signal | Notes |
| --- | --- |
| Temporal jump | Box center or size changes by more than a fraction of its size between adjacent frames. |
| Label flicker | The same track changes label across frames. |
| Track gaps | A tracked instrument disappears and reappears within a short window. |
| Interpolation drift | For CVAT tracks, compare the interpolated shape with a fresh detection on frames between keyframes. Large IoU loss suggests a missing keyframe. |

### Across sources

| Signal | Notes |
| --- | --- |
| Detector vs tracker disagreement | Low IoU between the tracked box and the detected box on the same frame. |
| Model vs human | After review, the edit distance between the model's shape and the accepted shape. This is the ground truth used for calibration. |

## Frame score

Each frame gets a score in \([0, 1]\) and a list of reasons. A first version takes the maximum of the normalized signals, so one strong reason is enough to flag a frame:

\[
u_{\text{frame}} = \max_i \; w_i \cdot \hat{s}_i
\]

where \(\hat{s}_i\) is signal \(i\) normalized to \([0, 1]\) and \(w_i\) is a per-signal weight. Maximum beats a weighted sum here because it keeps the reason obvious. Later versions can learn the combination from reviewed data, for example a logistic model that predicts "reviewer changed this shape".

## Calibration

1. Collect reviewed jobs where each auto shape is marked accepted, edited, or deleted.
2. Fit temperature scaling or isotonic regression per model so that a score of 0.7 means about 70% of such shapes are accepted unchanged.
3. Report expected calibration error and a reliability diagram per model release, and keep the calibration parameters next to the model in `model-server/`.
4. Recalibrate when the model, the camera setup, or the procedure type changes.

## Product changes

### Job editor

- Keep `confidence` from the detector and save it as `score` (`AnnotatePage.tsx`, `jobAnnotations.ts`).
- Show the score and reasons in the objects list and color low-confidence shapes differently on the canvas.
- Mark uncertain frames on the timeline in amber, alongside the existing keyframe marks.
- Add "next uncertain frame" and "previous uncertain frame" shortcuts.
- Accepting or editing an auto shape records the outcome, which feeds calibration.

### Task and job pages

- Fill in `Task.uncertain` with the count of flagged frames that have not been reviewed.
- Sort jobs by unreviewed uncertainty so the riskiest work comes first.

### Model gateway

- Return a `confidence` from the segmenter and tracker as well as the detector.
- Add an optional `uncertainty` block in responses: `{ score, reasons: [...], method }`, where `method` names the estimator (for example `"heuristic"`, `"tta"`, or `"ensemble"`).
- Add a batch endpoint that scores a frame range in the background, so a whole job can be ranked without opening every frame.

### Export

- Include scores and reasons in exports as CVAT attributes so downstream training can weight or filter examples.

## Active learning

Once flags and review outcomes are stored, the same scores can choose what to label next:

- Pick frames for annotation by highest uncertainty, with a diversity term so the batch is not 50 adjacent frames from one occlusion.
- Track how much each retraining round reduces reviewer edits on flagged frames.

## Phases

1. **Persist what exists.** Save detector confidence as `score`, show it in the editor, and mark low-confidence frames on the timeline. No new models.
2. **Temporal signals.** Compute jumps, label flicker, gaps, and interpolation drift in the frontend from job annotations. Add the frame score and "next uncertain frame".
3. **Review outcomes.** Record accept, edit, or delete for auto shapes, and fill `Task.uncertain`.
4. **Calibration.** Fit and publish per-model calibration from reviewed jobs. Replace fixed thresholds.
5. **Stronger estimators.** Opt-in test-time augmentation and ensembles in the model gateway, plus the batch scoring endpoint.
6. **Active learning.** Use scores to choose frames for labeling and retraining.

## Open questions

- Which reviewer action counts as "the model was wrong": any edit, or only edits above an IoU threshold?
- Should flags be per frame, per object, or per track segment? The editor is frame-based, but tracks span many frames.
- How should uncertainty be shown to annotators without anchoring them on the model's answer?
- What review coverage is acceptable for unflagged frames, for example a random audit sample to catch confident errors?
