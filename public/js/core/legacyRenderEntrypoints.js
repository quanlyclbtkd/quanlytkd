/**
 * legacyRenderEntrypoints.js — Phase 4K-6H
 * ────────────────────────────────────────────────────────────────────
 * Audit module để đo và route các legacy render call:
 *   scheduleRender / renderApp / _moduleRenderApp / mergeAndRender / fallbackRender
 *
 * KHÔNG thay thế renderApp hay scheduleRender — chỉ ghi metrics + route sang invalidation.
 * ────────────────────────────────────────────────────────────────────
 */

const MAX_RECENT = 50;

function _initStore() {
    if (!window.__legacyRenderEntrypoints) {
        window.__legacyRenderEntrypoints = {
            total:    0,
            byType:   {},
            byReason: {},
            recent:   []
        };
    }
    return window.__legacyRenderEntrypoints;
}

/**
 * recordLegacyRenderCall(type, reason, meta)
 * Ghi một legacy render call vào store metrics.
 */
function recordLegacyRenderCall(type, reason, meta = {}) {
    try {
        const store = _initStore();
        store.total++;

        store.byType[type] = (store.byType[type] || 0) + 1;

        const reasonKey = String(reason || 'unknown');
        store.byReason[reasonKey] = (store.byReason[reasonKey] || 0) + 1;

        const entry = {
            ts:        Date.now(),
            type:      type,
            reason:    reasonKey,
            activeTab: (
                (window.__store && window.__store.currentTab) ||
                window.currentTab ||
                (() => {
                    const el = typeof document !== 'undefined' &&
                        document.querySelector && document.querySelector('.tab-content.active');
                    return el ? el.id.replace('tab_', '') : 'unknown';
                })()
            ),
            meta: meta
        };

        store.recent.push(entry);
        if (store.recent.length > MAX_RECENT) {
            store.recent.shift();
        }
    } catch (_e) {
        // Không throw — metrics không được làm crash app
    }
}

/**
 * getLegacyRenderEntrypointStats()
 * Trả về summary đầy đủ để dùng trong debugLegacyRenderEntrypoints().
 */
function getLegacyRenderEntrypointStats() {
    try {
        const store = _initStore();
        const byType = store.byType || {};

        const scheduleRenderCalls   = byType['scheduleRender']   || 0;
        const renderAppCalls        = byType['renderApp']         || 0;
        const moduleRenderAppCalls  = byType['moduleRenderApp']   || 0;
        const mergeAndRenderCalls   = byType['mergeAndRender']    || 0;
        const fallbackRenderCalls   = byType['fallbackRender']    || 0;

        const byReason = store.byReason || {};

        let routedCalls       = 0;
        let fallbackCalls     = 0;
        let unknownReasonCalls = 0;

        for (const [k, v] of Object.entries(byReason)) {
            if (k === 'unknown' || k === '') unknownReasonCalls += v;
        }

        if (window.__legacyRenderEntrypointsRouteStats) {
            routedCalls   = window.__legacyRenderEntrypointsRouteStats.routed   || 0;
            fallbackCalls = window.__legacyRenderEntrypointsRouteStats.fallback  || 0;
        }

        const recommendations = [];
        if (scheduleRenderCalls > 10) {
            recommendations.push('Nếu scheduleRenderCalls còn cao: kiểm tra app.js snapshot listeners.');
        }
        if (unknownReasonCalls > 5) {
            recommendations.push('Nếu unknownReasonCalls cao: thêm reason/domain rõ.');
        }
        if (moduleRenderAppCalls > 0) {
            recommendations.push('Nếu moduleRenderAppCalls còn xuất hiện khi chuyển tab: cần tiếp tục Phase 4K-6H-B.');
        }

        const byDomain = {};
        for (const [k] of Object.entries(byReason)) {
            const domain = classifyRenderReason(k);
            byDomain[domain] = (byDomain[domain] || 0) + (byReason[k] || 0);
        }

        return {
            summary: {
                total:               store.total,
                scheduleRenderCalls,
                renderAppCalls,
                moduleRenderAppCalls,
                mergeAndRenderCalls,
                fallbackRenderCalls,
                routedCalls,
                fallbackCalls,
                unknownReasonCalls
            },
            byReason,
            byDomain,
            recent:          store.recent.slice(-20),
            recommendations
        };
    } catch (_e) {
        return { summary: {}, byReason: {}, byDomain: {}, recent: [], recommendations: [] };
    }
}

/**
 * classifyRenderReason(reason) → domain string
 * Phân loại reason thành domain.
 */
function classifyRenderReason(reason) {
    try {
        const s = String(reason || '').toLowerCase();

        if (s.includes('profile') || s.includes('student') || s.includes('active') || s.includes('quit')) return 'students';
        if (s.includes('transaction') || s.includes('finance') || s.includes('tuition') || s.includes('fee')) return 'finance';
        if (s.includes('debt') || s.includes('bao-no') || s.includes('báo nợ')) return 'debt';
        if (s.includes('dashboard') || s.includes('overview') || s.includes('summary')) return 'dashboard';
        if (s.includes('inventory') || s.includes('kho') || s.includes('uniform')) return 'inventory';
        if (s.includes('exam') || s.includes('thi')) return 'exam';
        if (s.includes('attendance') || s.includes('diem-danh') || s.includes('điểm danh')) return 'attendance';
        if (s.includes('settings') || s.includes('config')) return 'settings';
        if (s.includes('superadmin') || s.includes('club')) return 'superadmin';
        return 'unknown';
    } catch (_e) {
        return 'unknown';
    }
}

/**
 * getRecommendedInvalidation(reason) → string mô tả cách invalidate tốt hơn
 */
function getRecommendedInvalidation(reason) {
    const domain = classifyRenderReason(reason);
    const map = {
        students:   'invalidateStudents() hoặc invalidateList("students.activeList")',
        finance:    'invalidateFinance() hoặc invalidateList("tx.txList")',
        debt:       'invalidateList("students.debtList")',
        dashboard:  'invalidateDashboard()',
        inventory:  'invalidateInventory() hoặc invalidateList("inventory.inventoryList")',
        exam:       'invalidateList("exam.examList") hoặc renderExamList()',
        attendance: 'invalidateAttendance()',
        settings:   'invalidateByDomain("all")',
        superadmin: 'invalidateByDomain("all")',
        unknown:    'Cần xác định domain trước — thêm reason rõ ràng'
    };
    return map[domain] || map['unknown'];
}

/**
 * routeLegacyRenderReason(reason, meta) → { routed, domain, method }
 * Cố route reason sang invalidation domain. Không throw, không gọi renderApp.
 */
function routeLegacyRenderReason(reason, meta) {
    meta = meta || {};
    try {
        const domain = classifyRenderReason(reason);

        // Track route stats
        window.__legacyRenderEntrypointsRouteStats = window.__legacyRenderEntrypointsRouteStats || {
            routed: 0, fallback: 0
        };

        let result = null;

        if (domain === 'students') {
            if (typeof window.invalidateStudents === 'function') {
                window.invalidateStudents(reason || 'legacy-route-students');
                result = { routed: true, domain, method: 'invalidateStudents' };
            } else if (typeof window.invalidateList === 'function') {
                window.invalidateList('students.activeList', reason || 'legacy-route-students');
                window.invalidateList('students.debtList', reason || 'legacy-route-students');
                result = { routed: true, domain, method: 'invalidateList:students' };
            }
        } else if (domain === 'finance') {
            if (typeof window.invalidateList === 'function') {
                window.invalidateList('tx.txList', reason || 'legacy-route-finance');
                result = { routed: true, domain, method: 'invalidateList:tx.txList' };
            }
        } else if (domain === 'debt') {
            if (typeof window.invalidateList === 'function') {
                window.invalidateList('students.debtList', reason || 'legacy-route-debt');
                result = { routed: true, domain, method: 'invalidateList:students.debtList' };
            }
        } else if (domain === 'dashboard') {
            if (typeof window.invalidateDashboard === 'function') {
                window.invalidateDashboard(reason || 'legacy-route-dashboard');
                result = { routed: true, domain, method: 'invalidateDashboard' };
            }
        } else if (domain === 'inventory') {
            if (typeof window.invalidateList === 'function') {
                window.invalidateList('inventory.inventoryList', reason || 'legacy-route-inventory');
                window.invalidateList('inventory.uniformTxList', reason || 'legacy-route-inventory');
                result = { routed: true, domain, method: 'invalidateList:inventory' };
            }
        } else if (domain === 'exam') {
            if (meta.directAllowed === true && typeof window.renderExamList === 'function') {
                window.renderExamList();
                result = { routed: true, domain, method: 'renderExamList:direct' };
            } else if (typeof window.invalidateList === 'function') {
                window.invalidateList('exam.examList', reason || 'legacy-route-exam');
                result = { routed: true, domain, method: 'invalidateList:exam.examList' };
            }
        } else if (domain === 'attendance') {
            if (typeof window.invalidateAttendance === 'function') {
                window.invalidateAttendance(reason || 'legacy-route-attendance');
                result = { routed: true, domain, method: 'invalidateAttendance' };
            }
        } else if (domain === 'settings') {
            if (typeof window.invalidateByDomain === 'function') {
                window.invalidateByDomain('all', reason || 'legacy-route-settings');
                result = { routed: true, domain, method: 'invalidateByDomain:all' };
            }
        }

        if (result && result.routed) {
            window.__legacyRenderEntrypointsRouteStats.routed++;
            return result;
        }

        // unknown hoặc không route được
        window.__legacyRenderEntrypointsRouteStats.fallback++;
        return { routed: false, domain: domain, method: 'fallback-required' };
    } catch (_e) {
        // Không throw
        return { routed: false, domain: 'unknown', method: 'fallback-required' };
    }
}

export const LegacyRenderEntrypoints = {
    recordLegacyRenderCall,
    getLegacyRenderEntrypointStats,
    classifyRenderReason,
    getRecommendedInvalidation,
    routeLegacyRenderReason
};
