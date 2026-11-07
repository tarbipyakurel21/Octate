export function AboutPage() {
    return (
        <main className="about-page">
            <div className="eyebrow">ABOUT OCTATE</div>
            <h1>Annotation infrastructure for surgical video.</h1>
            <p className="about-lede">
                A task holds one video. Frames come from FFmpeg. Labels, jobs, and object state follow the cvat-core records vendored with this project.
            </p>
            <div className="about-grid">
                <article>
                    <strong>Tasks</strong>
                    <p>Create a task, name it, add labels, and upload a video. The server extracts one JPEG per frame.</p>
                </article>
                <article>
                    <strong>Jobs</strong>
                    <p>A job is a frame range inside a task. Segment size splits a video into more than one job.</p>
                </article>
                <article>
                    <strong>Canvas</strong>
                    <p>Open a task to draw on the extracted frame. Saving writes the shapes into the canvas object store.</p>
                </article>
            </div>
        </main>
    );
}
