/**
 * renderInventory.js — Phase 3.5A Render Computation Isolation
 *
 * Inventory render islands. Each island owns exactly one DOM region.
 *
 * Islands registered:
 *   inventory.inventoryList  → #inventoryList   (product/stock table)
 *   inventory.uniformTxList  → #uniformTxList   (uniform transaction list)
 *
 * Phase 3.4 → 3.5A CHANGE:
 *   HTML source moved from window.__store.tabHtmlCache
 *   → module-local inventoryRenderCache (via getInventoryCachedHtml).
 *   tabHtmlCache is still populated by render.js for backward compat,
 *   but islands no longer read from it directly.
 *
 * Applies HTML via <template> + replaceChildren (DocumentFragment — minimal reflow).
 */

import { registerRender } from './renderRegistry.js';
import { getInventoryCachedHtml } from './computation/inventoryRenderer.js';

// ─── Core DOM helper ────────────────────────────────────────────────────────

/**
 * Apply an HTML string to a container element using a DocumentFragment.
 * Uses <template> for safe, context-free HTML parsing.
 * replaceChildren() atomically replaces all children in one DOM mutation.
 *
 * @param {Element|null} el   — target container
 * @param {string}       html — inner HTML string
 */
function _applyHtml(el, html) {
    if (!el) return;
    if (!html) {
        el.replaceChildren();
        return;
    }
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    el.replaceChildren(tpl.content);
}

// ─── Island render functions ─────────────────────────────────────────────────

/** Render the inventory product table (#inventoryList). */
export function renderInventoryTableIsland() {
    _applyHtml(document.getElementById('inventoryList'), getInventoryCachedHtml('invListRows'));
}

/** Render the uniform transaction list (#uniformTxList). */
export function renderUniformTxIsland() {
    _applyHtml(document.getElementById('uniformTxList'), getInventoryCachedHtml('uniformTxRows'));
}

// ─── Island initialiser ──────────────────────────────────────────────────────

/**
 * Register all inventory render islands with the registry.
 * Call once during application bootstrap (main.js).
 *
 * Both islands share tabId 'inventory' so either a data change
 * or a manual invalidation triggers both DOM regions atomically.
 */
export function initInventoryIslands() {
    registerRender('inventory.inventoryList', renderInventoryTableIsland, {
        selector: '#inventoryList',
        tabId:    'inventory',
    });
    registerRender('inventory.uniformTxList', renderUniformTxIsland, {
        selector: '#uniformTxList',
        tabId:    'inventory',
    });
}

// ─── Legacy window shims ─────────────────────────────────────────────────────

export function registerInventoryLegacyGlobals() {
    window.renderInventoryTable = renderInventoryTableIsland;
    window.renderUniformTxList  = renderUniformTxIsland;
}
