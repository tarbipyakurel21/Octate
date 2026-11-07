import { useMemo, useState } from "react";
import { getCombinedBoundingBox, type BoundingBox } from "../lib/canvas/jobAnnotations";
import type { CanvasObjectState } from "../types";

export type SelectedObjectMoverProps = {
    selectedStates: CanvasObjectState[];
    imageDimensions?: { width: number; height: number } | null;
    onMove: (dx: number, dy: number) => void;
    onUnlock?: (clientIDs: number[]) => void;
    onDeselect?: () => void;
};

const STEP_PRESETS = [1, 5, 10, 25, 50];

export function SelectedObjectMover({
    selectedStates,
    imageDimensions,
    onMove,
    onUnlock,
    onDeselect,
}: SelectedObjectMoverProps) {
    const [step, setStep] = useState<number>(10);
    const [customDeltaX, setCustomDeltaX] = useState<string>("0");
    const [customDeltaY, setCustomDeltaY] = useState<string>("0");
    const [lastMoved, setLastMoved] = useState<{ dx: number; dy: number } | null>(null);

    const count = selectedStates.length;
    const isSingle = count === 1;
    const singleState = isSingle ? selectedStates[0] : null;

    const lockedItems = useMemo(
        () => selectedStates.filter((s) => s.lock),
        [selectedStates],
    );
    const isLocked = lockedItems.length > 0;
    const allLocked = lockedItems.length === count && count > 0;

    const boundingBox: BoundingBox | null = useMemo(() => {
        if (!selectedStates.length) return null;
        return getCombinedBoundingBox(
            selectedStates.map((s) => ({ points: s.points, shapeType: s.shapeType })),
        );
    }, [selectedStates]);

    const handleNudge = (dx: number, dy: number) => {
        if (allLocked) return;
        onMove(dx, dy);
        setLastMoved({ dx, dy });
    };

    const handleApplyCustomDelta = () => {
        const dx = Number(customDeltaX) || 0;
        const dy = Number(customDeltaY) || 0;
        if (dx === 0 && dy === 0) return;
        handleNudge(dx, dy);
        setCustomDeltaX("0");
        setCustomDeltaY("0");
    };

    const handleCenterOnFrame = () => {
        if (!imageDimensions || !boundingBox || allLocked) return;
        const targetCenterX = imageDimensions.width / 2;
        const targetCenterY = imageDimensions.height / 2;
        const dx = Math.round(targetCenterX - boundingBox.centerX);
        const dy = Math.round(targetCenterY - boundingBox.centerY);
        if (dx === 0 && dy === 0) return;
        handleNudge(dx, dy);
    };

    if (count === 0) return null;

    return (
        <section className="anno-mover-card" aria-label="Selected Object Mover">
            <header className="anno-mover-header">
                <div className="anno-mover-title">
                    <span className="anno-mover-icon">✥</span>
                    <strong>Selected Object Mover</strong>
                </div>
                {onDeselect && (
                    <button
                        type="button"
                        className="anno-mover-close"
                        title="Deselect"
                        onClick={onDeselect}
                    >
                        ✕
                    </button>
                )}
            </header>

            {/* Selection info */}
            <div className="anno-mover-summary">
                {isSingle && singleState ? (
                    <div className="anno-mover-target">
                        <span
                            className="anno-mover-dot"
                            style={{ background: singleState.color || "#1890ff" }}
                        />
                        <span className="anno-mover-name" title={singleState.label?.name || "Object"}>
                            {singleState.label?.name || "Object"}
                        </span>
                        <span className="anno-mover-badge">{singleState.shapeType}</span>
                        {singleState.objectType === "track" && (
                            <span className="anno-mover-badge track">track</span>
                        )}
                    </div>
                ) : (
                    <div className="anno-mover-target">
                        <span className="anno-mover-count">{count}</span>
                        <span className="anno-mover-name">objects selected</span>
                    </div>
                )}

                {boundingBox && (
                    <div className="anno-mover-coords">
                        <span>X: <b>{boundingBox.minX}</b></span>
                        <span>Y: <b>{boundingBox.minY}</b></span>
                        <span>W: <b>{boundingBox.width}</b></span>
                        <span>H: <b>{boundingBox.height}</b></span>
                    </div>
                )}
            </div>

            {/* Lock warning */}
            {isLocked && (
                <div className="anno-mover-lock-alert">
                    <span>
                        🔒 {allLocked ? "Selected object is locked." : `${lockedItems.length} selected object(s) locked.`}
                    </span>
                    {onUnlock && (
                        <button
                            type="button"
                            className="anno-mover-unlock-btn"
                            onClick={() => onUnlock(lockedItems.map((s) => s.clientID))}
                        >
                            Unlock
                        </button>
                    )}
                </div>
            )}

            {/* Step size selector */}
            <div className="anno-mover-section">
                <label className="anno-mover-label">Step Size</label>
                <div className="anno-mover-steps">
                    {STEP_PRESETS.map((val) => (
                        <button
                            key={val}
                            type="button"
                            className={`anno-step-chip ${step === val ? "active" : ""}`}
                            onClick={() => setStep(val)}
                        >
                            {val}px
                        </button>
                    ))}
                    <div className="anno-step-custom">
                        <input
                            type="number"
                            min="1"
                            max="500"
                            value={step}
                            onChange={(e) => setStep(Math.max(1, Number(e.target.value) || 1))}
                            title="Custom step size in pixels"
                        />
                        <span>px</span>
                    </div>
                </div>
            </div>

            {/* Directional D-Pad */}
            <div className="anno-mover-dpad-container">
                <label className="anno-mover-label">Directional Nudge</label>
                <div className="anno-mover-dpad" role="group" aria-label="Nudge object">
                    {/* Top row */}
                    <button
                        type="button"
                        className="dpad-btn diagonal"
                        title={`Up-Left (${step}px)`}
                        disabled={allLocked}
                        onClick={() => handleNudge(-step, -step)}
                    >
                        ↖
                    </button>
                    <button
                        type="button"
                        className="dpad-btn cardinal up"
                        title={`Up (${step}px)`}
                        disabled={allLocked}
                        onClick={() => handleNudge(0, -step)}
                    >
                        ▲
                    </button>
                    <button
                        type="button"
                        className="dpad-btn diagonal"
                        title={`Up-Right (${step}px)`}
                        disabled={allLocked}
                        onClick={() => handleNudge(step, -step)}
                    >
                        ↗
                    </button>

                    {/* Middle row */}
                    <button
                        type="button"
                        className="dpad-btn cardinal left"
                        title={`Left (${step}px)`}
                        disabled={allLocked}
                        onClick={() => handleNudge(-step, 0)}
                    >
                        ◀
                    </button>
                    <button
                        type="button"
                        className="dpad-btn center"
                        title={imageDimensions ? "Center on canvas frame" : "Center"}
                        disabled={allLocked || !imageDimensions}
                        onClick={handleCenterOnFrame}
                    >
                        ◎
                    </button>
                    <button
                        type="button"
                        className="dpad-btn cardinal right"
                        title={`Right (${step}px)`}
                        disabled={allLocked}
                        onClick={() => handleNudge(step, 0)}
                    >
                        ▶
                    </button>

                    {/* Bottom row */}
                    <button
                        type="button"
                        className="dpad-btn diagonal"
                        title={`Down-Left (${step}px)`}
                        disabled={allLocked}
                        onClick={() => handleNudge(-step, step)}
                    >
                        ↙
                    </button>
                    <button
                        type="button"
                        className="dpad-btn cardinal down"
                        title={`Down (${step}px)`}
                        disabled={allLocked}
                        onClick={() => handleNudge(0, step)}
                    >
                        ▼
                    </button>
                    <button
                        type="button"
                        className="dpad-btn diagonal"
                        title={`Down-Right (${step}px)`}
                        disabled={allLocked}
                        onClick={() => handleNudge(step, step)}
                    >
                        ↘
                    </button>
                </div>
            </div>

            {/* Custom Delta Inputs */}
            <div className="anno-mover-section">
                <label className="anno-mover-label">Precise Delta Offset</label>
                <div className="anno-mover-delta-row">
                    <label className="delta-field">
                        <span>ΔX</span>
                        <input
                            type="number"
                            value={customDeltaX}
                            onChange={(e) => setCustomDeltaX(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleApplyCustomDelta();
                            }}
                            placeholder="0"
                        />
                    </label>
                    <label className="delta-field">
                        <span>ΔY</span>
                        <input
                            type="number"
                            value={customDeltaY}
                            onChange={(e) => setCustomDeltaY(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleApplyCustomDelta();
                            }}
                            placeholder="0"
                        />
                    </label>
                    <button
                        type="button"
                        className="anno-mover-apply-btn"
                        disabled={allLocked || (Number(customDeltaX) === 0 && Number(customDeltaY) === 0)}
                        onClick={handleApplyCustomDelta}
                    >
                        Move
                    </button>
                </div>
            </div>

            {/* Quick Action Footer & Hints */}
            <footer className="anno-mover-footer">
                {imageDimensions && (
                    <button
                        type="button"
                        className="anno-mover-action-btn"
                        disabled={allLocked}
                        onClick={handleCenterOnFrame}
                        title="Move object to the exact center of the video frame"
                    >
                        Center in Frame
                    </button>
                )}
                {lastMoved && (
                    <div className="anno-mover-last">
                        Last: {lastMoved.dx >= 0 ? `+${lastMoved.dx}` : lastMoved.dx}px X, {lastMoved.dy >= 0 ? `+${lastMoved.dy}` : lastMoved.dy}px Y
                    </div>
                )}
                <div className="anno-mover-hint">
                    <small>⌨️ Arrow keys nudge (Shift for 10×)</small>
                    <small>🖱️ Drag directly on canvas to reposition</small>
                </div>
            </footer>
        </section>
    );
}
