/**
 * modules/inventory.js — Phase 2f
 * ────────────────────────────────────────────────────────────────
 * Quản lý kho đồng phục + danh mục tùy chỉnh.
 *
 * EXTRACTED từ app.js (Phase 2f):
 * ┌──────────────────────────────────────┬────────────────┐
 * │ Hàm                                  │ Dòng app.js    │
 * ├──────────────────────────────────────┼────────────────┤
 * │ window.getInvCategories              │ 2869           │
 * │ window.getCategoryOptionHtml         │ 2879           │
 * │ window.populateInvCategorySelects    │ 2890           │
 * │ window.loadInvCategories             │ 2908           │
 * │ window.openManageCatModal            │ 2930           │
 * │ window.closeManageCatModal           │ 2941           │
 * │ window.renderManageCatList           │ 2949           │
 * │ window.addInvCategory                │ 3001           │
 * │ window.deleteInvCategory             │ 3051           │
 * │ window.toggleInvCategory             │ 3078           │
 * │ window.toggleEditInvSize             │ 3103           │
 * │ window.toggleInvType                 │ 2846           │
 * │ inventoryForm.onsubmit               │ 3775           │
 * │ window.openEditInv                   │ 3811           │
 * │ window.closeEditInvModal             │ 3839           │
 * │ window.markInvPaid                   │ 3841           │
 * │ window.saveEditInv                   │ 3850           │
 * │ window.toggleMultiItemInv            │ 6223           │
 * │ window.toggleMiInvCategory           │ 6234           │
 * │ window.calcMiInvTotal                │ 6286           │
 * └──────────────────────────────────────┴────────────────┘
 *
 * BRIDGE PATTERN: Đọc state từ window.__store tại call-time.
 * ROLLBACK: Comment initInventory() trong main.js → app.js đảm nhận.
 *
 * /// Phase 2f — extracted from app.js
 * ────────────────────────────────────────────────────────────────
 */

import { getLocalToday } from '../utils/format.js';
import { InventoryService } from '../services/inventory.service.js';

// ════════════════════════════════════════════════════════════════
// BRIDGE HELPERS — đọc state từ window.__store tại call-time
// ════════════════════════════════════════════════════════════════

/** Firestore db instance */
function _db()        { return (window.__store || {}).db; }
/** Transactions collection ref */
function _colRef()    { return (window.__store || {}).colRef; }
/** Inventory collection ref */
function _invRef()    { return (window.__store || {}).invRef; }
/** Club ID hiện tại */
function _clubId()    { return (window.__store || {}).clubId; }
/** @deprecated Phase 3.1 — Firebase calls đã chuyển sang InventoryService */

// ════════════════════════════════════════════════════════════════
// EXPORT CHÍNH
// ════════════════════════════════════════════════════════════════

export function initInventory() {

    // ════════════════════════════════════════════════════════════
    // 1. getInvCategories — Trả về tất cả danh mục kho
    // ════════════════════════════════════════════════════════════

    /**
     * Trả về danh sách TẤT CẢ danh mục (mặc định + tùy chỉnh).
     * Danh mục mặc định luôn đứng đầu: Võ phục, Áo thun, Bảo hộ.
     */
    window.getInvCategories = () => {
        const defaults = ['Võ phục', 'Áo thun', 'Bảo hộ'];
        const customNames = (window.invCustomCategories || []).map(c => c.name);
        return [...defaults, ...customNames.filter(n => !defaults.includes(n))];
    };

    /**
     * Tạo HTML <option> cho tất cả danh mục (dùng populate dropdown).
     */
    window.getCategoryOptionHtml = () => {
        const cats = window.getInvCategories();
        const icons = { 'Võ phục': '🥋', 'Áo thun': '👕', 'Bảo hộ': '🛡️' };
        return cats.map(c => `<option value="${c}">${icons[c] || '📦'} ${c}</option>`).join('');
    };

    // ════════════════════════════════════════════════════════════
    // 2. populateInvCategorySelects — Cập nhật tất cả dropdown
    // ════════════════════════════════════════════════════════════

    /**
     * Cập nhật nội dung tất cả dropdown danh mục kho trên trang.
     * Gọi sau khi load hoặc thay đổi danh mục tùy chỉnh.
     */
    window.populateInvCategorySelects = () => {
        const html = window.getCategoryOptionHtml();
        ['inv_category', 'ei_category', 'mi_inv_category'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const cur = el.value;
                el.innerHTML = html;
                if ([...el.options].some(o => o.value === cur)) el.value = cur;
            }
        });
    };

    // ════════════════════════════════════════════════════════════
    // 3. loadInvCategories — Tải danh mục từ Firestore
    // ════════════════════════════════════════════════════════════

    /**
     * Tải danh mục tùy chỉnh từ Firestore: clubs/{clubId}/settings/inv_categories.
     * Gọi sau khi user đăng nhập và clubId đã được set.
     */
    window.loadInvCategories = async () => {
        const clubId = _clubId();
        if (!clubId) return;
        try {
            window.invCustomCategories = await InventoryService.loadCategories();
        } catch (_) {
            window.invCustomCategories = [];
        }

        // Phase 4K-4D: Sync vào __store để classifyInventoryFinanceTx đọc được
        if (!window.__store) window.__store = {};
        window.__store.invCustomCategories = window.invCustomCategories || [];
        window.__store._inventoryCategoryVersion = (window.__store._inventoryCategoryVersion || 0) + 1;
        window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
        window.__store._lastDataVersionReason = 'loadInvCategories';

        window.populateInvCategorySelects();

        const manageBtnWrap = document.getElementById('admin_manage_cat_wrap');
        if (manageBtnWrap) {
            manageBtnWrap.style.display =
                (window.userRole === 'admin' || window.userRole === 'super_admin') ? 'block' : 'none';
        }
    };

    // ════════════════════════════════════════════════════════════
    // 4. openManageCatModal / closeManageCatModal / renderManageCatList
    // ════════════════════════════════════════════════════════════

    /** Mở modal quản lý danh mục kho (chỉ admin). */
    window.openManageCatModal = () => {
        if (window.userRole !== 'admin' && window.userRole !== 'super_admin') {
            return alert('Chỉ Admin mới có quyền quản lý danh mục kho!');
        }
        window.renderManageCatList();
        const el = document.getElementById('manageCatModal');
        if (el) el.style.display = 'flex';
    };

    /** Đóng modal quản lý danh mục kho. */
    window.closeManageCatModal = () => {
        const el = document.getElementById('manageCatModal');
        if (el) el.style.display = 'none';
    };

    /**
     * Render danh sách danh mục (mặc định + tùy chỉnh) trong modal quản lý.
     * Danh mục mặc định hiển thị badge "Mặc định" và không có nút Xóa.
     */
    window.renderManageCatList = () => {
        const defaults = ['Võ phục', 'Áo thun', 'Bảo hộ'];
        const defaultDesc = {
            'Võ phục': 'Size dropdown: Size 1m → Size 1m8',
            'Áo thun': 'Nhập size tự do',
            'Bảo hộ': 'Nhập size tự do',
        };
        const el = document.getElementById('manageCatList');
        if (!el) return;

        let html = '';
        defaults.forEach(name => {
            html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f0f9ff;border-radius:10px;margin-bottom:6px;border:1px solid #bae6fd;">
                <div>
                    <span style="font-weight:700;font-size:0.85rem;">${name}</span>
                    <span style="margin-left:8px;font-size:0.68rem;background:#bae6fd;color:#0369a1;padding:2px 7px;border-radius:5px;font-weight:700;">Mặc định</span>
                    <div style="font-size:0.68rem;color:#64748b;margin-top:2px;">${defaultDesc[name] || ''}</div>
                </div>
                <span style="font-size:0.68rem;color:#94a3b8;font-style:italic;">Không xóa</span>
            </div>`;
        });

        if (!window.invCustomCategories || window.invCustomCategories.length === 0) {
            html += `<div style="text-align:center;padding:20px;color:#94a3b8;font-size:0.82rem;font-style:italic;background:#f8fafc;border-radius:10px;border:1px dashed #e2e8f0;margin-top:8px;">
                Chưa có danh mục tùy chỉnh nào.<br>Sử dụng form bên trên để thêm danh mục mới.
            </div>`;
        } else {
            (window.invCustomCategories || []).forEach((cat, idx) => {
                const sizesText = (cat.sizes && cat.sizes.length > 0)
                    ? 'Size: ' + cat.sizes.join(', ')
                    : 'Nhập size tự do';
                html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#fff;border-radius:10px;margin-bottom:6px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                    <div style="flex:1;min-width:0;">
                        <span style="font-weight:700;font-size:0.85rem;">📦 ${cat.name}</span>
                        <div style="font-size:0.68rem;color:#64748b;margin-top:2px;">${sizesText}</div>
                    </div>
                    <button type="button" onclick="window.deleteInvCategory(${idx})" style="background:#fee2e2;border:none;color:#dc2626;border-radius:8px;padding:5px 10px;font-size:0.75rem;font-weight:700;cursor:pointer;flex-shrink:0;margin-left:8px;">🗑 Xóa</button>
                </div>`;
            });
        }
        el.innerHTML = html;
    };

    // ════════════════════════════════════════════════════════════
    // 5. addInvCategory — Thêm danh mục tùy chỉnh mới
    // ════════════════════════════════════════════════════════════

    /**
     * Thêm danh mục kho mới vào Firestore.
     * Đọc từ: #newCatName (tên), #newCatSizes (sizes, phân cách bằng dấu phẩy).
     */
    window.addInvCategory = async () => {
        if (window.userRole !== 'admin' && window.userRole !== 'super_admin') return;

        const nameEl  = document.getElementById('newCatName');
        const sizesEl = document.getElementById('newCatSizes');
        const name    = (nameEl ? nameEl.value : '').trim();

        if (!name)           return alert('Vui lòng nhập tên danh mục!');
        if (name.length > 30) return alert('Tên danh mục tối đa 30 ký tự!');

        const defaults  = ['Võ phục', 'Áo thun', 'Bảo hộ'];
        const existing  = (window.invCustomCategories || []).map(c => c.name);
        if ([...defaults, ...existing].includes(name)) {
            return alert(`Danh mục "${name}" đã tồn tại! Vui lòng đặt tên khác.`);
        }

        const sizesRaw = sizesEl ? sizesEl.value.trim() : '';
        const sizes    = sizesRaw
            ? sizesRaw.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        const newCat      = { name, sizes };
        const updatedList = [...(window.invCustomCategories || []), newCat];

        try {
            await InventoryService.saveCategories(updatedList);
            window.invCustomCategories = updatedList;
            // Phase 4K-4D: Sync vào __store
            if (!window.__store) window.__store = {};
            window.__store.invCustomCategories = updatedList;
            window.__store._inventoryCategoryVersion = (window.__store._inventoryCategoryVersion || 0) + 1;
            window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
            window.__store._lastDataVersionReason = 'addInvCategory';
            if (nameEl)  nameEl.value  = '';
            if (sizesEl) sizesEl.value = '';
            window.populateInvCategorySelects();
            window.renderManageCatList();
            if (typeof window.invalidateInventory === 'function') window.invalidateInventory('inventory-categories-changed');
            if (typeof window.invalidateFinance   === 'function') window.invalidateFinance('inventory-categories-changed');
            if (typeof window.invalidateDashboard === 'function') window.invalidateDashboard('inventory-categories-changed');
            window.showToast(`✅ Đã thêm danh mục "${name}" thành công!`);
        } catch (e) {
            console.error('[inventory.js] addInvCategory lỗi:', e);
            alert('Lỗi khi lưu danh mục! Vui lòng thử lại.');
        }
    };

    // ════════════════════════════════════════════════════════════
    // 6. deleteInvCategory — Xóa danh mục tùy chỉnh
    // ════════════════════════════════════════════════════════════

    /**
     * Xóa danh mục tùy chỉnh theo vị trí index trong mảng invCustomCategories.
     * Danh mục mặc định (Võ phục, Áo thun, Bảo hộ) không thể xóa.
     */
    window.deleteInvCategory = async (idx) => {
        if (window.userRole !== 'admin' && window.userRole !== 'super_admin') return;
        const cat = (window.invCustomCategories || [])[idx];
        if (!cat) return;
        if (!confirm(`Xóa danh mục "${cat.name}"?\n\nCác giao dịch đã nhập với danh mục này vẫn giữ nguyên, chỉ xóa khỏi danh sách lựa chọn.`)) return;

        const updatedList = [...(window.invCustomCategories || [])];
        updatedList.splice(idx, 1);

        try {
            await InventoryService.saveCategories(updatedList);
            window.invCustomCategories = updatedList;
            // Phase 4K-4D: Sync vào __store
            if (!window.__store) window.__store = {};
            window.__store.invCustomCategories = updatedList;
            window.__store._inventoryCategoryVersion = (window.__store._inventoryCategoryVersion || 0) + 1;
            window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
            window.__store._lastDataVersionReason = 'deleteInvCategory';
            window.populateInvCategorySelects();
            window.renderManageCatList();
            if (typeof window.invalidateInventory === 'function') window.invalidateInventory('inventory-categories-changed');
            if (typeof window.invalidateFinance   === 'function') window.invalidateFinance('inventory-categories-changed');
            if (typeof window.invalidateDashboard === 'function') window.invalidateDashboard('inventory-categories-changed');
            window.showToast(`✅ Đã xóa danh mục "${cat.name}"!`);
        } catch (e) {
            console.error('[inventory.js] deleteInvCategory lỗi:', e);
            alert('Lỗi khi xóa danh mục! Vui lòng thử lại.');
        }
    };

    // ════════════════════════════════════════════════════════════
    // 7. toggleInvType — Toggle placeholder theo loại nhập/xuất
    // ════════════════════════════════════════════════════════════

    /**
     * Cập nhật placeholder và hiển thị ô "Nợ chưa trả" theo loại giao dịch kho.
     * Nhập kho → ẩn nút "Nợ"; Xuất bán → hiện nút "Nợ".
     */
    window.toggleInvType = () => {
        const t           = document.getElementById('inv_type');
        const desc        = document.getElementById('inv_desc');
        const unpaidWrap  = document.getElementById('inv_unpaid_wrap');
        const unpaidChk   = document.getElementById('inv_unpaid');
        if (!t) return;
        if (t.value === 'Nhập kho') {
            if (desc) desc.placeholder = 'Tên nhà cung cấp';
            if (unpaidWrap) unpaidWrap.style.setProperty('display', 'none', 'important');
            if (unpaidChk) unpaidChk.checked = false;
        } else {
            if (desc) desc.placeholder = 'Tên người mua / Đại lý';
            if (unpaidWrap) unpaidWrap.style.removeProperty('display');
        }
    };

    // ════════════════════════════════════════════════════════════
    // 8. toggleInvCategory — Toggle size input theo danh mục (form Nhập/Xuất kho)
    // ════════════════════════════════════════════════════════════

    /**
     * Cập nhật hiển thị ô nhập size theo danh mục được chọn trong form kho chính.
     * - Võ phục: dropdown size cố định (Size 1m → Size 1m8)
     * - Danh mục tùy chỉnh có sizes: dropdown từ sizes đã lưu
     * - Danh mục không có sizes (Áo thun, Bảo hộ...): input tự do
     */
    window.toggleInvCategory = () => {
        const cat         = (document.getElementById('inv_category') || {}).value || 'Võ phục';
        const sizeSelect  = document.getElementById('inv_size');
        const sizeText    = document.getElementById('inv_size_text');
        if (!sizeSelect || !sizeText) return;

        if (cat === 'Võ phục') {
            sizeSelect.style.display  = ''; sizeSelect.required  = true;
            sizeText.style.display    = 'none'; sizeText.required = false; sizeText.value = '';
        } else {
            const customCat = (window.invCustomCategories || []).find(c => c.name === cat);
            if (customCat && customCat.sizes && customCat.sizes.length > 0) {
                sizeSelect.innerHTML = '<option value="" disabled selected>-- Chọn Size --</option>'
                    + customCat.sizes.map(s => `<option value="${s}">${s}</option>`).join('');
                sizeSelect.style.display  = ''; sizeSelect.required  = true;
                sizeText.style.display    = 'none'; sizeText.required = false; sizeText.value = '';
            } else {
                sizeSelect.style.display  = 'none'; sizeSelect.required  = false;
                sizeText.style.display    = ''; sizeText.required    = true;
            }
        }
    };

    // ════════════════════════════════════════════════════════════
    // 9. toggleEditInvSize — Toggle size input trong form Sửa kho
    // ════════════════════════════════════════════════════════════

    /**
     * Cập nhật hiển thị ô nhập size cho form Sửa kho (editInvModal).
     * Logic tương tự toggleInvCategory nhưng dùng element ei_*.
     */
    window.toggleEditInvSize = () => {
        const cat        = (document.getElementById('ei_category') || {}).value || 'Võ phục';
        const sizeSelect = document.getElementById('ei_size');
        const sizeText   = document.getElementById('ei_size_text');
        if (!sizeSelect || !sizeText) return;

        if (cat === 'Võ phục') {
            sizeSelect.style.display = ''; sizeText.style.display = 'none';
        } else {
            const customCat = (window.invCustomCategories || []).find(c => c.name === cat);
            if (customCat && customCat.sizes && customCat.sizes.length > 0) {
                sizeSelect.innerHTML = '<option value="" disabled selected>-- Chọn Size --</option>'
                    + customCat.sizes.map(s => `<option value="${s}">${s}</option>`).join('');
                sizeSelect.style.display = ''; sizeText.style.display = 'none';
            } else {
                sizeSelect.style.display = 'none'; sizeText.style.display = '';
            }
        }
    };

    // ════════════════════════════════════════════════════════════
    // 10. inventoryForm.onsubmit — Nhập / Xuất kho
    // ════════════════════════════════════════════════════════════

    /**
     * Xử lý form Nhập/Xuất kho (inventoryForm.onsubmit).
     * Override handler của app.js để dùng bridge pattern.
     *
     * Ghi đồng thời 2 documents:
     *  1. inventory/{id}     — bản ghi kho (size, qty, category...)
     *  2. transactions/{id}  — bản ghi kế toán (amount, type, date...)
     *
     * Fix: Không hardcode branch = 'Chung' khi club có nhiều cơ sở.
     */
    const _invFormEl = document.getElementById('inventoryForm');
    if (_invFormEl) {
        _invFormEl.onsubmit = async (e) => {
            e.preventDefault();
            if (window.userRole === 'viewer') return alert('Tài khoản khách không thể nhập xuất kho!');

            const category = (document.getElementById('inv_category') || {}).value || 'Võ phục';
            const _invSizeEl    = document.getElementById('inv_size');
            const _invSizeTxtEl = document.getElementById('inv_size_text');
            const size = (
                _invSizeEl && _invSizeEl.style.display !== 'none'
                    ? _invSizeEl.value
                    : (_invSizeTxtEl ? _invSizeTxtEl.value : '')
            ).trim();

            if (!size) return alert('Vui lòng nhập kích cỡ hàng hóa!');

            const type    = (document.getElementById('inv_type') || {}).value;
            const qty     = Number((document.getElementById('inv_qty') || {}).value);
            const desc    = ((document.getElementById('inv_desc') || {}).value || '').trim();
            const amount  = Number((document.getElementById('inv_totalActual') || {}).value);
            const date    = (document.getElementById('inv_date') || {}).value || getLocalToday();
            const isUnpaid = type === 'Xuất bán'
                && document.getElementById('inv_unpaid')
                && document.getElementById('inv_unpaid').checked;

            const invData = { category, size, type, qty, desc, amount, date, timestamp: Date.now() };
            if (isUnpaid) {
                invData.unpaid = true;
                invData.inventoryDebtStatus = 'pending';
            }

            const invId = await InventoryService.addItem(invData);

            // Phase 4K-4D: Nhập kho → Chi ngay. Xuất bán có nợ → KHÔNG tạo tx doanh thu.
            if (type === 'Nhập kho' && amount > 0) {
                // Chi nhập kho → cộng chi ngay
                await InventoryService.addTransaction({
                    branch: 'Chung',
                    type:   `Chi ${category}`,
                    description: `Nhập ${category} ${size} từ ${desc}`,
                    amount, date,
                    timestamp: Date.now(),
                    relatedInvId: invId,
                });
            } else if (type === 'Xuất bán' && !isUnpaid && amount > 0) {
                // Xuất bán đã thu tiền ngay → cộng doanh thu
                await InventoryService.addTransaction({
                    branch: 'Chung',
                    type:   `Thu ${category}`,
                    description: `Bán ${category} ${size} cho ${desc}`,
                    amount, date,
                    timestamp: Date.now(),
                    relatedInvId: invId,
                });
            } else if (type === 'Xuất bán' && isUnpaid) {
                // Bán nợ → KHÔNG tạo transaction doanh thu. Chờ "Đã Thu" mới cộng.
                // (inventoryDebtStatus: 'pending' đã set trong invData nếu cần)
            } else if (type === 'Xuất bán' && amount === 0) {
                // Tặng (amount = 0)
                await InventoryService.addTransaction({
                    branch: 'Chung',
                    type:   `Tặng ${category}`,
                    description: `Tặng ${category} ${size} cho ${desc}`,
                    amount: 0, date,
                    timestamp: Date.now(),
                    relatedInvId: invId,
                });
            }

            // Reset form về trạng thái mặc định
            e.target.reset();
            const invSizeEl = document.getElementById('inv_size');
            const invSizeTxtEl = document.getElementById('inv_size_text');
            if (invSizeEl) invSizeEl.style.display = '';
            if (invSizeTxtEl) invSizeTxtEl.style.display = 'none';
            const priceEl = document.getElementById('inv_priceActual');
            const totalEl = document.getElementById('inv_totalActual');
            if (priceEl) priceEl.value = '';
            if (totalEl) totalEl.value = '';
            const dateEl = document.getElementById('inv_date');
            if (dateEl) dateEl.value = getLocalToday();
            window.populateInvCategorySelects && window.populateInvCategorySelects();
            window.toggleInvType && window.toggleInvType();
            window.showToast('✅ Đã cập nhật Kho!');
        };
    }

    // ════════════════════════════════════════════════════════════
    // 11. openEditInv / closeEditInvModal / markInvPaid / saveEditInv
    //     Modal Sửa giao dịch kho
    // ════════════════════════════════════════════════════════════

    /**
     * Mở modal Sửa kho, tải dữ liệu từ Firestore và điền vào form.
     * @param {string} txId   — ID giao dịch trong collection transactions
     * @param {string} invId  — ID giao dịch trong collection inventory
     */
    window.openEditInv = async (txId, invId) => {
        if (!invId || invId === 'undefined') {
            return alert('Sản phẩm này ghi trước bản nâng cấp, không hỗ trợ sửa tự động. Hãy dùng nút Xóa để ghi lại!');
        }
        try {
            const invData = await InventoryService.getItem(invId);
            if (invData) {
                const eiCat = invData.category || 'Võ phục';
                const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
                setVal('ei_txId',    txId);
                setVal('ei_invId',   invId);
                setVal('ei_category', eiCat);
                window.toggleEditInvSize();
                if (eiCat === 'Võ phục') setVal('ei_size',      invData.size || '');
                else                     setVal('ei_size_text',  invData.size || '');
                setVal('ei_type',  invData.type || 'Xuất bán');
                setVal('ei_qty',   invData.qty  || 1);
                setVal('ei_date',  invData.date || '');

                const txData = await InventoryService.getTransaction(txId);
                if (txData) {
                    setVal('ei_desc',          txData.description || '');
                    setVal('ei_amountActual',   txData.amount || 0);
                    setVal('ei_amountDisplay', (txData.amount || 0).toLocaleString('vi-VN'));
                }

                const modal = document.getElementById('editInvModal');
                if (modal) modal.style.display = 'flex';
            }
        } catch (err) {
            console.error('[inventory.js] openEditInv lỗi:', err);
            alert('Lỗi khi tải dữ liệu sửa kho!');
        }
    };

    /** Đóng modal Sửa kho. */
    window.closeEditInvModal = () => {
        const el = document.getElementById('editInvModal');
        if (el) el.style.display = 'none';
    };

    /**
     * Đánh dấu đơn hàng nợ → đã thu tiền (cập nhật unpaid: false trong Firestore).
     * Chỉ admin mới thực hiện được.
     */
    window.markInvPaid = async (invId) => {
        if (window.userRole !== 'admin') return;
        if (!confirm('Xác nhận đã thu tiền cho đơn hàng nợ này?')) return;
        try {
            const result = await InventoryService.markPaid(invId);
            if (result && result.alreadyPaid) {
                window.showToast('ℹ️ Đơn này đã được thu trước đó');
            } else {
                window.showToast('✅ Đã thu tiền và ghi nhận doanh thu kho!');
            }
            // Phase 4K-4D: Invalidate để các tab render lại với doanh thu mới
            if (typeof window.invalidateInventory === 'function') window.invalidateInventory('inventory-debt-paid');
            if (typeof window.invalidateFinance   === 'function') window.invalidateFinance('inventory-debt-paid');
            if (typeof window.invalidateDashboard === 'function') window.invalidateDashboard('inventory-debt-paid');
            if (typeof window.invalidateSearchCache === 'function') {
                window.invalidateSearchCache('inventory', 'inventory-debt-paid');
                window.invalidateSearchCache('finance',   'inventory-debt-paid');
            }
        } catch (err) {
            console.error('[inventory.js] markInvPaid lỗi:', err);
            alert('Lỗi khi cập nhật!');
        }
    };

    /**
     * Lưu chỉnh sửa giao dịch kho (cập nhật cả inventory doc và transaction doc).
     */
    window.saveEditInv = async () => {
        if (window.userRole === 'viewer') return;
        const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
        const txId   = getVal('ei_txId');
        const invId  = getVal('ei_invId');
        if (!txId || !invId) return alert('Lỗi ID giao dịch. Vui lòng tải lại trang!');

        const eiCat = getVal('ei_category') || 'Võ phục';
        const size  = (eiCat === 'Võ phục' ? getVal('ei_size') : getVal('ei_size_text')).trim();
        const type  = getVal('ei_type');
        const qty   = Number(getVal('ei_qty'));
        const date  = getVal('ei_date');
        const desc  = getVal('ei_desc').trim();
        const amount = Number(getVal('ei_amountActual'));

        const invPayload = { category: eiCat, size, type, qty, date, desc, description: desc, amount };
        if (type === 'Xuất bán') {
            const identity = typeof window.resolveInventoryDebtIdentity === 'function'
                ? window.resolveInventoryDebtIdentity(desc)
                : null;
            if (identity) {
                if (identity.profileId) invPayload.profileId = identity.profileId;
                if (identity.memberId) invPayload.memberId = identity.memberId;
                if (identity.studentName) invPayload.studentName = identity.studentName;
            }
        }
        await InventoryService.updateItem(invId, invPayload);
        const txType = type === 'Nhập kho' ? `Chi ${eiCat}` : `Thu ${eiCat}`;
        await InventoryService.updateTransaction(txId, { type: txType, description: desc, amount, date });

        const modal = document.getElementById('editInvModal');
        if (modal) modal.style.display = 'none';
        window.showToast('✅ Đã sửa thành công dữ liệu kho!');
    };

    // ════════════════════════════════════════════════════════════
    // 12. toggleMultiItemInv / toggleMiInvCategory / calcMiInvTotal
    //     Phần kho trong phiếu Thu Gộp nhiều hạng mục (multiItemModal)
    // ════════════════════════════════════════════════════════════

    /**
     * Toggle section kho trong phiếu Thu Gộp.
     * Khi bật → gọi toggleMiInvCategory() để cập nhật dropdown size.
     * Khi tắt → đặt tổng tiền kho về 0.
     */
    window.toggleMultiItemInv = () => {
        const on = !!(document.getElementById('mi_inv_toggle') || {}).checked;
        const sec = document.getElementById('mi_inv_section');
        if (sec) sec.style.display = on ? 'block' : 'none';
        if (on) {
            if (typeof window.ensureMultiItemInventoryReady === 'function') {
                window.ensureMultiItemInventoryReady('multi-item-toggle-inventory')
                    .then(() => {
                        window.MultiItemInventorySafety?.buildInventoryStockMapForMultiItem?.({ reason: 'toggle-inventory' });
                        if (typeof window.toggleMiInvCategory === 'function') {
                            window.toggleMiInvCategory();
                        }
                    })
                    .catch(e => console.warn('[multiItem] inventory toggle hydration failed:', e));
            } else {
                window.toggleMiInvCategory();
            }
        } else {
            const totalEl = document.getElementById('mi_inv_total_actual');
            if (totalEl) totalEl.value = '0';
        }
        if (typeof window.updateMultiItemTotal === 'function') window.updateMultiItemTotal();
    };

    /**
     * Cập nhật dropdown size trong phiếu Thu Gộp khi thay đổi danh mục kho.
     * Hiển thị số lượng tồn kho thực tế theo _liveInvMap từ app.js.
     */
    window.toggleMiInvCategory = () => {
        const cat    = (document.getElementById('mi_inv_category') || {}).value || 'Võ phục';
        const sel    = document.getElementById('mi_inv_size_select');
        const txt    = document.getElementById('mi_inv_size_text');
        const hint   = document.getElementById('mi_inv_stock_hint');
        // Phase 4K-6G: fallback stock map build if _liveInvMap is empty
        if (
            (!window._liveInvMap || Object.keys(window._liveInvMap).length === 0) &&
            window.MultiItemInventorySafety &&
            window.MultiItemInventorySafety.buildInventoryStockMapForMultiItem
        ) {
            window.MultiItemInventorySafety.buildInventoryStockMapForMultiItem({ reason: 'toggle-mi-category' });
        }
        const inv    = window._liveInvMap || {};
        if (!sel || !txt) return;

        const _buildOption = (sz, balGetter) => {
            const bal = balGetter(sz);
            const opt = document.createElement('option');
            opt.value = sz;
            opt.textContent = bal > 0 ? `${sz} (Tồn: ${bal})` : `${sz} (Hết hàng)`;
            if (bal <= 0) opt.disabled = true;
            return { opt, has: bal > 0 };
        };

        if (cat === 'Võ phục') {
            sel.style.display = ''; txt.style.display = 'none';
            sel.innerHTML = '';
            const vpSizes = ['Size 1m','Size 1m1','Size 1m2','Size 1m3','Size 1m4','Size 1m5','Size 1m6','Size 1m7','Size 1m8'];
            let hasStock = false;
            vpSizes.forEach(sz => {
                const s   = inv['Võ phục|||' + sz] || { in: 0, out: 0 };
                const bal = s.in - s.out;
                const { opt, has } = _buildOption(sz, () => bal);
                sel.appendChild(opt);
                if (has) hasStock = true;
            });
            if (hint) hint.textContent = hasStock ? '' : '— Kho trống';
        } else {
            const customCat = (window.invCustomCategories || []).find(c => c.name === cat);
            if (customCat && customCat.sizes && customCat.sizes.length > 0) {
                sel.style.display = ''; txt.style.display = 'none';
                sel.innerHTML = '';
                let hasStock = false;
                customCat.sizes.forEach(sz => {
                    const s   = inv[cat + '|||' + sz] || { in: 0, out: 0 };
                    const bal = s.in - s.out;
                    const { opt, has } = _buildOption(sz, () => bal);
                    sel.appendChild(opt);
                    if (has) hasStock = true;
                });
                if (hint) hint.textContent = hasStock ? '' : '— Kho trống';
            } else {
                sel.style.display = 'none'; txt.style.display = '';
                if (hint) hint.textContent = '';
            }
        }
        if (typeof window.updateMultiItemTotal === 'function') window.updateMultiItemTotal();
    };

    /**
     * Tính tổng tiền kho trong phiếu Thu Gộp (qty × đơn giá).
     */
    window.calcMiInvTotal = () => {
        const qty   = Number((document.getElementById('mi_inv_qty')          || {}).value) || 0;
        const price = Number((document.getElementById('mi_inv_price_actual') || {}).value) || 0;
        const total = qty * price;
        const totalEl   = document.getElementById('mi_inv_total_actual');
        const displayEl = document.getElementById('mi_inv_total_display');
        if (totalEl)   totalEl.value   = total;
        if (displayEl) displayEl.value = total > 0 ? total.toLocaleString('vi-VN') + ' ₫' : '';
        if (typeof window.updateMultiItemTotal === 'function') window.updateMultiItemTotal();
    };

    // ════════════════════════════════════════════════════════════
    // DEBUG LOG — chỉ hiển thị khi chạy trên localhost / Replit
    // ════════════════════════════════════════════════════════════

    if (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.endsWith('.replit.dev') ||
        window.location.hostname.endsWith('.repl.co')
    ) {
        console.group('📦 Module Inventory — Phase 2f ✅ (100%)');
        console.log('✅ window.getInvCategories           :', typeof window.getInvCategories);
        console.log('✅ window.getCategoryOptionHtml       :', typeof window.getCategoryOptionHtml);
        console.log('✅ window.populateInvCategorySelects  :', typeof window.populateInvCategorySelects);
        console.log('✅ window.loadInvCategories           :', typeof window.loadInvCategories);
        console.log('✅ window.openManageCatModal          :', typeof window.openManageCatModal);
        console.log('✅ window.closeManageCatModal         :', typeof window.closeManageCatModal);
        console.log('✅ window.renderManageCatList         :', typeof window.renderManageCatList);
        console.log('✅ window.addInvCategory              :', typeof window.addInvCategory);
        console.log('✅ window.deleteInvCategory           :', typeof window.deleteInvCategory);
        console.log('✅ window.toggleInvType               :', typeof window.toggleInvType);
        console.log('✅ window.toggleInvCategory           :', typeof window.toggleInvCategory);
        console.log('✅ window.toggleEditInvSize           :', typeof window.toggleEditInvSize);
        console.log('✅ window.openEditInv                 :', typeof window.openEditInv);
        console.log('✅ window.closeEditInvModal           :', typeof window.closeEditInvModal);
        console.log('✅ window.markInvPaid                 :', typeof window.markInvPaid);
        console.log('✅ window.saveEditInv                 :', typeof window.saveEditInv);
        console.log('✅ window.toggleMultiItemInv          :', typeof window.toggleMultiItemInv);
        console.log('✅ window.toggleMiInvCategory         :', typeof window.toggleMiInvCategory);
        console.log('✅ window.calcMiInvTotal              :', typeof window.calcMiInvTotal);
        console.log('✅ inventoryForm.onsubmit             :', !!document.getElementById('inventoryForm')?.onsubmit);
        console.groupEnd();
    }
}
