/** Phase 4K-6V3F1 — Quick tuition payment modal with a fail-closed saving state. */
import { normalizeYYYYMM } from '../utils/format.js';

function profiles() { return (window.__store || {}).profiles || {}; }

export function initQuickPaymentModal() {
  if (typeof window === 'undefined') return;
  window.openQuickPayModal = (name, owedMonthsStr, branch) => {
    if (window.userRole === 'viewer') {
      window.showToast?.('⚠️ Tài khoản khách không thể thu tiền!', 3000);
      return;
    }
    const cleanName = String(name || '').replace(/\\'/g, "'");
    const monthsList = String(owedMonthsStr || '').split(',').map(s => normalizeYYYYMM(s.trim())).filter(Boolean);
    if (!monthsList.length) {
      window.showToast?.('⚠️ Không xác định được tháng học phí cần thu.', 3500);
      return;
    }
    const feePerMonth = Number((profiles()[cleanName] || {}).tuitionFee) || 0;
    const modal = document.getElementById('quickPayModal');
    if (!modal) {
      void window.quickPay?.(name, owedMonthsStr, branch, String(feePerMonth * monthsList.length), true);
      return;
    }
    const nameEl = document.getElementById('qpm_name');
    if (nameEl) nameEl.textContent = `${cleanName} — ${monthsList.length} tháng chưa nộp`;
    const optionsEl = document.getElementById('qpm_options');
    if (!optionsEl) return;
    optionsEl.innerHTML = '';

    const statusEl = document.createElement('div');
    statusEl.id = 'qpm_status';
    statusEl.setAttribute('role', 'status');
    statusEl.style.cssText = 'display:none;margin:0 0 8px;padding:9px 11px;border-radius:9px;background:#eff6ff;color:#1d4ed8;font-weight:700;font-size:.8rem;';
    optionsEl.appendChild(statusEl);

    const setBusy = (busy, message = '') => {
      modal.dataset.saving = busy ? 'true' : 'false';
      optionsEl.querySelectorAll('button,input').forEach(el => {
        el.disabled = !!busy;
        if (el.tagName === 'BUTTON') el.style.opacity = busy ? '.55' : '1';
      });
      statusEl.style.display = busy || message ? 'block' : 'none';
      statusEl.textContent = message || (busy ? '⏳ Đang ghi nhận khoản thu…' : '');
    };
    const runPayment = async (months, paymentAmount) => {
      if (modal.dataset.saving === 'true') return false;
      setBusy(true, '⏳ Đang ghi nhận khoản thu, vui lòng không đóng cửa sổ…');
      const ok = await window.quickPay?.(name, months.join(','), branch, String(paymentAmount || ''), true);
      if (ok) {
        modal.style.display = 'none';
        setBusy(false);
        return true;
      }
      setBusy(false, '⚠️ Khoản thu chưa được ghi nhận. Kiểm tra thông báo lỗi và thử lại.');
      return false;
    };

    monthsList.forEach((_, index) => {
      const months = monthsList.slice(0, index + 1);
      const amount = feePerMonth > 0 ? feePerMonth * months.length : 0;
      const label = months.map(m => { const [y, mo] = m.split('-'); return `T${parseInt(mo)}/${y}`; }).join(', ');
      const isAll = months.length === monthsList.length;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText = `width:100%;padding:11px 14px;border-radius:11px;border:2px solid ${isAll ? '#059669' : '#e2e8f0'};background:${isAll ? '#ecfdf5' : '#f8fafc'};cursor:pointer;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;transition:opacity .15s;`;
      btn.innerHTML = `<span style="font-weight:700;color:#1e293b;font-size:.88rem;">${months.length} tháng <span style="font-weight:500;color:#64748b;font-size:.78rem;">(${label})</span></span><span style="font-weight:900;color:${isAll ? '#059669' : '#0033A0'};font-size:.95rem;">${amount > 0 ? amount.toLocaleString('vi-VN') + ' ₫' : '(Tự nhập)'}</span>`;
      btn.onclick = async () => {
        if (amount <= 0) return window.showToast?.('⚠️ Chưa có học phí mặc định. Hãy dùng “Nhập số tiền tùy chỉnh”.', 3500);
        await runPayment(months, amount);
      };
      optionsEl.appendChild(btn);
    });

    const customBtn = document.createElement('button');
    customBtn.type = 'button';
    customBtn.style.cssText = 'width:100%;padding:9px 14px;border-radius:11px;border:1px dashed #cbd5e1;background:#fff;cursor:pointer;color:#64748b;font-weight:600;font-size:.82rem;margin-top:4px;';
    customBtn.textContent = '✏️ Nhập số tiền tùy chỉnh';
    customBtn.onclick = () => {
      if (modal.dataset.saving === 'true') return;
      customBtn.style.display = 'none';
      const row = document.createElement('div');
      row.style.cssText = 'margin-top:8px;display:flex;gap:8px;align-items:center;';
      row.innerHTML = `<input type="tel" id="qpm_custom_input" placeholder="Nhập số tiền (₫)..." style="flex:1;padding:9px 12px;border:1.5px solid #0033A0;border-radius:9px;font-size:.88rem;font-weight:700;outline:none;box-sizing:border-box;" value="${feePerMonth > 0 ? (feePerMonth * monthsList.length).toLocaleString('vi-VN') : ''}"/><button type="button" id="qpm_custom_ok" style="padding:9px 14px;background:#059669;color:#fff;border:none;border-radius:9px;font-weight:800;font-size:.85rem;cursor:pointer;white-space:nowrap;">✓ Thu</button>`;
      optionsEl.appendChild(row);
      const input = row.querySelector('#qpm_custom_input');
      const confirmPayment = async () => {
        const value = Number(String(input?.value || '').replace(/\D/g, ''));
        if (value <= 0) return window.showToast?.('⚠️ Số tiền không hợp lệ!', 2500);
        await runPayment(monthsList, value);
      };
      row.querySelector('#qpm_custom_ok').onclick = confirmPayment;
      input?.addEventListener('keypress', event => { if (event.key === 'Enter') void confirmPayment(); });
      input?.focus(); input?.select();
    };
    optionsEl.appendChild(customBtn);
    modal.dataset.saving = 'false';
    modal.style.display = 'flex';
  };
}
