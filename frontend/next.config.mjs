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
        // Model gateway is exposed on 8091 in dev and behind /model-api in Docker.
        const modelOrigin = process.env.MODEL_SERVER_URL ?? "http://localhost:8091";
        return [
            // Every page, including the job editor, is a Next.js route. Only the API is proxied.
            { source: "/api/:path*", destination: `${origin}/api/:path*` },
            // Proxy the model gateway directly so the browser can reach /model-api in dev mode too.
            { source: "/model-api/:path*", destination: `${modelOrigin}/:path*` },
        ];
    },
});

export default makeConfig;

