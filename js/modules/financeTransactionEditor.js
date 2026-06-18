/**
 * Phase 4K-6V3F1 — Inline revenue transaction editor.
 * Isolated from finance.js to keep the core payment module small and auditable.
 */
import { formatDate } from '../utils/format.js';
import { FinanceService } from '../services/finance.service.js?v=financial-collection-revenue-routing-20260618-v3f1';

function ensureModal() {
  let modal = document.getElementById('editRevenueTransactionModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'editRevenueTransactionModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content relative max-w-md mx-auto" style="max-width:560px;">
      <button type="button" id="ert_close_x" class="absolute top-4 right-4 text-slate-400 hover:text-rose-500 text-2xl font-bold bg-slate-100 w-8 h-8 rounded-full flex items-center justify-center">&times;</button>
      <h2 class="text-emerald-700 font-black text-xl border-b border-slate-100 pb-3 mb-3">✏️ SỬA SỐ TIỀN GIAO DỊCH</h2>
      <div id="ert_summary" style="font-size:.82rem;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:12px;"></div>
      <div id="ert_components"></div>
      <div style="margin-top:11px;">
        <label style="display:block;font-size:.68rem;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:5px;">Ghi chú chỉnh sửa</label>
        <input id="ert_note" type="text" placeholder="Ví dụ: Nhập nhầm số tiền" style="width:100%;" />
      </div>
      <div style="font-size:.72rem;line-height:1.45;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:9px;padding:8px 10px;margin-top:10px;">
        Chỉ sửa số tiền và phân loại doanh thu; không thay đổi tháng đã đóng, số lượng hàng hoặc số tồn kho.
      </div>
      <div id="ert_error" style="display:none;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 10px;margin-top:10px;font-size:.78rem;font-weight:700;"></div>
      <div style="display:flex;gap:9px;margin-top:14px;">
        <button type="button" id="ert_cancel" style="flex:1;padding:11px;border:1px solid #cbd5e1;background:#fff;border-radius:10px;font-weight:800;cursor:pointer;">Hủy</button>
        <button type="button" id="ert_save" style="flex:2;padding:11px;border:none;background:#059669;color:#fff;border-radius:10px;font-weight:900;cursor:pointer;">💾 Lưu thay đổi</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#ert_close_x').onclick = () => window.closeEditRevenueTransaction();
  modal.querySelector('#ert_cancel').onclick = () => window.closeEditRevenueTransaction();
  modal.querySelector('#ert_save').onclick = () => void window.saveEditRevenueTransaction();
  return modal;
}

function parseAmount(value) {
  return Number(String(value || '').replace(/\D/g, ''));
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function initFinanceTransactionEditor() {
  if (typeof window === 'undefined') return;

  window.closeEditRevenueTransaction = () => {
    const modal = document.getElementById('editRevenueTransactionModal');
    if (modal && modal.dataset.saving !== 'true') modal.style.display = 'none';
  };

  window.openEditRevenueTransaction = async txId => {
    if (window.userRole !== 'admin') {
      window.showToast?.('⚠️ Chỉ tài khoản quản trị CLB được sửa giao dịch.', 3500);
      return false;
    }
    try {
      const tx = await FinanceService.getTransaction(txId);
      if (!tx) throw new Error('Không tìm thấy giao dịch');
      if (tx.reconciliationOnly || tx.affectsRevenue === false) {
        throw new Error('Bút toán này chỉ dùng đối soát tồn kho, không phải doanh thu để sửa');
      }
      const modal = ensureModal();
      const componentsEl = modal.querySelector('#ert_components');
      const summaryEl = modal.querySelector('#ert_summary');
      const errorEl = modal.querySelector('#ert_error');
      errorEl.style.display = 'none';
      errorEl.textContent = '';
      modal.dataset.saving = 'false';
      window.__editingRevenueTransaction = tx;

      const studentName = tx.studentName || tx.profileName || tx.description || '';
      summaryEl.innerHTML = `<strong>${escapeHtml(studentName)}</strong><br>${escapeHtml(tx.type || 'Khoản thu')} · ${tx.date ? formatDate(tx.date) : ''}`;
      const components = Array.isArray(tx.components) && tx.components.length
        ? tx.components
        : [{ kind: (tx.revenueCategories || [])[0] || '', label: tx.type || 'Số tiền', amount: Number(tx.amount || 0) }];
      componentsEl.innerHTML = components.map((component, index) => {
        const category = component.kind === 'inventoryDebt' ? 'inventory' : (component.kind || (tx.revenueCategories || [])[0] || 'other');
        const label = component.label || component.type || window.getRevenueCategoryLabel?.(category) || 'Khoản thu';
        const categoryLabel = window.getRevenueCategoryLabel?.(category) || label;
        return `<div style="display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:10px;align-items:center;margin-bottom:9px;padding:10px;border:1px solid #e2e8f0;border-radius:10px;">
          <div style="min-width:0;"><div style="font-weight:800;color:#1e293b;font-size:.84rem;white-space:normal;">${escapeHtml(label)}</div><div style="font-size:.68rem;color:#64748b;margin-top:2px;">Doanh thu: ${escapeHtml(categoryLabel)}</div></div>
          <input type="tel" class="ert_component_amount" data-index="${index}" value="${Number(component.amount || 0).toLocaleString('vi-VN')}" style="text-align:right;font-weight:900;color:#047857;" />
        </div>`;
      }).join('');
      componentsEl.querySelectorAll('.ert_component_amount').forEach(input => {
        input.addEventListener('blur', () => {
          const value = parseAmount(input.value);
          input.value = Number.isFinite(value) ? value.toLocaleString('vi-VN') : '0';
        });
      });
      modal.querySelector('#ert_note').value = '';
      modal.style.display = 'flex';
      return true;
    } catch (error) {
      console.error('[financeTransactionEditor] open failed:', error);
      window.showToast?.('❌ Không thể mở giao dịch: ' + (error?.message || error), 5000);
      return false;
    }
  };

  window.saveEditRevenueTransaction = async () => {
    const modal = document.getElementById('editRevenueTransactionModal');
    const tx = window.__editingRevenueTransaction;
    if (!modal || !tx || modal.dataset.saving === 'true') return false;
    const errorEl = modal.querySelector('#ert_error');
    const saveBtn = modal.querySelector('#ert_save');
    try {
      const componentAmounts = {};
      Array.from(modal.querySelectorAll('.ert_component_amount')).forEach(input => {
        const value = parseAmount(input.value);
        if (!Number.isFinite(value) || value < 0) throw new Error('Có số tiền không hợp lệ');
        componentAmounts[Number(input.dataset.index)] = value;
      });
      const total = Object.values(componentAmounts).reduce((sum, value) => sum + Number(value || 0), 0);
      if (total <= 0 && !confirm('Tổng giao dịch bằng 0 ₫. Bạn vẫn muốn lưu?')) return false;

      modal.dataset.saving = 'true';
      saveBtn.disabled = true;
      saveBtn.textContent = '⏳ Đang lưu…';
      errorEl.style.display = 'none';
      const updated = await FinanceService.updateRevenueTransactionAtomic(tx.id || tx.txId, {
        amount: total,
        componentAmounts,
        note: modal.querySelector('#ert_note').value,
      });
      modal.style.display = 'none';
      window.__editingRevenueTransaction = null;
      window.showToast?.(`✅ Đã sửa giao dịch thành ${Number(updated.amount || 0).toLocaleString('vi-VN')} ₫ và phân loại lại doanh thu.`, 5000);
      return true;
    } catch (error) {
      console.error('[financeTransactionEditor] save failed:', error);
      errorEl.textContent = error?.message || String(error || 'Lỗi không xác định');
      errorEl.style.display = 'block';
      return false;
    } finally {
      modal.dataset.saving = 'false';
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Lưu thay đổi';
    }
  };
}
