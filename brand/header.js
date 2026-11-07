(function () {
    const LOGO = "/octate-brand/OctoLabel.png";
    const SUBTITLE = "Surgical video annotation";
    let scheduled = false;

    function dashboardPath(pathname) {
        const path = (pathname || "/").replace(/\/$/, "") || "/";
        return (
            path === "/" ||
            path === "/about" ||
            path === "/login" ||
            path === "/tasks" ||
            path === "/tasks/new" ||
            path === "/jobs" ||
            path === "/projects" ||
            /^\/tasks\/\d+$/.test(path) ||
            /^\/projects\/\d+$/.test(path)
        );
    }

    function leaveForDashboard(url) {
        const next = new URL(url, window.location.origin);
        if (next.origin !== window.location.origin) return false;
        if (!dashboardPath(next.pathname)) return false;
        window.location.assign(next.pathname);
        return true;
    }

    document.addEventListener(
        "click",
        function (event) {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
            if (!link) return;
            if (leaveForDashboard(link.href)) {
                event.preventDefault();
                event.stopPropagation();
            }
        },
        true,
    );

    ["pushState", "replaceState"].forEach(function (method) {
        const original = history[method];
        history[method] = function (state, title, url) {
            if (url && leaveForDashboard(url)) return;
            return original.apply(this, arguments);
        };
    });

    window.addEventListener("popstate", function () {
        if (dashboardPath(window.location.pathname)) window.location.reload();
    });

    function retitle() {
        const title = document.title;
        if (!title || (title.indexOf("CVAT") === -1 && title.indexOf("Computer Vision Annotation Tool") === -1)) return;
        document.title = title
            .replace("Computer Vision Annotation Tool", "Octate")
            .replace(/\bCVAT\b/g, "Octate");
    }

    function brandLogo(node) {
        if (node.querySelector(".octate-wordmark")) return;
        const image = document.createElement("img");
        image.src = LOGO;
        image.alt = "";
        const word = document.createElement("span");
        word.className = "octate-wordmark";
        const first = document.createElement("b");
        first.textContent = "Oc";
        const second = document.createElement("b");
        second.textContent = "tate";
        word.append(first, second);
        node.replaceChildren(image, word);
        node.classList.add("octate-logo");
    }

    function brandSubtitle() {
        const title = document.querySelector(".cvat-signing-title .ant-typography");
        if (!title || title.dataset.octate === "1") return;
        const text = title.textContent || "";
        if (text.indexOf("Open Data Annotation Platform") === -1 && text.indexOf("Computer Vision Annotation Tool") === -1) return;
        title.textContent = SUBTITLE;
        title.dataset.octate = "1";
    }

    function favicon() {
        let icon = document.querySelector("link[rel='icon']");
        if (!icon) {
            icon = document.createElement("link");
            icon.rel = "icon";
            document.head.appendChild(icon);
        }
        if (icon.getAttribute("href") !== LOGO) icon.setAttribute("href", LOGO);
    }

    function brand() {
        document.querySelectorAll(".cvat-logo-icon").forEach(brandLogo);
        brandSubtitle();
        favicon();
        retitle();
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function () {
            scheduled = false;
            brand();
        });
    }

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    brand();
})();
