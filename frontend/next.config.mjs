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
        return [
            {
                source: "/api/:path*",
                destination: `${process.env.API_SERVER_URL ?? "http://localhost:8080"}/api/:path*`,
            },
        ];
    },
});

export default makeConfig;

