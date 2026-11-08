export function AboutPage() {
    return (
        <main className="about-page">
            <h1>Annotation infrastructure for surgical video.</h1>
            <p className="about-lede">
                Tasks and jobs live in the Octate dashboard. Uploaded video is decoded, annotations are stored, and the workspace opens when a job is ready.
            </p>
            <div className="about-grid">
                <article>
                    <strong>Tasks</strong>
                    <p>Create a task and upload a video. The instrument detector supplies the labels stored with the task.</p>
                </article>
                <article>
                    <strong>Jobs</strong>
                    <p>Each job is a frame range. Octate leaves the dashboard and opens that job.</p>
                </article>
                <article>
                    <strong>Annotation</strong>
                    <p>Boxes, polygons, masks, interpolation, and the timeline stay in the annotation workspace.</p>
                </article>
            </div>
        </main>
    );
}
