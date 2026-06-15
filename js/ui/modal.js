/**
 * ui/modal.js
 * Modal helpers — utility thuần, không cần store.
 * Phase 4K-6S: closeModal is a centrally registered canonical global.
 */

import { GlobalOwnershipRegistry } from '../core/globalOwnershipRegistry.js';

export function openModal(modalId = 'profileModal', display = 'flex') {
    const id = modalId || 'profileModal';
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!el) return false;
    el.style.display = display;
    return true;
}

export function closeModal(modalId = 'profileModal') {
    const id = modalId || 'profileModal';
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!el) return false;
    el.style.display = 'none';
    return true;
}

export function closeModalOnOverlay(event, modalId) {
    if (event && event.target === event.currentTarget) return closeModal(modalId);
    return false;
}

export function registerModalGlobals() {
    if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };

    const closeResult = GlobalOwnershipRegistry.register('closeModal', closeModal, {
        owner: 'js/ui/modal.js',
        risk: 'ui-only',
        policy: 'module-primary',
    });

    // These helpers are compatibility aliases, not separately migrated globals.
    window.openModal = window.openModal || openModal;
    window.closeModalOnOverlay = window.closeModalOnOverlay || closeModalOnOverlay;
    window.closeModalLegacy = GlobalOwnershipRegistry.getLegacyFallback('closeModal');

    if (!closeResult.ok) {
        console.warn('[4K-6S] closeModal ownership registration failed:', closeResult);
    }
    return closeResult;
}
