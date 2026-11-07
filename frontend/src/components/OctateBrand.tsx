export function OctateBrand({ compact = false }: { compact?: boolean }) {
    return (
        <span className={`octate-brand ${compact ? "compact" : ""}`}>
            <img src="/OctoLabel.png" alt="" aria-hidden="true" />
            <span className="octate-wordmark"><b>Oc</b><b>tate</b></span>
        </span>
    );
}
