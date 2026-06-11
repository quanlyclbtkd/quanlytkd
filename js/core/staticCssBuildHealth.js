/*
 * Phase 4K-6P — Tailwind CDN Removal / Static CSS Build
 * Runtime diagnostics only. The UI is served from ./css/tailwind-static.css,
 * while the old https://cdn.tailwindcss.com runtime is intentionally absent.
 */
export function initStaticCssBuildHealth() {
    const phase = '4K-6P-tailwind-static-css-build-20260608';
    const st = window.__staticCssBuildHealth || (window.__staticCssBuildHealth = {
        phase,
        checkedAt: '',
        cssHref: './css/tailwind-static.css?v=tailwind-static-build-20260608'
    });
    st.phase = phase;
    st.moduleLoaded = true;
    st.buildVersion = window.APP_BUILD_VERSION || '';

    if (document && document.documentElement) {
        document.documentElement.classList.add('tw-static-build-loaded');
    }

    function getLinks() {
        try {
            return Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href || l.getAttribute('href') || '');
        } catch (_) {
            return [];
        }
    }

    function getScripts() {
        try {
            return Array.from(document.scripts || []).map(s => s.src || '').filter(Boolean);
        } catch (_) {
            return [];
        }
    }

    window.debugStaticCssBuild = function debugStaticCssBuild() {
        const links = getLinks();
        const scripts = getScripts();
        const cssLink = links.find(h => h.includes('tailwind-static.css')) || '';
        const hasTailwindCdnScript = scripts.some(h => h.includes('cdn.tailwindcss.com'));
        const hasTailwindRuntimeGlobal = !!window.tailwind;
        const probe = document.createElement('div');
        probe.className = 'hidden md:block bg-primary text-white rounded-lg p-4';
        probe.style.position = 'absolute';
        probe.style.left = '-9999px';
        probe.style.top = '-9999px';
        document.body && document.body.appendChild(probe);
        let computed = {};
        try {
            const cs = getComputedStyle(probe);
            computed = {
                display: cs.display,
                backgroundColor: cs.backgroundColor,
                color: cs.color,
                borderRadius: cs.borderRadius,
                paddingTop: cs.paddingTop
            };
        } catch (_) {}
        try { probe.remove(); } catch (_) {}

        const result = {
            ok: !!cssLink && !hasTailwindCdnScript,
            phase,
            buildVersion: window.APP_BUILD_VERSION || '',
            staticCssLoaded: !!cssLink,
            staticCssHref: cssLink,
            hasTailwindCdnScript,
            hasTailwindRuntimeGlobal,
            stylesheetCount: links.length,
            computedProbe: computed,
            notes: hasTailwindRuntimeGlobal
                ? 'window.tailwind still exists; verify CDN was not cached by old page.'
                : 'Static CSS build active; Tailwind CDN runtime absent.'
        };
        st.checkedAt = new Date().toISOString();
        st.last = result;
        try { console.table({
            staticCssLoaded: result.staticCssLoaded,
            hasTailwindCdnScript: result.hasTailwindCdnScript,
            hasTailwindRuntimeGlobal: result.hasTailwindRuntimeGlobal,
            probeDisplay: computed.display,
            probeBg: computed.backgroundColor,
            probePaddingTop: computed.paddingTop
        }); } catch (_) {}
        return result;
    };

    window.debugTailwindCdnRemoval = function debugTailwindCdnRemoval() {
        const r = window.debugStaticCssBuild ? window.debugStaticCssBuild() : null;
        return {
            ok: !!(r && r.ok),
            phase,
            cdnRemoved: !!(r && !r.hasTailwindCdnScript),
            staticCssLoaded: !!(r && r.staticCssLoaded),
            result: r
        };
    };

    return st;
}

export default { initStaticCssBuildHealth };
