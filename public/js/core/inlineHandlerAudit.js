/**
 * js/core/inlineHandlerAudit.js — Phase 4K-6I
 * Inline Handler Audit: đo số inline event handlers trong DOM
 * và cung cấp risk summary cho việc migrate sang event delegation.
 *
 * Không sửa bất kỳ handler nào — chỉ đọc và báo cáo.
 */

const INLINE_ATTRS = ['onclick','onchange','oninput','onblur','onfocus','onsubmit','onkeydown','onkeyup'];

const FORBIDDEN_ACTIONS = [
  'processMultiItem','processCombo','addNewStudent','saveClubSettings','saveEditInv',
  'saveEditExpense','createNewClubSystem','saDeleteTransactions','quickPay','deleteTx',
  'markInvPaid','cancelExamPayment','renderExamList','selectPaidStudents','processBatchUpgrade',
  'handleImportExcel','downloadExcelTemplate','exportAchievementsExcel','executeTaxExport',
  'executeExcelExport','handleLogin','submitChangePassword','bulkCheckIn','saveSessionNote',
  'exportAttendanceExcel','loadSuperAdminData','loadLoginHistory','loadSARevenue',
  'openNewClubModal','handleLogout'
];

export const InlineHandlerAudit = {
  /**
   * Đếm tất cả inline event handlers trong DOM hiện tại.
   * Trả về { total, byType, samples }
   */
  getInlineHandlerStats() {
    if (typeof document === 'undefined') {
      return { total: 0, byType: {}, samples: [], error: 'no DOM' };
    }
    const byType = {};
    INLINE_ATTRS.forEach(a => { byType[a] = 0; });
    const samples = [];
    let total = 0;

    const all = document.querySelectorAll('*');
    for (const el of all) {
      for (const attr of INLINE_ATTRS) {
        const hasAttr = el.hasAttribute(attr);
        const hasProp = typeof el[attr] === 'function';
        if (hasAttr || hasProp) {
          total++;
          byType[attr] = (byType[attr] || 0) + 1;
          if (samples.length < 50) {
            samples.push({
              tag: el.tagName,
              id: el.id || null,
              className: (el.className && typeof el.className === 'string')
                ? el.className.split(' ').filter(Boolean).slice(0, 3).join(' ')
                : null,
              attr,
              value: (el.getAttribute(attr) || '').substring(0, 80)
            });
          }
        }
      }
    }

    return { total, byType, samples };
  },

  /**
   * Đếm các element đang dùng data-action.
   * Trả về { total, byAction }
   */
  getDataActionStats() {
    if (typeof document === 'undefined') {
      return { total: 0, byAction: {}, error: 'no DOM' };
    }
    const elements = document.querySelectorAll('[data-action]');
    const byAction = {};
    for (const el of elements) {
      const action = el.dataset.action;
      byAction[action] = (byAction[action] || 0) + 1;
    }
    return { total: elements.length, byAction };
  },

  /**
   * Kiểm tra các vi phạm risk: data-action thuộc nhóm forbidden.
   * Trả về { forbiddenActionsInDOM, violations }
   */
  getMigrationRiskSummary() {
    if (typeof document === 'undefined') {
      return { forbiddenActionsInDOM: 0, violations: [], error: 'no DOM' };
    }
    const violations = [];
    const elements = document.querySelectorAll('[data-action]');
    for (const el of elements) {
      const action = el.dataset.action;
      if (FORBIDDEN_ACTIONS.includes(action)) {
        violations.push({
          action,
          tag: el.tagName,
          id: el.id || null,
          className: (el.className && typeof el.className === 'string')
            ? el.className.split(' ').filter(Boolean).slice(0, 2).join(' ')
            : null
        });
      }
    }
    return { forbiddenActionsInDOM: violations.length, violations };
  },

  /**
   * Khuyến nghị bước migrate tiếp theo.
   */
  getRecommendations() {
    const recs = [];
    if (typeof document === 'undefined') return recs;

    const stats = this.getInlineHandlerStats();

    if (stats.byType.onclick > 10) {
      recs.push({
        priority: 'medium',
        type: 'onclick',
        count: stats.byType.onclick,
        note: 'Còn nhiều onclick — review các nút UI-only để migrate tiếp'
      });
    }
    const focusTotal = (stats.byType.onfocus || 0) + (stats.byType.onblur || 0);
    if (focusTotal > 0) {
      recs.push({
        priority: 'low',
        type: 'onfocus/onblur',
        count: focusTotal,
        note: 'Dùng data-focus-border/data-blur-border pattern để thay thế'
      });
    }
    if (stats.byType.onchange > 5) {
      recs.push({
        priority: 'low',
        type: 'onchange',
        count: stats.byType.onchange,
        note: 'Kiểm tra onchange — chỉ migrate nếu không có business logic'
      });
    }

    const risk = this.getMigrationRiskSummary();
    if (risk.forbiddenActionsInDOM > 0) {
      recs.push({
        priority: 'critical',
        type: 'forbidden-data-action',
        count: risk.forbiddenActionsInDOM,
        note: 'CÓ data-action thuộc nhóm forbidden — phải gỡ ngay!'
      });
    }

    return recs;
  }
};
