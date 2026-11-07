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

    function hideName(value) {
        if (!value || !/cvat|computer vision annotation tool|open data annotation platform/i.test(value)) return value;
        return value
            .replace(/Computer Vision Annotation Tool/gi, "Octate")
            .replace(/Open Data Annotation Platform/gi, "Surgical video annotation")
            .replace(/\bcvat\b/gi, "Octate");
    }

    function scrubAttributes(node) {
        ["alt", "title", "placeholder", "aria-label"].forEach(function (name) {
            const current = node.getAttribute(name);
            const next = hideName(current);
            if (current && next !== current) node.setAttribute(name, next);
        });
    }

    function inStylesheet(node) {
        const el = node.nodeType === 1 ? node : node.parentElement;
        return !!(el && el.closest && el.closest("script, style, noscript"));
    }

    function scrub(node) {
        if (!node || inStylesheet(node)) return;
        if (node.nodeType === 3) {
            const next = hideName(node.nodeValue);
            if (next !== node.nodeValue) node.nodeValue = next;
            return;
        }
        if (node.nodeType !== 1) return;
        const tag = node.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return;
        if (tag === "OPTION" && !node.hasAttribute("value")) node.setAttribute("value", node.textContent || "");
        scrubAttributes(node);
        node.childNodes.forEach(scrub);
    }

    function retitle() {
        const next = hideName(document.title);
        if (next && next !== document.title) document.title = next;
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

    const ICONS = {
        home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
        about: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        projects: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
        tasks: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/>',
        jobs: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
        github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
    };

    function icon(name) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");
        svg.innerHTML = ICONS[name];
        return svg;
    }

    function currentSection() {
        const path = window.location.pathname;
        if (path.startsWith("/about")) return "about";
        if (path.startsWith("/projects")) return "projects";
        if (path.startsWith("/tasks")) return "tasks";
        if (path.startsWith("/jobs")) return "jobs";
        if (path === "/") return "home";
        return "";
    }

    function dashboardLink(href, label, section, active) {
        const link = document.createElement("a");
        link.href = href;
        link.className = "octate-dash-link" + (active ? " is-active" : "");
        link.dataset.section = section;
        link.append(icon(section), document.createTextNode(label));
        return link;
    }

    function mountDashboard() {
        const header = document.querySelector(".cvat-header");
        const left = header && header.querySelector(".cvat-left-header");
        if (!left) return;
        const logo = left.querySelector(".cvat-logo-icon");
        if (logo && logo.dataset.octateHome !== "1") {
            logo.dataset.octateHome = "1";
            logo.addEventListener("click", function () {
                window.location.assign("/");
            });
        }
        let nav = left.querySelector(".octate-dash");
        if (!nav) {
            nav = document.createElement("nav");
            nav.className = "octate-dash";
            nav.setAttribute("aria-label", "Octate");
            if (logo) logo.after(nav);
            else left.append(nav);
        }
        const section = currentSection();
        const items = [
            ["/", "Home", "home"],
            ["/about", "About", "about"],
            ["/projects", "Projects", "projects"],
            ["/tasks", "Tasks", "tasks"],
            ["/jobs", "Jobs", "jobs"],
        ];
        const links = nav.querySelectorAll(".octate-dash-link:not(.octate-github)");
        if (links.length !== items.length) {
            const github = document.createElement("a");
            github.href = "https://github.com/tarbipyakurel21/Octate";
            github.target = "_blank";
            github.rel = "noreferrer";
            github.className = "octate-dash-link octate-github";
            github.setAttribute("aria-label", "Open Octate on GitHub");
            github.append(icon("github"));
            nav.replaceChildren(
                ...items.map(function (item) {
                    return dashboardLink(item[0], item[1], item[2], item[2] === section);
                }),
                github,
            );
            return;
        }
        links.forEach(function (link) {
            link.classList.toggle("is-active", link.dataset.section === section);
        });
    }

    function brand() {
        document.querySelectorAll(".cvat-logo-icon").forEach(brandLogo);
        brandSubtitle();
        favicon();
        retitle();
        mountDashboard();
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function () {
            scheduled = false;
            brand();
        });
    }

    new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type === "characterData") scrub(mutation.target);
            else if (mutation.type === "attributes") scrubAttributes(mutation.target);
            else mutation.addedNodes.forEach(scrub);
        });
        schedule();
    }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["alt", "title", "placeholder", "aria-label"],
    });
    scrub(document.body);
    brand();
})();
