import { useEffect, useMemo, useRef, useState } from "react";
import {
    Activity,
    Box,
    Check,
    ChevronRight,
    CircleDot,
    MousePointer2,
    Play,
    Sparkles,
    Upload,
    Waypoints,
    X,
} from "lucide-react";
import { api } from "./lib/api";
import type {
    Annotation,
    Point,
    Project,
    ReviewItem,
    ShapeType,
} from "./types";
type Screen = "landing" | "projects" | "annotate" | "review";
type Tool = "select" | ShapeType;
const fallback: Project = {
    id: "demo",
    name: "Laparoscopic instrument study",
    videoName: "synthetic_cholecystectomy.mp4",
    status: "ready",
    frames: 240,
    fps: 24,
    uncertain: 3,
    updatedAt: "Just now",
};
const seed: Annotation[] = [
    {
        id: "a1",
        frame: 42,
        label: "Grasper",
        type: "rectangle",
        points: [
            { x: 23, y: 27 },
            { x: 49, y: 62 },
        ],
        confidence: 0.92,
        approved: true,
        trackId: "t1",
        keyframe: true,
    },
    {
        id: "a2",
        frame: 42,
        label: "Dissector",
        type: "polygon",
        points: [
            { x: 58, y: 21 },
            { x: 76, y: 40 },
            { x: 70, y: 68 },
            { x: 55, y: 54 },
        ],
        confidence: 0.61,
        approved: false,
    },
];
function Header({
    screen,
    setScreen,
    pending,
}: {
    screen: Screen;
    setScreen: (s: Screen) => void;
    pending: number;
}) {
    return (
        <header>
            <button
                className="brand"
                aria-label="Octate home"
                onClick={() => setScreen("landing")}
            >
                <img className="brand-logo" src="/OctoLabel.png" alt="Octate logo" />
                <span className="brand-wordmark">
                    <span>Oc</span>
                    <span>tate</span>
                </span>
            </button>
            {(screen === "landing" || screen === "projects") && (
                <nav className="landing-nav">
                    <button
                        className={screen === "landing" ? "active" : ""}
                        onClick={() => setScreen("landing")}
                    >
                        About
                    </button>
                    <a href="https://github.com/tarbipyakurel21/Octate" target="_blank" rel="noreferrer">
                        GitHub
                    </a>
                    <button
                        className={screen === "projects" ? "active" : ""}
                        onClick={() => setScreen("projects")}
                    >
                        Projects
                    </button>
                </nav>
            )}
            {screen !== "landing" && screen !== "projects" && <nav>
                {(["projects", "annotate", "review"] as Screen[]).map(
                    (s, i) => (
                        <button
                            key={s}
                            className={screen === s ? "active" : ""}
                            onClick={() => setScreen(s)}
                        >
                            {s === "annotate"
                                ? "Annotate"
                                : s[0].toUpperCase() + s.slice(1)}
                            {s === "review" && pending > 0 && <b>{pending}</b>}
                        </button>
                    ),
                )}
            </nav>}
            {screen !== "landing" && <div className="user">
                TA <span>Annotator</span>
            </div>}
        </header>
    );
}
function Landing({
    projects,
    onOpen,
    onUpload,
}: {
    projects: Project[];
    onOpen: (p: Project) => void;
    onUpload: () => void;
}) {
    return (
        <main className="landing">
            <section className="landing-hero">
                <h1>Turn surgical video into <em>trusted annotation.</em></h1>
                <p>
                    Octate brings video preparation, AI-assisted labeling, and
                    human review into one focused workspace for surgical data.
                </p>
                <button className="primary landing-action" onClick={onUpload}>
                    Upload surgical video <Upload />
                </button>
            </section>
            <section className="landing-principles">
                <article><strong>01</strong><h2>Prepare</h2><p>Upload surgical video folders and extract frame-level data.</p></article>
                <article><strong>02</strong><h2>Assist</h2><p>Use detection, segmentation, and tracking models to accelerate labeling.</p></article>
                <article><strong>03</strong><h2>Review</h2><p>Keep human judgment at the center of every annotation.</p></article>
            </section>
            <section className="overview-projects">
                <div className="overview-projects-heading">
                    <div>
                        <div className="eyebrow">YOUR WORKSPACE</div>
                        <h2>Projects</h2>
                    </div>
                    <button className="secondary-action" onClick={onUpload}>
                        <Upload /> New project
                    </button>
                </div>
                <div className="overview-project-grid">
                    {projects.map((project) => (
                        <button
                            className="overview-project-card"
                            key={project.id}
                            onClick={() => onOpen(project)}
                        >
                            <span className="overview-project-status">
                                {project.status === "processing"
                                    ? "PROCESSING"
                                    : "READY"}
                            </span>
                            <strong>{project.name}</strong>
                            <small>
                                {project.videoName} · {project.frames} frames
                            </small>
                            <ChevronRight />
                        </button>
                    ))}
                </div>
            </section>
            <p className="landing-note">For synthetic or properly de-identified data only · Not for clinical use</p>
        </main>
    );
}
function Projects({
    projects,
    onOpen,
    onUpload,
}: {
    projects: Project[];
    onOpen: (p: Project) => void;
    onUpload: () => void;
}) {
    return (
        <main className="page">
            <div className="eyebrow">WORKSPACE / PROJECTS</div>
            <section className="page-title">
                <div>
                    <h1>Surgical video projects</h1>
                    <p>
                        Upload surgical videos and Octate will extract their frames
                        with FFmpeg.
                    </p>
                </div>
                <button className="primary" onClick={onUpload}>
                    <Upload />
                    Upload videos
                </button>
            </section>
            <div className="stats">
                <article>
                    <small>ACTIVE PROJECTS</small>
                    <strong>{projects.length}</strong>
                    <span>
                        <Activity /> Local prototype
                    </span>
                </article>
                <article>
                    <small>FRAMES ANNOTATED</small>
                    <strong>142</strong>
                    <span>
                        <Check /> 86% approved
                    </span>
                </article>
                <article className="attention">
                    <small>NEEDS ATTENTION</small>
                    <strong>
                        {projects.reduce((n, p) => n + p.uncertain, 0)}
                    </strong>
                    <span>
                        <CircleDot /> Uncertain frames
                    </span>
                </article>
            </div>
            <section className="project-list">
                <div className="section-head">
                    <h2>Recent projects</h2>
                    <span>
                        {projects.length} video
                        {projects.length !== 1 ? "s" : ""}
                    </span>
                </div>
                {projects.map((p) => (
                    <button
                        className="project"
                        key={p.id}
                        onClick={() => onOpen(p)}
                    >
                        <div className="thumb">
                            <div className="scope" />
                            <Play />
                        </div>
                        <div className="project-info">
                            <div>
                                <i>
                                    {p.status === "processing"
                                        ? "PROCESSING FRAMES"
                                        : "READY TO ANNOTATE"}
                                </i>
                                <h3>{p.name}</h3>
                                <p>
                                    {p.videoName} · {p.frames} frames · {p.fps}{" "}
                                    fps
                                </p>
                            </div>
                            <div className="project-progress">
                                <span>
                                    <b>{p.uncertain}</b> uncertain frames
                                </span>
                                <div>
                                    <i style={{ width: "64%" }} />
                                </div>
                                <small>64% reviewed</small>
                            </div>
                            <ChevronRight />
                        </div>
                    </button>
                ))}
            </section>
            <p className="safety">
                For synthetic or properly de-identified data only · Not for
                clinical use
            </p>
        </main>
    );
}
function Canvas({
    frame,
    annotations,
    tool,
    onAdd,
    onSelect,
    selected,
    frameUrl,
}: {
    frame: number;
    annotations: Annotation[];
    tool: Tool;
    onAdd: (a: Annotation) => void;
    onSelect: (id: string) => void;
    selected: string | null;
    frameUrl?: string;
}) {
    const box = useRef<SVGSVGElement>(null);
    const [start, setStart] = useState<Point | null>(null);
    const [poly, setPoly] = useState<Point[]>([]);
    const visible = annotations.filter((a) => a.frame === frame);
    const pos = (e: React.PointerEvent) => {
        const r = box.current!.getBoundingClientRect();
        return {
            x: ((e.clientX - r.left) / r.width) * 100,
            y: ((e.clientY - r.top) / r.height) * 100,
        };
    };
    const down = (e: React.PointerEvent) => {
        if (tool === "rectangle") setStart(pos(e));
        else if (tool === "polygon") {
            const p = pos(e);
            if (
                poly.length >= 2 &&
                Math.hypot(p.x - poly[0].x, p.y - poly[0].y) < 4
            ) {
                onAdd({
                    id: crypto.randomUUID(),
                    frame,
                    label: "Surgical instrument",
                    type: "polygon",
                    points: poly,
                    confidence: 1,
                    approved: false,
                    keyframe: true,
                });
                setPoly([]);
            } else setPoly([...poly, p]);
        }
    };
    const up = (e: React.PointerEvent) => {
        if (tool === "rectangle" && start) {
            const end = pos(e);
            if (Math.abs(end.x - start.x) > 2)
                onAdd({
                    id: crypto.randomUUID(),
                    frame,
                    label: "Surgical instrument",
                    type: "rectangle",
                    points: [start, end],
                    confidence: 1,
                    approved: false,
                    keyframe: true,
                });
            setStart(null);
        }
    };
    return (
        <svg
            ref={box}
            className={`canvas tool-${tool}`}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            onPointerDown={down}
            onPointerUp={up}
        >
            <defs>
                <radialGradient id="surgery">
                    <stop stopColor="#715647" />
                    <stop offset=".55" stopColor="#341d23" />
                    <stop offset="1" stopColor="#090c0d" />
                </radialGradient>
                <filter id="noise">
                    <feTurbulence
                        baseFrequency=".4"
                        numOctaves="3"
                        seed="7"
                        type="fractalNoise"
                        result="n"
                    />
                    <feBlend in="SourceGraphic" in2="n" mode="soft-light" />
                </filter>
            </defs>
            <rect width="100" height="100" fill="url(#surgery)" />
            {frameUrl && (
                <image
                    href={frameUrl}
                    x="0"
                    y="0"
                    width="100"
                    height="100"
                    preserveAspectRatio="none"
                />
            )}
            <ellipse
                cx="50"
                cy="48"
                rx="39"
                ry="35"
                fill="#5f3a36"
                opacity=".7"
                filter="url(#noise)"
            />
            <path
                d="M2 72 Q35 48 59 74 T101 55"
                fill="none"
                stroke="#997063"
                strokeWidth="12"
                opacity=".45"
            />
            <path d="M0 28 L44 46" stroke="#a7ac9e" strokeWidth="3" />
            <path d="M100 20 L66 53" stroke="#b6b9ad" strokeWidth="2.4" />
            {visible.map((a) =>
                a.type === "rectangle" ? (
                    <rect
                        key={a.id}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            onSelect(a.id);
                        }}
                        x={Math.min(a.points[0].x, a.points[1].x)}
                        y={Math.min(a.points[0].y, a.points[1].y)}
                        width={Math.abs(a.points[1].x - a.points[0].x)}
                        height={Math.abs(a.points[1].y - a.points[0].y)}
                        fill="rgba(39,211,174,.08)"
                        stroke={selected === a.id ? "#fff" : "#27d3ae"}
                        strokeWidth={selected === a.id ? ".8" : ".45"}
                    />
                ) : (
                    <polygon
                        key={a.id}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            onSelect(a.id);
                        }}
                        points={a.points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="rgba(245,170,59,.12)"
                        stroke={selected === a.id ? "#fff" : "#f5aa3b"}
                        strokeWidth={selected === a.id ? ".8" : ".45"}
                    />
                ),
            )}
            {poly.length > 0 && (
                <polyline
                    points={poly.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke="#fff"
                    strokeWidth=".5"
                    strokeDasharray="2 1"
                />
            )}
        </svg>
    );
}
function Annotate({
    project,
    annotations,
    setAnnotations,
    onReview,
}: {
    project: Project;
    annotations: Annotation[];
    setAnnotations: (a: Annotation[]) => void;
    onReview: () => void;
}) {
    const [frame, setFrame] = useState(42);
    const [tool, setTool] = useState<Tool>("select");
    const [selected, setSelected] = useState<string | null>("a2");
    const [saving, setSaving] = useState(false);
    const [action, setAction] = useState("");
    const current = annotations.filter((a) => a.frame === frame);
    const selectedAnn = annotations.find((a) => a.id === selected);
    const add = (a: Annotation) => {
        setAnnotations([...annotations, a]);
        setSelected(a.id);
        setTool("select");
    };
    const run = async (kind: "detect" | "segment" | "track") => {
        setAction(kind);
        try {
            const r = await api.infer(kind, project.id, frame);
            setAnnotations([...annotations, ...r.annotations]);
        } catch {
            const offset = kind === "track" ? 6 : 0;
            add({
                id: crypto.randomUUID(),
                frame: frame + offset,
                label: kind === "segment" ? "Tissue boundary" : "Clip applier",
                type: kind === "segment" ? "polygon" : "rectangle",
                points:
                    kind === "segment"
                        ? [
                              { x: 32, y: 35 },
                              { x: 51, y: 27 },
                              { x: 62, y: 48 },
                              { x: 45, y: 61 },
                          ]
                        : [
                              { x: 35, y: 24 },
                              { x: 59, y: 57 },
                          ],
                confidence: 0.68,
                approved: false,
                trackId: kind === "track" ? "demo-track" : undefined,
                keyframe: true,
            });
        } finally {
            setAction("");
        }
    };
    const save = async () => {
        setSaving(true);
        try {
            await api.saveAnnotations(project.id, annotations);
        } catch {
            localStorage.setItem(
                `octate-${project.id}`,
                JSON.stringify(annotations),
            );
        }
        setTimeout(() => setSaving(false), 500);
    };
    return (
        <main className="workspace">
            <div className="worktop">
                <div>
                    <button className="back">Projects /</button>
                    <strong>{project.name}</strong>
                </div>
                <div className="ai-actions">
                    <span>AI ASSIST</span>
                    {(["detect", "segment", "track"] as const).map((k) => (
                        <button
                            key={k}
                            onClick={() => run(k)}
                            disabled={!!action}
                        >
                            {k === "detect" ? (
                                <Box />
                            ) : k === "segment" ? (
                                <Sparkles />
                            ) : (
                                <Waypoints />
                            )}
                            {action === k
                                ? "Running…"
                                : k[0].toUpperCase() + k.slice(1)}
                        </button>
                    ))}
                </div>
                <button className="save" onClick={save}>
                    <Check />
                    {saving ? "Saving…" : "Saved"}
                </button>
            </div>
            <div className="stage">
                <aside className="tools">
                    <small>TOOLS</small>
                    <button
                        className={tool === "select" ? "active" : ""}
                        onClick={() => setTool("select")}
                        title="Select"
                    >
                        <MousePointer2 />
                    </button>
                    <button
                        className={tool === "rectangle" ? "active" : ""}
                        onClick={() => setTool("rectangle")}
                        title="Rectangle"
                    >
                        <Box />
                    </button>
                    <button
                        className={tool === "polygon" ? "active" : ""}
                        onClick={() => setTool("polygon")}
                        title="Polygon"
                    >
                        <Waypoints />
                    </button>
                </aside>
                <section className="viewport">
                    <div className="frame-meta">
                        FRAME {String(frame).padStart(4, "0")}{" "}
                        <span>00:00:{(frame / 24).toFixed(2)}</span>
                    </div>
                    <Canvas
                        frame={frame}
                        annotations={annotations}
                        tool={tool}
                        onAdd={add}
                        onSelect={setSelected}
                        selected={selected}
                    />
                </section>
                <aside className="inspector">
                    <div className="inspector-tabs">
                        <b>OBJECTS</b>
                        <span>{current.length}</span>
                    </div>
                    {current.map((a) => (
                        <button
                            className={`object ${selected === a.id ? "active" : ""}`}
                            onClick={() => setSelected(a.id)}
                            key={a.id}
                        >
                            <i
                                style={{
                                    background: a.approved
                                        ? "#27d3ae"
                                        : "#f5aa3b",
                                }}
                            />
                            <div>
                                <strong>{a.label}</strong>
                                <small>
                                    {a.type} · {a.trackId ? "Track" : "Shape"}
                                </small>
                            </div>
                            <em>{Math.round(a.confidence * 100)}%</em>
                        </button>
                    ))}
                    {selectedAnn && (
                        <div className="properties">
                            <small>SELECTED OBJECT</small>
                            <label>
                                Label
                                <input
                                    value={selectedAnn.label}
                                    onChange={(e) =>
                                        setAnnotations(
                                            annotations.map((a) =>
                                                a.id === selected
                                                    ? {
                                                          ...a,
                                                          label: e.target.value,
                                                      }
                                                    : a,
                                            ),
                                        )
                                    }
                                />
                            </label>
                            <label className="toggle">
                                <input
                                    type="checkbox"
                                    checked={selectedAnn.approved}
                                    onChange={(e) =>
                                        setAnnotations(
                                            annotations.map((a) =>
                                                a.id === selected
                                                    ? {
                                                          ...a,
                                                          approved:
                                                              e.target.checked,
                                                      }
                                                    : a,
                                            ),
                                        )
                                    }
                                />
                                Approved
                            </label>
                        </div>
                    )}
                </aside>
            </div>
            <div className="timeline">
                <div className="play">
                    <button onClick={() => setFrame(Math.max(0, frame - 1))}>
                        ‹
                    </button>
                    <b>{frame}</b>
                    <button
                        onClick={() =>
                            setFrame(Math.min(project.frames - 1, frame + 1))
                        }
                    >
                        ›
                    </button>
                </div>
                <div className="scrub">
                    <input
                        type="range"
                        min="0"
                        max={project.frames - 1}
                        value={frame}
                        onChange={(e) => setFrame(+e.target.value)}
                    />
                    <div className="markers">
                        {[18, 42, 76, 111, 166, 205].map((f, i) => (
                            <button
                                key={f}
                                className={i % 2 ? "uncertain" : "key"}
                                style={{
                                    left: `${(f / project.frames) * 100}%`,
                                }}
                                onClick={() => setFrame(f)}
                                title={`Frame ${f}`}
                            />
                        ))}
                    </div>
                    <div className="legend">
                        <span>
                            <i className="key" />
                            Keyframe
                        </span>
                        <span>
                            <i className="uncertain" />
                            Needs review
                        </span>
                    </div>
                </div>
                <button className="review-cta" onClick={onReview}>
                    Review uncertain <ChevronRight />
                </button>
            </div>
        </main>
    );
}
function Review({
    items,
    setItems,
    onJump,
}: {
    items: ReviewItem[];
    setItems: (i: ReviewItem[]) => void;
    onJump: (f: number) => void;
}) {
    const pending = items.filter((i) => i.status === "pending");
    const active = pending[0] ?? items[0];
    const update = async (status: "approved" | "rejected") => {
        if (!active) return;
        setItems(items.map((i) => (i.id === active.id ? { ...i, status } : i)));
        try {
            await api.reviewItem(active.id, status);
        } catch {}
    };
    return (
        <main className="page review-page">
            <div className="eyebrow">QUALITY / SMART REVIEW</div>
            <section className="page-title">
                <div>
                    <h1>Review what matters</h1>
                    <p>
                        Frames are ranked by model confidence, temporal
                        stability, tracking continuity, and shape quality.
                    </p>
                </div>
                <div className="review-count">
                    <b>{items.length - pending.length}</b> / {items.length}{" "}
                    reviewed
                </div>
            </section>
            <div className="review-grid">
                <aside>
                    <h3>
                        Priority queue <span>{pending.length}</span>
                    </h3>
                    {items.map((i, n) => (
                        <button
                            className={`${active?.id === i.id ? "active" : ""} ${i.status}`}
                            key={i.id}
                        >
                            <b>{String(n + 1).padStart(2, "0")}</b>
                            <div>
                                Frame {i.frame}
                                <small>{i.reasons[0]}</small>
                            </div>
                            <em>{Math.round(i.score * 100)}</em>
                        </button>
                    ))}
                </aside>
                <section className="review-card">
                    {active ? (
                        <>
                            <div className="review-image">
                                <div className="fake-shape" />
                                <span>FRAME {active.frame}</span>
                            </div>
                            <div className="why">
                                <small>WHY THIS FRAME</small>
                                <h2>Human judgment recommended</h2>
                                {active.reasons.map((r) => (
                                    <p key={r}>
                                        <CircleDot />
                                        {r}
                                    </p>
                                ))}
                                <div className="confidence">
                                    <span>Uncertainty</span>
                                    <b>{Math.round(active.score * 100)}%</b>
                                    <i>
                                        <u
                                            style={{
                                                width: `${active.score * 100}%`,
                                            }}
                                        />
                                    </i>
                                </div>
                                <div className="review-actions">
                                    <button
                                        className="reject"
                                        onClick={() => update("rejected")}
                                    >
                                        <X />
                                        Reject
                                    </button>
                                    <button
                                        onClick={() => onJump(active.frame)}
                                    >
                                        Correct in canvas
                                    </button>
                                    <button
                                        className="approve"
                                        onClick={() => update("approved")}
                                    >
                                        <Check />
                                        Approve
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="empty">Review queue complete.</div>
                    )}
                </section>
            </div>
        </main>
    );
}
export default function App() {
    const [screen, setScreen] = useState<Screen>("landing");
    const [projects, setProjects] = useState<Project[]>([fallback]);
    const [project, setProject] = useState(fallback);
    const [annotations, setAnnotations] = useState<Annotation[]>(seed);
    const [items, setItems] = useState<ReviewItem[]>([
        {
            id: "r1",
            frame: 42,
            score: 0.82,
            reasons: [
                "Low detection confidence (61%)",
                "Shape changed 34% from the previous frame",
            ],
            status: "pending",
            annotationId: "a2",
        },
        {
            id: "r2",
            frame: 76,
            score: 0.69,
            reasons: [
                "Tracking gap across 3 frames",
                "Object center jumped 48 pixels",
            ],
            status: "pending",
            annotationId: "a3",
        },
        {
            id: "r3",
            frame: 166,
            score: 0.55,
            reasons: ["Unusual aspect ratio for this label"],
            status: "pending",
            annotationId: "a4",
        },
    ]);
    const uploadInput = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState("");
    useEffect(() => {
        api.projects()
            .then((p) => p.length && setProjects(p))
            .catch(() => {});
        const saved = localStorage.getItem("octate-demo");
        if (saved) setAnnotations(JSON.parse(saved));
    }, []);
    const pending = useMemo(
        () => items.filter((i) => i.status === "pending").length,
        [items],
    );
    const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (!files.length) return;
        setUploading(true);
        setUploadError("");
        try {
            const p = await api.uploadProject(files);
            setProjects([p, ...projects]);
            setProject(p);
            setScreen("annotate");
        } catch (error) {
            setUploadError(
                error instanceof Error ? error.message : "Folder upload failed",
            );
        } finally {
            setUploading(false);
        }
    };
    return (
        <>
            <Header screen={screen} setScreen={setScreen} pending={pending} />
            <input
                ref={uploadInput}
                type="file"
                multiple
                accept="video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v"
                hidden
                onChange={upload}
            />
            {screen === "landing" && (
                <Landing
                    projects={projects}
                    onUpload={() => uploadInput.current?.click()}
                    onOpen={(p) => {
                        setProject(p);
                        setScreen("annotate");
                    }}
                />
            )}
            {screen === "projects" && (
                <Projects
                    projects={projects}
                    onUpload={() => uploadInput.current?.click()}
                    onOpen={(p) => {
                        setProject(p);
                        setScreen("annotate");
                    }}
                />
            )}
            {uploading && (
                <div className="upload-status">
                    Extracting frames with FFmpeg…
                </div>
            )}
            {uploadError && (
                <div className="upload-status error">{uploadError}</div>
            )}
            {screen === "annotate" && (
                <Annotate
                    project={project}
                    annotations={annotations}
                    setAnnotations={(a) => {
                        setAnnotations(a);
                        localStorage.setItem(
                            `octate-${project.id}`,
                            JSON.stringify(a),
                        );
                    }}
                    onReview={() => setScreen("review")}
                />
            )}{" "}
            {screen === "review" && (
                <Review
                    items={items}
                    setItems={setItems}
                    onJump={() => setScreen("annotate")}
                />
            )}
        </>
    );
}
