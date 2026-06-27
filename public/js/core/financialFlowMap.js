/**
 * Phase 4K-6C-A — financialFlowMap.js
 * Financial Flow Authority Map — read-only audit tool.
 * Không thay đổi logic action. Chỉ dùng cho debug và kiểm tra trước migrate.
 */

const _ACTION_MAP = {
  quickPay: {
    label: 'Thu học phí nhanh',
    writes: ['transactions', 'profiles', 'fee_audit'],
    affects: ['tuition', 'debt', 'dashboard', 'receipt'],
    risk: 'high',
    migrateNow: false
  },
  processMultiItem: {
    label: 'Thu gộp khoản',
    writes: ['transactions', 'profiles', 'inventory'],
    affects: ['tuition', 'debt', 'exam', 'inventory', 'dashboard', 'receipt'],
    risk: 'very-high',
    migrateNow: false
  },
  quickCollectExam: {
    label: 'Thu lệ phí thi trực tiếp',
    writes: ['transactions'],
    affects: ['exam', 'dashboard', 'export'],
    risk: 'high',
    migrateNow: false
  },
  cancelExamPayment: {
    label: 'Hủy lệ phí thi',
    writes: ['transactions'],
    affects: ['exam', 'dashboard', 'export'],
    risk: 'very-high',
    migrateNow: false,
    warning: 'Cần xử lý transaction bundle/components trước khi guard.'
  },
  markInvPaid: {
    label: 'Đã thu nợ kho',
    writes: ['inventory', 'transactions?'],
    affects: ['inventory', 'dashboard', 'debt'],
    risk: 'high',
    migrateNow: false
  },
  inventorySale: {
    label: 'Xuất bán kho',
    writes: ['inventory', 'transactions'],
    affects: ['inventory', 'dashboard'],
    risk: 'high',
    migrateNow: false
  }
};

const _POST_WRITE_PLAN = {
  quickPay: {
    action: 'quickPay',
    refresh: ['transactions', 'profiles', 'students.debtList', 'tx.txList', 'dashboard.summary', 'dashboard.branchRevenue'],
    invalidate: ['students.debtList', 'tx.txList', 'dashboard']
  },
  processMultiItem: {
    action: 'processMultiItem',
    refresh: ['transactions', 'profiles', 'inventory', 'examLedger', 'students.debtList', 'tx.txList', 'inventory.inventoryList', 'dashboard.summary', 'dashboard.branchRevenue'],
    invalidate: ['students.debtList', 'tx.txList', 'inventory.inventoryList', 'inventory.uniformTxList', 'dashboard', 'exam']
  },
  quickCollectExam: {
    action: 'quickCollectExam',
    refresh: ['transactions', 'examLedger', 'examList', 'dashboard.branchRevenue'],
    invalidate: ['tx.txList', 'dashboard'],
    directRender: ['renderExamList']
  },
  cancelExamPayment: {
    action: 'cancelExamPayment',
    refresh: ['transactions', 'examLedger', 'examList', 'dashboard.branchRevenue'],
    invalidate: ['tx.txList', 'dashboard'],
    directRender: ['renderExamList'],
    warnings: ['Nếu transaction là bundle/components, không được xóa cả transaction nếu còn học phí/kho đồ.']
  },
  markInvPaid: {
    action: 'markInvPaid',
    refresh: ['inventory', 'transactions', 'dashboard.summary'],
    invalidate: ['inventory.inventoryList', 'dashboard']
  },
  inventorySale: {
    action: 'inventorySale',
    refresh: ['inventory', 'transactions', 'dashboard.summary'],
    invalidate: ['inventory.inventoryList', 'dashboard']
  }
};

export const FinancialFlowMap = {
  getActionMap() {
    return Object.assign({}, _ACTION_MAP);
  },

  getActionDependencies(actionName) {
    var entry = _ACTION_MAP[actionName];
    if (!entry) return null;
    return {
      writes: entry.writes ? entry.writes.slice() : [],
      affects: entry.affects ? entry.affects.slice() : []
    };
  },

  getActionRiskLevel(actionName) {
    var entry = _ACTION_MAP[actionName];
    return entry ? entry.risk : 'unknown';
  },

  getPostWriteExpectations(actionName) {
    var plan = _POST_WRITE_PLAN[actionName];
    return plan ? Object.assign({}, plan) : null;
  }
};
