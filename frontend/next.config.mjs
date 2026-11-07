import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

const makeConfig = (phase) => ({
    // Development and production previously shared .next. Running `next build`
    // while `next dev` was open replaced its manifests and caused intermittent 500s.
    distDir: phase === "phase-development-server" ? ".next-dev" : ".next-build",
    webpack: (config) => {
        config.resolve.modules = [path.resolve(root, "node_modules"), ...(config.resolve.modules || ["node_modules"])];
        config.resolve.alias["cvat-canvas-editor"] = path.resolve(
            root,
            "../vendor/cvat/canvas/src/typescript/canvas.ts",
        );
        config.resolve.alias["cvat-canvas3d-editor"] = path.resolve(
            root,
            "../vendor/cvat/canvas3d/src/typescript/canvas3d.ts",
        );
        config.resolve.alias["cvat-core"] = path.resolve(root, "../vendor/cvat/cvat-core");
        config.resolve.alias["lru-cache"] = path.resolve(
            root,
            "node_modules/lru-cache/dist/commonjs/index.js",
        );
        return config;
    },
    experimental: {
        // Rewrites proxy the video upload. The default 10MB clone limit was
        // truncating the body and resetting the connection to the API.
        middlewareClientMaxBodySize: "2gb",
    },
    async rewrites() {
        const origin = process.env.API_SERVER_URL ?? "http://localhost:8080";
        // Dashboard routes are Next.js pages. These rewrites only cover the CVAT
        // workflow that has no Octate page, including /tasks/:id/jobs/:jobId.
        // afterFiles runs before dynamic routes, so keep that pattern specific.
        const workflow = ["assets", "cloudstorages", "organizations", "requests", "analytics", "models", "webhooks", "quality"];
        return {
            afterFiles: [
                { source: "/api/:path*", destination: `${origin}/api/:path*` },
                { source: "/tasks/:taskId/jobs/:path*", destination: `${origin}/tasks/:taskId/jobs/:path*` },
                { source: "/jobs/:path*", destination: `${origin}/jobs/:path*` },
                { source: "/auth/:path*", destination: `${origin}/auth/:path*` },
                ...workflow.flatMap((prefix) => [
                    { source: `/${prefix}`, destination: `${origin}/${prefix}` },
                    { source: `/${prefix}/:path*`, destination: `${origin}/${prefix}/:path*` },
                ]),
            ],
            fallback: [
                { source: "/projects/:path*", destination: `${origin}/projects/:path*` },
                { source: "/tasks/:path*", destination: `${origin}/tasks/:path*` },
            ],
        };
    },
});

export default makeConfig;

