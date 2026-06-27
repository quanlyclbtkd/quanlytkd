/**
 * utils/constants.js
 * ────────────────────────────────────────────────────────────────
 * Hằng số toàn cục — không phụ thuộc bất kỳ module nào khác.
 * Import ở bất kỳ đâu cần dùng.
 *
 * /// NEW ARCHITECTURE — trích từ app.js dòng 139, 158–167
 * ────────────────────────────────────────────────────────────────
 */

/** Firebase project ID */
export const FIREBASE_PROJECT_ID = 'quanly-tst';

/**
 * Map tab-id → danh sách DOM list element IDs cần clear khi switch tab.
 * Dùng bởi scheduleRender / renderApp để tránh render loop.
 */
export const TAB_LISTS = {
    tx:        ['txList'],
    debt:      ['debtList'],
    active:    ['activeList'],
    quit:      ['quitList'],
    inventory: ['uniformTxList', 'inventoryList'],
    expense:   ['expenseList'],
    exam:      ['examExpenseList'],
    dashboard: ['reportList'],
};

/**
 * Cấu hình CLB mặc định — sẽ bị ghi đè bởi dữ liệu từ Firestore
 * sau khi đăng nhập thành công.
 */
export const DEFAULT_CLUB_CONFIG = {
    bankId:      'AGRIBANK',
    accountNo:   '4300205305756',
    accountName: 'TRUONG SANH TINH - CLB TAEKWONDO TST',
    branchCount: 2,
    location:    'Quy Nhơn',
};

/** Danh sách đai theo thứ tự từ thấp đến cao */
export const BELT_ORDER = [
    'Đai trắng - Cấp 10',
    'Đai trắng vàng - Cấp 9',
    'Đai vàng - Cấp 8',
    'Đai vàng xanh - Cấp 7',
    'Đai xanh lá - Cấp 6',
    'Đai xanh lá xanh dương - Cấp 5',
    'Đai xanh dương - Cấp 4',
    'Đai xanh dương đỏ - Cấp 3',
    'Đai đỏ - Cấp 2',
    'Đai đỏ đen - Cấp 1',
    'Đai đen - 1 Đẳng',
    'Đai đen - 2 Đẳng',
    'Đai đen - 3 Đẳng',
];

/** Nhãn hiển thị cho từng status hồ sơ võ sinh */
export const STATUS_LABELS = {
    active: 'Đang học',
    quit:   'Đã nghỉ',
    pause:  'Tạm nghỉ',
};

/** Thời gian debounce render (ms) — tránh render quá nhiều lần */
export const RENDER_DEBOUNCE_MS = 250;
