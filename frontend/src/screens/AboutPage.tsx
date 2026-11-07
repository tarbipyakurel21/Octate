export function AboutPage() {
    return (
        <main className="about-page">
            <div className="eyebrow">ABOUT OCTATE</div>
            <h1>Annotation infrastructure for surgical video.</h1>
            <p className="about-lede">
                Projects, tasks, and jobs live in the Octate dashboard. CVAT decodes the video, stores the annotations, and opens its workspace when a job is ready.
            </p>
            <div className="about-grid">
                <article>
                    <strong>Tasks</strong>
                    <p>Create a task, choose a procedure template, and upload a video. CVAT stores the task and labels.</p>
                </article>
                <article>
                    <strong>Jobs</strong>
                    <p>Each job is a frame range. Annotate leaves the dashboard and opens that job in CVAT.</p>
                </article>
                <article>
                    <strong>Annotation</strong>
                    <p>Boxes, polygons, masks, interpolation, and the timeline are CVAT’s. Octate does not replace them.</p>
                </article>
            </div>
        </main>
    );
}
