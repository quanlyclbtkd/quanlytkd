/** Canonical finance UI adapters; write semantics live in existing owners. */

import {
    getLocalToday,
    formatDate,
    formatMonth,
    normalizeYYYYMM,
    formatMonthCompact,
} from "../utils/format.js?v=production-security-trust-boundary-release-assurance-20260816-v5u6h";
import { FinanceService } from "../services/finance.service.js?v=a9r18-fin-nontuition-r1-2b-20261103";
import { StudentService } from "../services/students.service.js?v=qr-v11r6-a9r18-usability-perf-r2r4-r6-20261029";
import { attachTransactionPageProjection } from './finance/finance.pagination.js?v=a9r18-qr-memo-r1-2d-20261103';
import { GlobalOwnershipRegistry } from '../core/globalOwnershipRegistry.js';

function _classifyInvTxForFinance(tx, cats) {
    const type   = String(tx && tx.type || '').trim();
    const amount = Number(tx && tx.amount || 0);
    const _cats  = Array.isArray(cats) ? cats : ['Võ phục', 'Áo thun', 'Bảo hộ'];
    for (const cat of _cats) {
        if (type === 'Thu ' + cat)  return { isInventory: true, direction: 'income',  amount };
        if (type === 'Chi ' + cat)  return { isInventory: true, direction: 'expense', amount };
        if (type === 'Tặng ' + cat) return { isInventory: true, direction: 'gift',    amount: 0 };
    }
    if (type === 'Võ phục')         return { isInventory: true, direction: 'income',  amount };
    const hasRelated = !!(tx && tx.relatedInvId);
    if (hasRelated) {
        if (type.startsWith('Thu '))  return { isInventory: true, direction: 'income',  amount };
        if (type.startsWith('Chi '))  return { isInventory: true, direction: 'expense', amount };
        if (type.startsWith('Tặng ')) return { isInventory: true, direction: 'gift',    amount: 0 };
    }
    return { isInventory: false, direction: '', amount: 0 };
}



/** Firestore db instance */
function _db()           { return (window.__store || {}).db; }
/** transactions collection ref của club hiện tại */
function _colRef()       { return (window.__store || {}).colRef; }
/** Club ID hiện tại */
function _clubId()       { return (window.__store || {}).clubId; }
/** Tất cả hồ sơ võ sinh (object {tên: profileData}) */
function _profiles()     { return (window.__store || {}).profiles || {}; }
/** Tất cả giao dịch đang cache trong bộ nhớ (sync bởi app.js sau mỗi query) */
function _transactions() { return (window.__store || {}).transactions || []; }
/** Inventory collection ref */
function _invRef()       { return (window.__store || {}).invRef; }
/** Club config (từ settings/main_config) */
function _config()       { return (window.__store || {}).clubConfig || {}; }
/** Club data (từ clubs/{id} doc — chứa clubName, parentCode, ...) */
function _clubData()     { return (window.__store || {}).clubData || {}; }
function _freshTuitionDecision(name, months) {
    const profile = _profiles()[name], canonical = window.TuitionDebtCanonical;
    if (!profile) throw new Error('[D1B] Không tìm thấy hồ sơ học phí hiện tại.');
    if (!canonical?.areTuitionMonthsSettled || !canonical?.reconcilePaidUntilFromMonthEvidence) throw new Error('[D1B] Tuition settlement authority chưa sẵn sàng.');
    const settlement = canonical.areTuitionMonthsSettled(profile, months, { name });
    const evidence = Array.from(new Set([...(Array.isArray(profile.paidMonths) ? profile.paidMonths : []), ...months]));
    return { profile, settlement, paidUntil: canonical.reconcilePaidUntilFromMonthEvidence(profile, evidence, { allowRegression: false }) };
}

function _guardAllowed(a,p){try{return typeof window.guardFinancialWriteIntent==='function'&&typeof window.isFinancialWriteAllowed==='function'&&window.isFinancialWriteAllowed(window.guardFinancialWriteIntent(a,p))===true}catch(_){return false}}
function _vMonth(v){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v||'').trim())}
function _validDate(v){const x=String(v||'').trim();if(!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(x))return false;const d=new Date(x+'T00:00:00');return !Number.isNaN(d.getTime())&&d.getFullYear()==+x.slice(0,4)&&d.getMonth()+1==+x.slice(5,7)&&d.getDate()==+x.slice(8,10)}
function _positiveAmount(v){const n=+v;return Number.isFinite(n)&&n>0?n:null}
function _profileKey(n,p){return String(p?.profileId||p?.id||p?.uid||p?.memberId||p?.memberID||p?.studentId||n||'').trim()}
function _sameBranch(a,b){try{if(window.BranchIdentity?.isSameBranch)return window.BranchIdentity.isSameBranch(a,b)}catch(_){}const n=v=>/^(mặc định|default|cs0?1)$/i.test(String(v||'').trim())?'CS1':String(v||'').trim().toUpperCase().replace(/\s+/g,'');return n(a)===n(b)}
function _finCtx(){return FinanceService.captureFinancialWriteContext?.()||null}
function _finCtxCurrent(c){return !!c&&FinanceService.isFinancialWriteContextCurrent?.(c)===true}
function _quickPayIntent(name,branch,profile,owedMonths){return Object.freeze({financialContext:_finCtx(),profileId:_profileKey(name,profile),branch:String(branch||profile?.branch||'CS1').trim()||'CS1',tuitionFee:Number(profile?.tuitionFee)||0,owedMonths:Object.freeze((owedMonths||[]).slice())})}
function _quickPayIntentState(i,name){if(!i||!_finCtxCurrent(i.financialContext))return{ok:false,code:'tuition/intent-context-stale'};const p=_profiles()[name]||{};if(_profileKey(name,p)!==i.profileId)return{ok:false,code:'tuition/intent-context-stale'};if(!_sameBranch(i.branch,p.branch||i.branch))return{ok:false,code:'tuition/intent-branch-stale'};if(Number(p.tuitionFee||0)!==Number(i.tuitionFee||0))return{ok:false,code:'tuition/intent-fee-stale'};return{ok:true,profile:p}}
function _staleTuitionToast(){window.showToast('⚠️ CLB hoặc dữ liệu học phí đã thay đổi. Khoản thu chưa được ghi. Vui lòng mở lại thao tác Thu.',5000)}
function _comboValidatedIntents(rows){const out=[],seen=new Set();for(const raw of rows){const studentName=String(raw.studentName||'').trim(),month=String(raw.month||'').trim(),hasAny=studentName!==''||String(raw.amountRaw??'').trim()!==''||month!=='';if(!hasAny)continue;
        const amount=_positiveAmount(raw.amountRaw),profile=_profiles()[studentName];if(!studentName||amount==null||!_vMonth(month)||!profile)throw Object.assign(new Error('Thu gộp không hợp lệ.'),{code:'combo/invalid-row'});
        const profileId=_profileKey(studentName,profile);if(!profileId||seen.has(profileId))throw Object.assign(new Error('Võ sinh bị trùng trong thu gộp.'),{code:'combo/duplicate-profile'});seen.add(profileId);out.push({profileId,studentName,amount,month,profile,order:raw.order})}if(!out.length)throw Object.assign(new Error('Chưa có khoản thu.'),{code:'combo/no-active-row'});return out}
function _detachFeeAudit(d){try{void Promise.resolve(FinanceService.addFeeAuditSilent(d)).catch(e=>console.warn('[fee-audit]',e))}catch(e){console.warn('[fee-audit]',e)}}

// Presentation only. The existing command, ACK and profile listener retain
// financial authority. Completion never depends on a timer or Debt readiness.
const _tuitionFeedbackTokens = new Set();
let _tuitionFeedbackNode = null;
let _tuitionFeedbackRevision = 0;
function _beginTuitionFeedback() {
    const token = {};
    _tuitionFeedbackTokens.add(token);
    _tuitionFeedbackRevision++;
    try {
        if (!_tuitionFeedbackNode && typeof document !== 'undefined' && document.body) {
            const node = document.createElement('div');
            node.id = 'tuitionWriteStatus';
            node.setAttribute('role', 'status');
            node.setAttribute('aria-live', 'polite');
            node.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom, 0px));width:fit-content;max-width:calc(100vw - 24px);margin:auto;padding:12px 16px;border-radius:12px;background:#0f172a;color:#fff;font-size:14px;line-height:1.5;box-shadow:0 4px 18px #0003;z-index:10050;pointer-events:none;';
            node.textContent = 'Đang xác minh và ghi khoản thu…';
            document.body.appendChild(node);
            _tuitionFeedbackNode = node;
        }
    } catch (error) { console.warn('[finance.js] Tuition feedback unavailable:', error); }
    return () => {
        _tuitionFeedbackTokens.delete(token);
        if (!_tuitionFeedbackTokens.size) {
            try { _tuitionFeedbackNode?.remove(); } catch (_) {}
            _tuitionFeedbackNode = null;
        }
    };
}
function _queueTuitionReceipt(name, result, expectedContext, revision) {
    // Invoke the existing receipt owner now so it captures the ACK's context.
    // Only its completion is detached; its QR validation and queue are intact.
    const current = () => _finCtxCurrent(expectedContext) && revision === _tuitionFeedbackRevision;
    const unavailable = error => {
        console.warn('[finance.js] Canonical payment preserved; receipt unavailable:', error);
        if (current()) window.showToast('✅ Đã thu học phí thành công. Biên lai chưa tạo được. Không thu lại khoản tiền này. Có thể xuất lại biên lai từ giao dịch đã lưu.', 6500);
    };
    // Preserve every valid request to the existing queue; revision scopes only
    // the adapter's late warning, not whether an acknowledged receipt is made.
    if (!_finCtxCurrent(expectedContext) || !window.exportReceipt) return;
    try {
        const breakdown = [{ label: 'Học phí ' + result.monthLabel, amount: result.amount }];
        const receipt = window.exportReceipt(name, result.amount, 'Học phí', result.txDate || getLocalToday(), result.paidMonths.join(','), result.branch, '', 'BIÊN LAI THU TIỀN', breakdown);
        void Promise.resolve(receipt).then(value => {
            if (value?.ok === false) unavailable(value.reason || value.error);
        }).catch(unavailable);
    } catch (error) { unavailable(error); }
}
/** @deprecated Phase 3.1 — Firebase calls đã chuyển sang FinanceService / StudentService */


/**
 * initFinance() — Đăng ký toàn bộ window functions tài chính.
 *
 * Gọi từ main.js SAU khi app.js đã chạy xong (window.__appLoaded = true).
 * Tất cả window.X bên dưới OVERRIDE những gì app.js đã set trước.
 * Đây là delegation pattern đã kiểm chứng từ Phase 2a–2d.
 */
export function openComboModal() {
    const modal = typeof document !== 'undefined' ? document.getElementById('comboModal') : null;
    if (!modal) return false;
    modal.style.display = 'flex';
    return true;
}

export function registerFinanceUiGlobals() {
    if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
    const result = GlobalOwnershipRegistry.register('openComboModal', openComboModal, {
        owner: 'js/modules/finance.js',
        risk: 'ui-only',
        policy: 'module-primary',
    });
    if (!result.ok) {
        console.warn('[4K-6S] openComboModal ownership registration failed:', result);
    }
    return result;
}

export function initFinance() {

    // Existing StudentService bridge.
    if (typeof window !== 'undefined') {
        window.StudentService = window.StudentService || StudentService;
    }

    // Báo nghỉ tháng.
    window.skipMonth = async (name, month) => {
        await window.StudentStatusCommandBoundary.addSkippedMonth(name, month);
        window.showToast?.('✅ Đã miễn phí tháng!');
    };

    window.removeSkip = async (name, month) => {
        if (window.userRole === 'viewer') return;
        if (!confirm(`Hủy báo nghỉ tháng ${formatMonth(month)} cho ${name}?`)) return;
        await window.StudentStatusCommandBoundary.removeSkippedMonth(name, month);
        if (typeof window.closeModal === 'function') window.closeModal('profileModal');
        window.showToast?.('✅ Đã khôi phục nợ!');
    };

    // Chọn báo nghỉ tháng hoặc nghỉ tập.
    window.handleQuitOption = (name, month) => {
        if (confirm(
            `Võ sinh ${name} có tiếp tục tập không?\n` +
            `- Bấm OK để báo NGHỈ TẬP luôn.\n` +
            `- Bấm Cancel để chỉ BÁO NGHỈ THÁNG NÀY (miễn học phí tháng ${formatMonth(month)}).`
        )) {
            const _quitData = { status: 'quit', quitDate: getLocalToday() };
            window.StudentStatusCommandBoundary.markQuit(name, _quitData.quitDate)
                .then(() => window.showToast?.('✅ Đã chuyển trạng thái Nghỉ tập!'))
                .catch(err => {
                    console.error('[handleQuitOption] markQuit failed:', err);
                    window.showToast?.('❌ Không chuyển được trạng thái nghỉ tập.');
                });
        } else {
            if (confirm(`Xác nhận miễn nợ học phí tháng ${formatMonth(month)} cho ${name}?`)) {
                window.skipMonth(name, month);
            }
        }
    };

    window.deleteTx = async (id, relatedInvId) => {
        if (window.userRole === 'viewer') return false;
        const txId=String(id||'').trim(), hint=String(relatedInvId||'').trim(), validTxId=!!txId&&txId!=='undefined'&&txId!=='null';
        const allTransactions=_transactions(), txToDelete=validTxId?allTransactions.find(t=>String(t?.id||'')===txId):null;
        if(validTxId&&!txToDelete){alert('Giao dịch đã thay đổi. Tải lại.');return false;}
        if(!validTxId){
            const previous=((window.__store||{}).inventory||window.allInventory||[]).find(r=>String(r?.id||'')===hint);
            if(!hint||hint==='undefined'||hint==='null'||!previous||previous.paidTxId||previous.paymentBundleId||previous.relatedTxId||!window.InventoryService?.deleteItem){alert('Không thể xóa mục Kho: dữ liệu/liên kết chưa an toàn.');return false;}
            if(!_guardAllowed('transaction.delete',{relatedInvId:hint,type:'inventory-row'}))return false;
            if(!confirm('Xóa mục Kho này?'))return false;
            try{await window.InventoryService.deleteItem(hint,{previous,reason:'inventory-row-delete-no-finance-tx'});window.showToast?.('✅ Đã xóa!');return true;}catch(error){console.error('[finance.js] inventory delete lỗi:',error);alert('Không thể xóa mục Kho.');return false;}
        }
        const impact = window.TransactionDeleteIntegrity
            ? window.TransactionDeleteIntegrity.analyzeTransactionDeleteImpact(txToDelete)
            : null;
        const refs=Array.isArray(impact?.inventoryRefs)?impact.inventoryRefs:[];
        if(impact?.hasInventory&&hint&&refs.length&&!refs.includes(hint)){alert('Liên kết Kho đã thay đổi. Vui lòng tải lại.');return false;}
        if (impact && !impact.safeToHardDelete) {
            const mixedMessage=impact.isMixedBundle?'Giao dịch Học phí + Kho không thể xóa trực tiếp.':'Giao dịch chưa đủ dữ liệu rollback an toàn.';
            alert(mixedMessage+'\nLý do: '+(impact.blockers||[]).join(', '));
            return false;
        }
        let confirmMsg = '⚠️ Bạn có chắc muốn xóa giao dịch này?';
        if (impact && impact.hasTuition && impact.tuitionMonths.length > 0) {
            const monthLabels = impact.tuitionMonths.map(m => {
                const parts = m.split('-');
                return parts.length === 2 ? parts[1] + '/' + parts[0] : m;
            }).join(', ');
            confirmMsg =
                'Giao dịch này có học phí tháng: ' + monthLabels + '.\n' +
                'Sau khi xóa, hệ thống sẽ cập nhật lại trạng thái học phí của võ sinh.\n' +
                'Bạn chắc chắn muốn xóa?';
        }
        if (!confirm(confirmMsg)) return false;
        const activeTabBeforeDelete = typeof window.getCurrentActiveTabId === 'function'
            ? window.getCurrentActiveTabId()
            : '';
        const isTuitionOnly = impact?.isPureTuition === true;
        const genericAuditPayload={txId,relatedInvId:relatedInvId||'',type:txToDelete.type||'',amount:Number(txToDelete.amount)||0,studentName:txToDelete.studentName||txToDelete.description||''};
        const ctx=!isTuitionOnly?_finCtx():null;let intent;
        if (!isTuitionOnly) {
            try {
                if (typeof window.guardFinancialWriteIntent !== 'function'
                    || typeof window.isFinancialWriteAllowed !== 'function'
                    || !_finCtxCurrent(ctx)
                    || window.isFinancialWriteAllowed(intent=window.guardFinancialWriteIntent('transaction.delete', genericAuditPayload)) !== true) return false;
            } catch (_) { return false; }
        }
        if (!isTuitionOnly) window.recordFinancialActionAudit?.('transaction.delete', 'before', genericAuditPayload,{intent:intent});
        let tuitionDeleteResult = null;
        try {
            if (isTuitionOnly) {
                if (!window.TuitionCommandBoundary?.deleteTuitionTransaction) throw new Error('[V5U-2] TuitionCommandBoundary chưa sẵn sàng.');
                tuitionDeleteResult = await window.TuitionCommandBoundary.deleteTuitionTransaction({ txId: txId, transaction: txToDelete, impact, source: 'finance.deleteTx' });
                if (tuitionDeleteResult?.cancelled) return false;
            } else if(impact?.isPureInventory===true){
                if(refs.length!==1)throw new Error('[F1D1] Inventory ref không an toàn.');
                const invId=refs[0], previous=((window.__store||{}).inventory||window.allInventory||[]).find(r=>String(r?.id||'')===invId);
                if(!previous||!window.InventoryService?.deleteItem)throw new Error('[F1D1] Inventory local owner chưa sẵn sàng.');
                if(!_finCtxCurrent(ctx))return false;
                await window.InventoryService.deleteItem(invId,{previous,relatedTxId:txId,reason:'finance-delete-pure-inventory-atomic'});
            } else {
                const runGenericDelete = async () => {
                    if (impact?.requiresProfileReconcile && impact.studentName) throw Object.assign(new Error('Giao dịch có ảnh hưởng học phí phải đi qua Tuition delete owner.'),{code:'tuition/delete-owner-required'});
                    await FinanceService.deleteTransaction(txId,{expectedContext:ctx});
                };
                if(impact?.hasInventory)throw new Error('[F1D1] Inventory delete chưa có atomic owner.');
                if (impact?.requiresProfileReconcile && impact.studentName) {
                    const laneOwner = window.TuitionCommandBoundary;
                    if (!laneOwner?.runInProfileTuitionMutationLane) throw new Error('[F1D] Tuition lane unavailable.');
                    await laneOwner.runInProfileTuitionMutationLane({ studentName: impact.studentName, reason: 'finance.generic-delete' }, runGenericDelete);
                } else await runGenericDelete();
            }
            if(!isTuitionOnly){
                window.recordFinancialActionAudit?.('transaction.delete','after',genericAuditPayload,{intent:intent});
                if(!_finCtxCurrent(ctx)){window.showToast?.('✅ Đã xóa. Không xóa lại.',7000);return true}
                if(impact?.isPureInventory){window.invalidateDashboard?.('delete-pure-inventory-existing-owner');window.invalidateList?.('tx.txList','delete-pure-inventory-existing-owner')}
                else{if(impact?.requiresExamRefresh&&typeof window.renderExamList==='function')window.renderExamList();window.invalidateDashboard?.('delete-transaction-existing-owner');window.invalidateList?.('tx.txList','delete-transaction-existing-owner');window.invalidateList?.('students.debtList','delete-transaction-existing-owner')}
            }
            if(tuitionDeleteResult?.transactionDeleted===true&&tuitionDeleteResult?.profileReconcileVerified===false)window.showToast?.('⚠️ Giao dịch đã được xóa. Hệ thống chưa hạ trạng thái học phí vì chưa xác minh đủ các giao dịch còn lại. Không cần xóa lại giao dịch.','error');
            else window.showToast('✅ Đã xóa!');
            if (activeTabBeforeDelete === 'tx' && typeof window.getCurrentActiveTabId === 'function'
                && window.getCurrentActiveTabId() === 'debt' && typeof window.switchTab === 'function') {
                window.switchTab('tx');
            }
            return true;
        } catch (error) {
            const denied = error && (
                error.code === 'permission-denied' ||
                /insufficient permissions|chưa được Firestore Rules cấp quyền/i.test(error.message || '')
            );
            if (!isTuitionOnly) window.recordFinancialActionAudit?.('transaction.delete','error',{...genericAuditPayload,error:error?.message||String(error)},{intent:intent});
            console.error('[deleteTx] failed:', error);
            if (denied) {
                window.showToast?.('❌ Firestore Rules chưa cấp quyền xóa giao dịch cho Admin. Hãy deploy Rules của bản V5U-1/V5U-2.', 'error');
            } else if (error?.partialWrite === true && error?.transactionDeleted === true) {
                window.showToast?.('⚠️ Giao dịch đã được xóa nhưng hồ sơ học phí chưa đối chiếu xong. Hệ thống đã làm mới dữ liệu; không bấm Xóa lại.', 'error');
            } else {
                window.showToast?.('❌ Không xóa được giao dịch. Dữ liệu chưa bị thay đổi.', 'error');
            }
            if (activeTabBeforeDelete === 'tx' && typeof window.getCurrentActiveTabId === 'function'
                && window.getCurrentActiveTabId() === 'debt' && typeof window.switchTab === 'function') {
                window.switchTab('tx');
            }
            return false;
        }
    };
    // monthsStr xác định chính xác kỳ học phí cần settlement; amount là số tiền thực thu; không suy số tháng từ amount.
    window.quickPay = async (name, monthsStr, branch, defaultFee, skipPrompt, intentSnapshot = null) => {
        if (window.userRole === 'viewer') { window.showToast('⚠️ Tài khoản khách không thể thu tiền!', 3000); return false; }
        const cleanName=String(name||'').replace(/\\'/g,"'").trim(),monthsList=monthsStr?monthsStr.split(',').map(s=>s.trim()).filter(Boolean):[],monthLabel=formatMonthCompact(monthsList.join(','));
        const currentProfile=_profiles()[cleanName]||{},intent=intentSnapshot||_quickPayIntent(cleanName,branch,currentProfile,monthsList),intentState=_quickPayIntentState(intent,cleanName);
        if(!intentState.ok){_staleTuitionToast();return false;}
        let amount;
        if(skipPrompt&&defaultFee&&Number(String(defaultFee).replace(/\D/g,''))>0)amount=Number(String(defaultFee).replace(/\D/g,''));
        else{const d=defaultFee?parseInt(defaultFee,10).toLocaleString('vi-VN'):'0',input=prompt(`XÁC NHẬN THU HỌC PHÍ\nVõ sinh: ${cleanName}\nKỳ học phí: ${monthLabel}\n\nNhập số tiền thu (VNĐ):`,d);if(input===null)return false;amount=Number(input.replace(/\D/g,''));if(amount<=0){window.showToast('⚠️ Số tiền không hợp lệ!',2500);return false;}}
        const endFeedback = _beginTuitionFeedback(), receiptRevision = _tuitionFeedbackRevision;
        try{
            if(!window.TuitionCommandBoundary?.collectTuition)throw new Error('[V5U-2] TuitionCommandBoundary chưa sẵn sàng.');
            const result=await window.TuitionCommandBoundary.collectTuition({studentName:cleanName,months:monthsList,branch:branch||'CS1',amount,source:'finance.quickPay',expectedContext:intent.financialContext,intentProfileId:intent.profileId,tuitionFeeSnapshot:intent.tuitionFee});
            if(!result||result.cancelled||result.ok===false){if(/context-stale|intent-/.test(String(result?.reason||'')))_staleTuitionToast();else if(_finCtxCurrent(intent.financialContext))window.showToast('⚠️ Khoản thu chưa được thực hiện. Chưa xác minh được dữ liệu hoặc kỳ học phí không còn hợp lệ. Vui lòng kiểm tra lại trước khi thu.',6000);return false;}
            if(result.alreadySettled===true&&!result.txId){window.showToast('ℹ️ Khoản học phí này đã được ghi nhận là đã đóng. Không thu thêm tiền. Hãy dùng giao dịch đã lưu để In lại biên lai.',6500);return true;}
            if(result.primaryCommitted===true&&(result.postCommitContextCurrent===false||!_finCtxCurrent(intent.financialContext))){window.showToast('✅ Khoản thu đã được ghi thành công tại CLB trước. Phiên hiện tại đã thay đổi nên dữ liệu hiển thị/biên lai chưa được cập nhật tại màn hình này. Không thu lại khoản tiền này.',7500);return true;}
            const monthsLabel=result.paidMonths.map(m=>{const[y,mo]=String(m).split('-');return`tháng ${parseInt(mo,10)}/${y}`}).join(', ');
            window.showToast(result.completedReplay?'ℹ️ Khoản học phí này đã được thu. Đang mở lại biên lai, không thu thêm tiền.':(result.paidMonths.length>1?`✅ ${cleanName} đóng học phí ${monthsLabel} (${result.paidMonths.length} tháng)!`:`✅ ${cleanName} đóng học phí ${monthsLabel}!`));
            _queueTuitionReceipt(cleanName, result, intent.financialContext, receiptRevision);
            return true;
        }catch(error){console.error('[finance.js] quickPay lỗi:',error);if(error?.code==='finance/write-context-stale'){_staleTuitionToast();return false;}if(error?.partialWrite===true)window.showToast('⚠️ Giao dịch đã được ghi nhưng hồ sơ học phí chưa cập nhật. Hệ thống đã làm mới dữ liệu để đối chiếu.',5000);else window.showToast('⚠️ Lỗi hệ thống, vui lòng thử lại!',4000);return false;}
        finally { endFeedback(); }
    };

    window.openQuickPayModal = (name, owedMonthsStr, branch) => {
        if(window.userRole==='viewer'){window.showToast('⚠️ Tài khoản khách không thể thu tiền!',3000);return;}
        const cleanName=String(name||'').replace(/\\'/g,"'"),monthsList=owedMonthsStr?owedMonthsStr.split(',').map(s=>s.trim()).filter(Boolean):[],profile=_profiles()[cleanName]||{},feePerMonth=Number(profile.tuitionFee)||0,totalMonths=monthsList.length,modal=document.getElementById('quickPayModal');
        const intent=_quickPayIntent(cleanName,branch,profile,monthsList);
        if(!modal){window.showToast('⚠️ Bộ chọn kỳ học phí chưa sẵn sàng. Vui lòng tải lại màn hình trước khi thu.',5000);return false;}
        let submitInProgress=false;const beginSubmit=()=>{if(submitInProgress)return false;submitInProgress=true;try{modal.setAttribute?.('aria-busy','true');document.getElementById('qpm_options')?.querySelectorAll?.('button').forEach(b=>{b.disabled=true})}catch(_){}return true},endSubmit=()=>{submitInProgress=false;try{modal.removeAttribute?.('aria-busy')}catch(_){}};
        const fresh=()=>{const x=_quickPayIntentState(intent,cleanName);if(!x.ok)_staleTuitionToast();return x.ok};
        document.getElementById('qpm_name').textContent=`${cleanName} — ${totalMonths} tháng chưa nộp`;const optionsEl=document.getElementById('qpm_options');optionsEl.innerHTML='';
        for(let i=1;i<=totalMonths;i++){const months=monthsList.slice(0,i),amount=feePerMonth>0?feePerMonth*i:0,monthsStr=months.join(','),label=months.map(m=>{const p=m.split('-');return`T${parseInt(p[1])}/${p[0]}`}).join(', '),isAll=i===totalMonths,btn=document.createElement('button');btn.type='button';btn.style.cssText=`width:100%;padding:11px 14px;border-radius:11px;border:2px solid ${isAll?'#059669':'#e2e8f0'};background:${isAll?'#ecfdf5':'#f8fafc'};cursor:pointer;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;`;btn.innerHTML=`<span style="font-weight:700;color:#1e293b;font-size:0.88rem;">${i} tháng <span style="font-weight:500;color:#64748b;font-size:0.78rem;">(${label})</span></span><span style="font-weight:900;color:${isAll?'#059669':'#0033A0'};font-size:0.95rem;">${amount>0?amount.toLocaleString('vi-VN')+' ₫':'(Tự nhập)'}</span>`;btn.onclick=async()=>{if(!fresh()||!beginSubmit())return;modal.style.display='none';try{await window.quickPay(cleanName,monthsStr,branch,String(amount||feePerMonth*i),true,intent)}finally{endSubmit()}};optionsEl.appendChild(btn)}
        const customBtn=document.createElement('button');customBtn.type='button';customBtn.style.cssText='width:100%;padding:9px 14px;border-radius:11px;border:1px dashed #cbd5e1;background:#fff;cursor:pointer;color:#64748b;font-weight:600;font-size:0.82rem;margin-top:4px;';customBtn.textContent='✏️ Nhập số tiền tùy chỉnh';customBtn.onclick=()=>{customBtn.style.display='none';const row=document.createElement('div');row.style.cssText='margin-top:8px;display:grid;grid-template-columns:1fr;gap:7px;';const opts=monthsList.map((_,i)=>{const ms=monthsList.slice(0,i+1),label=ms.map(m=>{const p=m.split('-');return`T${parseInt(p[1])}/${p[0]}`}).join(', ');return`<option value="${i+1}">${i+1} tháng — ${label}</option>`}).join('');row.innerHTML=`<select id="qpm_custom_months" style="padding:9px 12px;border:1.5px solid #0033A0;border-radius:9px;font-weight:700;"><option value="">-- Chọn số tháng --</option>${opts}</select><div style="display:flex;gap:8px;"><input type="tel" id="qpm_custom_input" placeholder="Số tiền thực thu (₫)..." style="flex:1;padding:9px 12px;border:1.5px solid #0033A0;border-radius:9px;font-size:0.88rem;font-weight:700;outline:none;box-sizing:border-box;"/><button type="button" id="qpm_custom_ok" style="padding:9px 14px;background:#059669;color:#fff;border:none;border-radius:9px;font-weight:800;font-size:0.85rem;cursor:pointer;white-space:nowrap;">✓ Thu</button></div>`;optionsEl.appendChild(row);const inp=document.getElementById('qpm_custom_input'),sel=document.getElementById('qpm_custom_months');inp?.focus?.();sel?.addEventListener?.('change',()=>{const c=Number(sel.value)||0;if(c>0&&feePerMonth>0&&!String(inp.value||'').replace(/\D/g,''))inp.value=(feePerMonth*c).toLocaleString('vi-VN')});const doConfirm=async()=>{const count=Number(sel?.value)||0,v=Number(String(inp?.value||'').replace(/\D/g,''));if(!count){window.showToast('⚠️ Vui lòng chọn số tháng cần thu.',3000);return}if(!v||v<=0){window.showToast('⚠️ Số tiền không hợp lệ!',2500);return}if(!fresh()||!beginSubmit())return;modal.style.display='none';try{await window.quickPay(cleanName,monthsList.slice(0,count).join(','),branch,String(v),true,intent)}finally{endSubmit()}};document.getElementById('qpm_custom_ok').onclick=doConfirm;inp?.addEventListener?.('keypress',ev=>{if(ev.key==='Enter')doConfirm()})};optionsEl.appendChild(customBtn);modal.style.display='flex';return true;
    };

    /** Thu lệ phí thi theo võ sinh và cơ sở. */
    window.quickCollectExam = async (name, branch) => {
        if (window.quickCollectExam.__inFlight) return false;
        window.quickCollectExam.__inFlight = true;
        try {
            name = String(name || '').trim();
            const profile = _profiles()[name];
            const month = String(document.getElementById('filterMonth')?.value || getLocalToday().slice(0, 7)).trim();
            if (!_clubId() || !profile || !_vMonth(month)
                || typeof window.buildCanonicalExamPaymentLedger !== 'function'
                || typeof window.mergeTransactionIntoRuntimeStore !== 'function') return false;

            const paid = () => {
                const st = window.__store || {};
                const rows = [
                    ...(Array.isArray(st.allTransactions) ? st.allTransactions : []),
                    ...(Array.isArray(st.transactions) ? st.transactions : []),
                ];
                return !!window.buildCanonicalExamPaymentLedger({ month, transactions: rows })?.byName?.[name];
            };
            if (paid()) {
                window.showToast('ℹ️ Võ sinh đã nộp lệ phí thi kỳ này.');
                return false;
            }

            const displayName = window.ProfileCanonicalStore?.resolveDisplayName?.(name, profile)
                || String(profile.displayName || profile.name || profile.fullName || profile.studentName || name).trim();
            const curBelt = profile.belt || 'Đai trắng - Cấp 10';
            const nextBelt = window.BELT_NEXT?.[curBelt] || curBelt;
            const title = `Thi lên ${nextBelt}`;
            const feeEl = document.getElementById('exam_fee_all_actual');
            const suggested = window.getClubExamFee?.() || feeEl?.value || 250000;
            const input = prompt(`Nhập lệ phí thi của ${displayName}:`, suggested);
            if (input == null || !/^[\d.,\s]+$/.test(String(input).trim())) return false;

            const amount = Number(String(input).replace(/[.,\s]/g, ''));
            if (!displayName || !title || _positiveAmount(amount) == null
                || !_guardAllowed('exam.collect', { amount, profileId: name, month })) return false;

            const ctx = _finCtx();
            if (!_finCtxCurrent(ctx)) return false;
            const examDecision = await FinanceService.requireExamUnpaidForWrite({
                profile,
                studentName: name,
                month,
                reason: 'finance.quickCollectExam',
            });
            if (examDecision.status === 'PAID') {
                window.showToast('ℹ️ Võ sinh đã nộp lệ phí thi kỳ này.');
                return false;
            }

            const today = getLocalToday();
            const todayMonth = today.slice(0, 7);
            const date = month === todayMonth ? today : (month < todayMonth ? month + '-28' : month + '-01');
            if (!_finCtxCurrent(ctx)) return false;

            await FinanceService.addTransaction({
                branch: branch || profile.branch || 'CS1',
                type: 'Lệ phí thi',
                description: `${displayName} (${title})`,
                studentName: displayName,
                profileName: displayName,
                profileId: name,
                amount,
                date,
                txMonth: month,
                examTitle: title,
                currentBeltAtPayment: curBelt,
                examTargetBelt: nextBelt,
                timestamp: Date.now(),
            });
            if (!_finCtxCurrent(ctx)) {
                window.showToast('✅ Lệ phí thi đã ghi tại CLB trước. Phiên đã đổi; không thu lại.', 7000);
                return true;
            }
            window.showToast(`✅ Đã thu lệ phí thi cho ${displayName}!`);
            window.renderExamList?.();
            return true;
        } catch (error) {
            console.error('[finance.js] quickCollectExam failed:', error);
            window.showToast('❌ Chưa lưu được lệ phí thi.');
            return false;
        } finally {
            window.quickCollectExam.__inFlight = false;
        }
    };


    /** Ghi hai khoản học phí hoặc xuất phiếu báo. */
    window.processCombo = async (action) => {
        const rows=[0,1].map(order=>({order,studentName:((document.getElementById('combo_name'+(order+1))||{}).value||'').trim(),amountRaw:(document.getElementById('combo_fee'+(order+1)+'_actual')||{}).value,month:(document.getElementById('combo_month'+(order+1))||{}).value||''}));
        let intents;try{intents=_comboValidatedIntents(rows)}catch(error){window.showToast(error.message);return false}
        const combinedNameStr=intents.map(x=>x.studentName).join(' & '),combinedMonthStr=Array.from(new Set(intents.map(x=>x.month))).join(', '),totalAmt=intents.reduce((sum,x)=>sum+x.amount,0);
        if(action==='report'){try{if(typeof window.exportReceipt!=='function')throw new Error('Chức năng xuất phiếu chưa sẵn sàng.');const branches=intents.map(x=>String(x.profile?.branch||'').trim());if(branches.some(b=>!b))throw new Error('Chưa xác định cơ sở của từng võ sinh.');
            const breakdown=intents.map(x=>({kind:'tuition',familyParticipant:true,studentName:x.studentName,participantKey:x.profileId,memberId:x.profile?.memberId,memberID:x.profile?.memberID,studentId:x.profile?.studentId,packageMonths:[x.month],amount:x.amount,label:`Học phí ${x.studentName} — T${Number(x.month.slice(5))}/${x.month.slice(0,4)}`}));
            const receiptResult=await window.exportReceipt(combinedNameStr,totalAmt,'Học phí',getLocalToday(),combinedMonthStr,branches,'Gộp gia đình','PHIẾU BÁO HỌC PHÍ',breakdown);if(!receiptResult?.ok)throw new Error('QR/phiếu báo chưa sẵn sàng.');const modal=document.getElementById('comboModal');if(modal)modal.style.display='none';return true}catch(error){window.showToast('❌ Không tạo được phiếu gộp: '+error.message);return false}}
        if(action!=='pay')return false;if(!_guardAllowed('tuition.familyCombo',{total:totalAmt,studentNames:intents.map(x=>x.studentName),months:intents.map(x=>x.month)})){window.showToast('⚠️ Không được phép thu gộp.');return false}if(window.processCombo.__atomicInFlight===true)return window.showToast('⏳ Giao dịch thu gộp đang được xử lý.');
        const expectedContext=_finCtx();if(!_finCtxCurrent(expectedContext)){_staleTuitionToast();return false}window.processCombo.__atomicInFlight=true;
        try{const laneOwner=window.TuitionCommandBoundary;if(!laneOwner?.runInProfileTuitionMutationLanes||!laneOwner?.commitLocalTuitionPaymentState)throw new Error('[D1C] Tuition owner chưa sẵn sàng.');
            const result=await laneOwner.runInProfileTuitionMutationLanes({profiles:intents.map(x=>({studentName:x.studentName,profileId:x.profileId})),reason:'finance.processCombo'},async()=>{if(!_finCtxCurrent(expectedContext))throw Object.assign(new Error('Financial write context stale'),{code:'finance/write-context-stale'});const decisions=await Promise.all(intents.map(x=>laneOwner.requireTuitionUnpaidForWrite({profile:_profiles()[x.studentName],studentName:x.studentName,targetMonths:[x.month],reason:'finance.processCombo',expectedContext})));if(!_finCtxCurrent(expectedContext))throw Object.assign(new Error('Financial write context stale'),{code:'finance/write-context-stale'});if(decisions.some(d=>d.status==='PAID'))return{stale:true};const latest=intents.map((x,i)=>{const profile=decisions[i].profile||_profiles()[x.studentName]||x.profile;return{...x,profile,settlement:decisions[i].settlement,paidUntil:decisions[i].paidUntil}}),today=getLocalToday(),todayM=today.substring(0,7),transactions=[],profileUpdates=[],audits=[];for(const row of latest){const branch=String(row.profile.branch||'CS1'),date=row.month<todayM?row.month+'-01':today;transactions.push({data:{branch,type:'Học phí',description:row.studentName,amount:row.amount,date,txMonth:row.month,packageMonths:[row.month],timestamp:Date.now()+row.order},reason:'family-pay-student-'+(row.order+1)});profileUpdates.push({studentName:row.studentName,data:{paidUntil:row.paidUntil,paidMonths:FinanceService._arrayUnion(row.month)}});audits.push({studentId:row.studentName,amount:row.amount,date:today,type:'tuition',month:row.paidUntil,months:[row.month],by:window.currentUserEmail||'admin',timestamp:Date.now()+row.order})}const atomic=await FinanceService.commitAtomicWritePlan({expectedContext,transactions,profileUpdates}),postCommitContextCurrent=_finCtxCurrent(expectedContext);if(postCommitContextCurrent)latest.forEach(row=>laneOwner.commitLocalTuitionPaymentState({studentName:row.studentName,paidUntil:row.paidUntil,paidMonths:[row.month],reason:'finance.processCombo'}));return{ok:true,atomic,audits,receiptBranch:String(latest[0]?.profile?.branch||'CS1'),postCommitContextCurrent,primaryCommitted:true}});
            if(result?.stale){window.showToast('⚠️ Dữ liệu học phí vừa thay đổi. Vui lòng xác nhận lại giao dịch gộp.');return false}if(result?.primaryCommitted&&(result.postCommitContextCurrent===false||!_finCtxCurrent(expectedContext))){window.showToast('✅ Khoản thu gộp đã được ghi tại CLB trước. Phiên hiện tại đã thay đổi; không thu lại khoản tiền này.',7000);return true}window.showToast('✅ Đã ghi sổ gộp thành công!');window.exportReceipt?.(combinedNameStr,totalAmt,'Học phí',getLocalToday(),combinedMonthStr,result.receiptBranch,'Gộp gia đình','BIÊN LAI THU TIỀN');for(const audit of result.audits)_detachFeeAudit(audit);const modal=document.getElementById('comboModal');if(modal)modal.style.display='none';return true;
        }catch(error){console.error('[finance.js] processCombo lỗi:',error);if(error?.code==='finance/write-context-stale'){_staleTuitionToast();return false}window.showToast(error?.code==='finance/atomic-plan-too-large'?'⚠️ Thao tác vượt giới hạn an toàn, chưa có dữ liệu nào được ghi.':'❌ Lỗi khi xử lý thu gộp!');return false}finally{window.processCombo.__atomicInFlight=false}
    };

    // Phase 4K-6S: openComboModal is registered once by registerFinanceUiGlobals().


    // ════════════════════════════════════════════════════════════════
    // 10. saveTx — Form thu tiền chính (transactionForm.onsubmit)
    /** Form thu tiền: Tuition updates only canonical paid fields. */
    const _txFormEl = document.getElementById('transactionForm');
    if (_txFormEl) _txFormEl.onsubmit = async (e) => {
        e.preventDefault();
        if (_txFormEl.dataset.atomicSubmitInFlight === '1') return window.showToast('⏳ Khoản thu đang được lưu.');

        const config = _config();
        const type = document.getElementById('type').value;
        const name = document.getElementById('description').value.trim();
        const amount = Number(document.getElementById('amountActual').value);
        const date = String(document.getElementById('date').value || '').trim();
        const branch = config.branchCount === 1 ? 'Mặc định' : document.getElementById('branch').value;
        const isTuition = type === 'Học phí' || type === 'Học phí + Lệ phí thi';
        const pkgEl = document.getElementById('tx_package');
        const rawPkg = String(pkgEl?.value || '').trim();
        const packageCount = Number(rawPkg);
        const allowedPkgs = new Set(
            Array.from(pkgEl?.options || []).map(o => Number(o.value)).filter(n => Number.isInteger(n) && n > 0)
        );
        const typeOptions = Array.from(document.getElementById('type')?.options || []).map(o => o.value);
        const branchOptions = Array.from(document.getElementById('branch')?.options || []).map(o => o.value);

        if (!['Học phí', 'Học phí + Lệ phí thi', 'Thu khác'].includes(type)
            || (typeOptions.length > 0 && !typeOptions.includes(type))
            || !name || _positiveAmount(amount) == null || !_validDate(date) || !branch
            || (config.branchCount !== 1 && branchOptions.length > 0 && !branchOptions.includes(branch))) {
            window.showToast('⚠️ Khoản thu không hợp lệ.');
            return false;
        }
        if (isTuition && (_positiveAmount(amount) == null || !_validDate(date)
            || !Number.isInteger(packageCount) || !allowedPkgs.has(packageCount))) {
            window.showToast('⚠️ Dữ liệu học phí không hợp lệ.');
            return false;
        }

        const txMonth = _validDate(date) ? date.slice(0, 7) : '';
        if (isTuition && !_vMonth(txMonth)) return false;
        const examAmount = type === 'Học phí + Lệ phí thi'
            ? Number(document.getElementById('tx_exam_amountActual').value) : 0;
        const examTitle = type === 'Học phí + Lệ phí thi'
            ? String(document.getElementById('tx_exam_title').value || '').trim() : '';
        if (type === 'Học phí + Lệ phí thi' && (_positiveAmount(examAmount) == null || !examTitle)) {
            window.showToast('⚠️ Lệ phí thi không hợp lệ.');
            return false;
        }
        if (isTuition && !_guardAllowed('tuition.transactionForm', {
            amount,
            studentName: name,
            month: txMonth,
            packageCount,
        })) {
            window.showToast('⚠️ Không được phép thu học phí.');
            return false;
        }
        if (!isTuition && !_guardAllowed('transaction.otherIncome', { amount, description: name, date })) {
            window.showToast('⚠️ Không được phép ghi khoản thu.');
            return false;
        }

        const ctx = _finCtx();
        if (!_finCtxCurrent(ctx)) {
            if (isTuition) _staleTuitionToast();
            return false;
        }
        _txFormEl.dataset.atomicSubmitInFlight = '1';
        const endFeedback = isTuition ? _beginTuitionFeedback() : () => {};
        try {
            const monthsToRecord = [];
            if (isTuition) {
                let [y, m] = txMonth.split('-').map(Number);
                for (let i = 0; i < packageCount; i++) {
                    let mm = m + i, yy = y;
                    while (mm > 12) { mm -= 12; yy++; }
                    monthsToRecord.push(`${yy}-${String(mm).padStart(2, '0')}`);
                }
            }

            let txData = {
                branch,
                type,
                description: name,
                date,
                timestamp: Date.now(),
                amount: type === 'Học phí + Lệ phí thi' ? amount + examAmount : amount,
            };
            if (monthsToRecord.length) {
                const laneOwner = window.TuitionCommandBoundary;
                if (!laneOwner?.runInProfileTuitionMutationLane || !laneOwner?.commitLocalTuitionPaymentState)
                    throw new Error('[D1C] Tuition owner chưa sẵn sàng.');

                const result = await laneOwner.runInProfileTuitionMutationLane({
                    studentName: name,
                    reason: 'finance.transactionForm',
                }, async () => {
                    if (!_finCtxCurrent(ctx))
                        throw Object.assign(new Error('Financial write context stale'), { code: 'finance/write-context-stale' });
                    const tuitionDecision = await laneOwner.requireTuitionUnpaidForWrite({
                        profile: _profiles()[name],
                        studentName: name,
                        targetMonths: monthsToRecord,
                        reason: 'finance.transactionForm',
                        expectedContext: ctx,
                    });
                    if (tuitionDecision.status === 'PAID')
                        return { alreadySettled: true, settlement: tuitionDecision.settlement };
                    if (!_finCtxCurrent(ctx))
                        throw Object.assign(new Error('Financial write context stale'), { code: 'finance/write-context-stale' });

                    const freshProfile = tuitionDecision.profile || _profiles()[name];
                    if (type === 'Học phí + Lệ phí thi') {
                        if (!_finCtxCurrent(ctx))
                            throw Object.assign(new Error('Financial write context stale'), { code: 'finance/write-context-stale' });
                        const examDecision = await FinanceService.requireExamUnpaidForWrite({
                            profile: freshProfile,
                            studentName: name,
                            month: txMonth,
                            reason: 'finance.transactionForm.mixedExam',
                        });
                        if (!_finCtxCurrent(ctx))
                            throw Object.assign(new Error('Financial write context stale'), { code: 'finance/write-context-stale' });
                        if (examDecision.status === 'PAID') {
                            const er = new Error('Lệ phí thi kỳ này đã được ghi nhận. Vui lòng chọn giao dịch chỉ Học phí.');
                            er.code = 'exam/already-paid';
                            throw er;
                        }
                    }

                    const paidUntil = tuitionDecision.paidUntil;
                    const finalTx = { ...txData, txMonth, packageMonths: monthsToRecord };
                    if (type === 'Học phí + Lệ phí thi') Object.assign(finalTx, { tuitionAmount: amount, examAmount, examTitle });
                    const atomic = await FinanceService.commitAtomicWritePlan({
                        expectedContext: ctx,
                        transactions: [{ data: finalTx, reason: 'transaction-form-tuition' }],
                        profileUpdates: [{
                            studentName: name,
                            data: { paidUntil, paidMonths: FinanceService._arrayUnion(...monthsToRecord) },
                        }],
                    });
                    const postCommitContextCurrent = _finCtxCurrent(ctx);
                    if (postCommitContextCurrent) laneOwner.commitLocalTuitionPaymentState({
                        studentName: name,
                        paidUntil,
                        paidMonths: monthsToRecord,
                        reason: 'finance.transactionForm',
                    });
                    return { ok: true, atomic, txData: finalTx, paidUntil, primaryCommitted: true, postCommitContextCurrent };
                });

                if (result?.alreadySettled) {
                    window.showToast('⚠️ Học phí tháng này đã được ghi nhận. Không tạo thêm khoản thu.');
                    return false;
                }
                txData = result.txData;
                if (result?.primaryCommitted && (result.postCommitContextCurrent === false || !_finCtxCurrent(ctx))) {
                    window.showToast('✅ Khoản thu đã được ghi tại CLB trước. Phiên hiện tại đã thay đổi; không thu lại khoản tiền này.', 7000);
                    return true;
                }
                _detachFeeAudit({
                    studentId: name,
                    amount,
                    date: getLocalToday(),
                    type: 'tuition',
                    month: result.paidUntil,
                    months: monthsToRecord,
                    by: window.currentUserEmail || 'admin',
                    timestamp: Date.now(),
                });
            } else {
                await FinanceService.addTransaction(txData);
            }

            if (!_finCtxCurrent(ctx)) return true;
            e.target.reset();
            document.getElementById('date').value = getLocalToday();
            if (pkgEl) pkgEl.value = '1';
            const disc = document.getElementById('tx_discount');
            if (disc) disc.checked = false;
            const pct = document.getElementById('tx_discount_pct');
            if (pct) pct.value = '10';
            const sv = document.getElementById('tx_discount_saved');
            if (sv) sv.style.display = 'none';
            const ex = document.getElementById('tx_exam_amountActual');
            if (ex) ex.value = '';
            window.toggleTxFormType?.();
            window.showToast('✅ Đã lưu khoản thu!');
            return true;
        } catch (error) {
            console.error('[finance.js] transactionForm atomic save failed:', error);
            if (error?.code === 'finance/write-context-stale') {
                _staleTuitionToast();
                return false;
            }
            window.showToast(error?.code === 'finance/atomic-plan-too-large'
                ? '⚠️ Thao tác vượt giới hạn an toàn, chưa có dữ liệu nào được ghi.'
                : '❌ Không thể lưu khoản thu. Chưa có dữ liệu tài chính dở dang được ghi.');
            return false;
        } finally {
            endFeedback();
            delete _txFormEl.dataset.atomicSubmitInFlight;
        }
    };

    // Expense forms use the Finance owner and preserve the original UI context across awaits.
    window.saveEditExpense = async () => {
        if (window.saveEditExpense.__inFlight) return false;
        const original = window.__editingExpenseOriginal;
        const id = String(document.getElementById('eexp_txId')?.value || '').trim();
        const changes = {
            branch: String(document.getElementById('eexp_branch')?.value || '').trim(),
            description: String(document.getElementById('eexp_desc')?.value || '').trim(),
            amount: Number(document.getElementById('eexp_amountActual')?.value),
            date: String(document.getElementById('eexp_date')?.value || '').trim(),
        };
        if (window.userRole === 'viewer' || !original || id !== original.id
            || !['Chi phí', 'Chi phí kỳ thi'].includes(original.type)
            || !changes.branch || !changes.description || _positiveAmount(changes.amount) == null
            || !_validDate(changes.date)
            || (original.type === 'Chi phí kỳ thi' && changes.date.slice(0, 7) !== original.txMonth)
            || !_guardAllowed('expense.edit', { txId: id, amount: changes.amount, date: changes.date })) {
            window.showToast('⚠️ Chi phí không hợp lệ.');
            return false;
        }
        const ctx = _finCtx();
        if (!_finCtxCurrent(ctx)) return false;
        window.saveEditExpense.__inFlight = true;
        try {
            await FinanceService.updateExpenseTransaction(original, changes);
            if (!_finCtxCurrent(ctx)) return true;
            window.__editingExpenseOriginal = null;
            document.getElementById('editExpModal').style.display = 'none';
            window.showToast('✅ Đã sửa chi phí thành công!');
            return true;
        } catch (error) {
            console.error('[finance.js] expense edit failed:', error);
            window.showToast('❌ Chưa lưu được chi phí.');
            return false;
        } finally {
            window.saveEditExpense.__inFlight = false;
        }
    };

    for (const [formId, exam] of [['expenseForm', false], ['examExpenseForm', true]]) {
        const form = document.getElementById(formId);
        if (!form) continue;
        form.onsubmit = async e => {
            e.preventDefault();
            if (form.dataset.atomicSubmitInFlight === '1') return false;
            const today = getLocalToday();
            const month = exam ? String(document.getElementById('filterMonth')?.value || today.slice(0, 7)).trim() : '';
            const date = exam
                ? (month === today.slice(0, 7) ? today : (month < today.slice(0, 7) ? month + '-28' : month + '-01'))
                : String(document.getElementById('exp_date')?.value || '').trim();
            const data = {
                branch: exam ? 'Chung' : (_config().branchCount === 1 ? 'CS1' : String(document.getElementById('exp_branch')?.value || '').trim()),
                type: exam ? 'Chi phí kỳ thi' : 'Chi phí',
                description: String(document.getElementById(exam ? 'ee_desc' : 'exp_desc')?.value || '').trim(),
                amount: Number(document.getElementById(exam ? 'ee_amountActual' : 'exp_amountActual')?.value),
                date,
                timestamp: Date.now(),
            };
            if (exam) data.txMonth = month;

            if (window.userRole === 'viewer' || !data.branch || !data.description
                || _positiveAmount(data.amount) == null || !_validDate(date)
                || (exam && !_vMonth(month))
                || !_guardAllowed('expense.create', { amount: data.amount, date, description: data.description })) {
                window.showToast('⚠️ Chi phí không hợp lệ.');
                return false;
            }
            const ctx = _finCtx();
            if (!_finCtxCurrent(ctx)) return false;
            form.dataset.atomicSubmitInFlight = '1';
            try {
                await FinanceService.createExpense(data);
                if (!_finCtxCurrent(ctx)) return true;
                e.target.reset();
                if (!exam) document.getElementById('exp_date').value = getLocalToday();
                window.showToast(exam ? '✅ Đã lưu chi phí kỳ thi!' : '✅ Đã lưu khoản chi!');
                return true;
            } catch (error) {
                console.error('[finance.js] expense create failed:', error);
                window.showToast('❌ Chưa lưu được chi phí.');
                return false;
            } finally {
                delete form.dataset.atomicSubmitInFlight;
            }
        };
    }

    // finance.js no longer installs duplicate report implementations.


    if (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.endsWith('.replit.dev') ||
        window.location.hostname.endsWith('.repl.co')
    ) {
        console.group('💰 Module Finance — Phase 2e ✅ (100%)');
        console.log('✅ window.quickPay               :', typeof window.quickPay);
        console.log('✅ window.openQuickPayModal      :', typeof window.openQuickPayModal);
        console.log('✅ window.deleteTx               :', typeof window.deleteTx);
        console.log('✅ window.skipMonth              :', typeof window.skipMonth);
        console.log('✅ window.removeSkip             :', typeof window.removeSkip);
        console.log('✅ window.processCombo           :', typeof window.processCombo);
        console.log('✅ window.openComboModal         :', typeof window.openComboModal);
        console.log('✅ window.quickCollectExam       :', typeof window.quickCollectExam);
        console.log('✅ window.handleQuitOption       :', typeof window.handleQuitOption);
        console.log('✅ transactionForm.onsubmit      :', !!document.getElementById('transactionForm')?.onsubmit);
        console.groupEnd();
    }
}

/**
 * Khởi tạo server-side cursor pagination cho tab Giao dịch (tx).
 *
 * Phải gọi SAU initFinance().
 *
 * Mô hình "dual store":
 *   - window.__store.transactions         = listener-owned month data (business logic)
 *   - store.pagination.transactions       = separate preview/page state (cho #txList)
 *
 * Các hàm expose ra window:
 *   window._pgNext_transactions()   — load trang tiếp theo
 *   window._pgPrev_transactions()   — load trang trước
 *   window.reloadTransactionsPage() — reload trang hiện tại (sau add/delete)
 *
 * NOTE: Pagination hoạt động theo txMonth. Khi đổi tháng (#filterMonth),
 *       pagination tự reset về trang 1.
 */
export function initTransactionPagination() {
    if (window.RoleReadBoundary?.canMount?.('transactions.pagination', { reason: 'initTransactionPagination' }) === false) return false;
    import('../utils/pagination.js').then(({
        createPaginationState, resetPagination, processPage,
        prepareNextPage, preparePreviousPage,
        renderPaginationControls, PAGE_SIZE,
    }) => {
        import("../services/finance.service.js?v=a9r18-fin-nontuition-r1-2b-20261103").then(({ FinanceService }) => {

            const store = window.__store;
            if (!store) { console.warn('[pagination/transactions] __store chưa sẵn sàng'); return; }

            // Khởi tạo pagination state nếu chưa có
            if (!store.pagination) store.pagination = {};
            store.pagination.transactions = createPaginationState(PAGE_SIZE);
            const pgState = store.pagination.transactions;
            const { ensureLiveContext: _ensureLiveContext, projectPage: _projectPage, seedListenerProjection: _seedListenerProjection } = attachTransactionPageProjection({
                store, pgState, pageSize: PAGE_SIZE, getMonth: _getCurrentMonth,
                getSearch: _getCurrentSearch, getContext: _currentPaginationContextKey, renderControls: _injectControls
            });
            function _getCurrentMonth() {
                const el = document.getElementById('filterMonth');
                return el ? el.value : '';
            }

            function _getCurrentSearch() {
                const el = document.getElementById('txSearch') ||
                           document.getElementById('searchInput') ||
                           document.querySelector('#tx input[type="search"]');
                return el ? el.value.trim().toLowerCase() : '';
            }

            // H8R2 Patch A: DOM existence is NOT tab activity. Reuse the existing
            // tab authority; no new listener/reader is introduced.
            function _isTransactionTabActuallyActive() {
                try {
                    if (typeof window.getCurrentActiveTabId === 'function') {
                        return window.getCurrentActiveTabId() === 'tx';
                    }
                } catch (_) {}
                const active = document.querySelector('.tab-content.active');
                return !!active && active.id === 'tab_tx';
            }

            function _currentPaginationContextKey() {
                return _getCurrentMonth() + '|' + _getCurrentSearch();
            }

            pgState._initializedContextKey = pgState._initializedContextKey || '';
            pgState._contextDirty = pgState._contextDirty === true;

            // Phase 4K-5H: helper lấy host container bên NGOÀI table cho controls
            function _getTxControlsHost() {
                const txList = document.getElementById('txList');
                if (!txList) return null;
                const table   = txList.closest ? txList.closest('table') : txList.parentElement;
                const wrapper = table && table.closest ? table.closest('.table-wrapper') : null;
                const card    = wrapper ? wrapper.parentElement : (table ? table.parentElement : null);
                return {
                    txList,
                    table,
                    wrapper,
                    hostParent:  card || wrapper || (table && table.parentElement),
                    insertAfter: wrapper || table
                };
            }

            function _injectControls() {
                const from = pgState.currentPage > 0
                    ? (pgState.currentPage - 1) * PAGE_SIZE + 1
                    : 0;
                const to   = pgState.totalLoaded;
                let html = renderPaginationControls(pgState, 'transactions', from, to);

                // Phase 4K-5H: replace "Tiếp →" label thành rõ ràng hơn
                html = html.replace(/Tiếp\s*→/g, '⬇ Tải thêm giao dịch');
                if (pgState._monthComplete === false) {
                    html += '<div role="status" class="text-xs text-amber-700">Đang xem trước dữ liệu đã tải; thứ tự và tổng tháng chỉ chính thức khi đọc hết ba nguồn.</div>';
                }
                if (pgState._loadError) {
                    html += '<div role="alert" class="text-xs text-red-700">Chưa đọc đủ giao dịch. Hãy thử tải lại; không dùng danh sách này để đối soát.</div>';
                }
                if (pgState.reconciliation?.awaitingServer?.length || pgState.reconciliation?.needsReview?.length) {
                    const reviewCount = pgState.reconciliation.needsReview.length;
                    const awaitingCount = pgState.reconciliation.awaitingServer.filter(id => !pgState.reconciliation.needsReview.includes(id)).length;
                    html += '<div role="status" class="text-xs text-amber-700">Có ' + awaitingCount + ' giao dịch chờ đối soát và ' + reviewCount + ' giao dịch cần Admin kiểm tra. Mở trạng thái dưới tên để xem mã giao dịch và nguồn chưa khớp. Không thu lại các khoản này.</div>';
                }

                // Phase 4K-5H: host nằm NGOÀI table (không chèn div vào trong <table>)
                const host = _getTxControlsHost();
                if (!host || !host.hostParent || !host.insertAfter) return;

                const ctrlId = 'pgWrap_txList';
                let ctrlEl   = document.getElementById(ctrlId);
                if (!ctrlEl) {
                    ctrlEl           = document.createElement('div');
                    ctrlEl.id        = ctrlId;
                    ctrlEl.className = 'tx-loadmore-controls';
                    host.hostParent.insertBefore(ctrlEl, host.insertAfter.nextSibling);
                }
                ctrlEl.innerHTML = html;
            }

            async function _doLoad(cursor, direction) {
                if (!pgState.isCurrentContext()) return { stale: true };
                if (pgState._requestPending) return;
                pgState.isLoading = true;
                pgState._requestPending = true;
                const requestSeq = pgState._requestSeq = (pgState._requestSeq || 0) + 1;
                _injectControls(); // hiện spinner ngay

                const monthStr = _getCurrentMonth();
                const search   = _getCurrentSearch();
                const contextKey = _currentPaginationContextKey();

                try {
                    const snap = await FinanceService.getTransactionsPage({
                        pageSize: PAGE_SIZE,
                        cursor,
                        direction,
                        monthStr,
                        search,
                        monthState: direction === 'next' ? pgState._monthQueryState : null,
                    });
                    if (!pgState.isCurrentContext() || requestSeq !== pgState._requestSeq || contextKey !== _currentPaginationContextKey()) return { stale: true };

                    // Phase 4K-4F: If snap has _mergedItems (from getTransactionsForMonthInclusive),
                    // use them directly to include packageMonths middle-month transactions
                    let items;
                    if (Array.isArray(snap._mergedItems)) {
                        // Phase 4K-5H: Lưu toàn bộ rawItems để load more append đúng
                        const rawItems = snap._mergedItems.map(t => {
                            const { _docSnap, ...rest } = t; // eslint-disable-line no-unused-vars
                            return rest;
                        });

                        pgState._mergedAllItems  = rawItems;
                        pgState._monthQueryState = snap._monthState;
                        pgState._monthComplete = snap._complete;
                        pgState._loadError = false;
                        pgState._mergedPageSize  = PAGE_SIZE;

                        pgState._visibleCount = direction === 'next'
                            ? (pgState.currentItems || []).length + PAGE_SIZE : PAGE_SIZE;
                        const firstSlice = rawItems.slice(0, pgState._visibleCount);
                        pgState.currentPage  = Math.max(1, Math.ceil(firstSlice.length / PAGE_SIZE));
                        pgState.currentItems = firstSlice;
                        pgState.totalLoaded  = firstSlice.length;
                        pgState.hasNext      = rawItems.length > firstSlice.length || snap._hasMore;
                        pgState.hasPrevious  = false;
                        pgState.enabled      = true;
                        pgState.isLoading    = false;

                        items = pgState.currentItems;
                    } else {
                        items = processPage(snap, pgState);
                        pgState._serverHasMore = pgState.hasNext;
                    }
                    pgState.enabled     = true;
                    pgState.searchQuery = search;
                    pgState._displayContextKey = contextKey;
                    _ensureLiveContext();
                    _seedListenerProjection();
                    _projectPage();

                    // The list renderer reads this state directly. A page, including a
                    // fully fetched but search-filtered page, never becomes the ledger.
                    store.pagination.transactions = pgState;

                    // Phase 3.5D: Pagination chỉ ảnh hưởng tx.txList island — dùng list-level
                    // invalidation thay vì invalidateFinance() (tránh cross-domain dashboard).
                    // Fallback cascade an toàn: invalidateList → invalidateFinance → legacy.
                    // Virtualization-ready boundary: 'tx.txList' là stable list boundary.
                    if (typeof window.invalidateList === 'function') {
                        window.invalidateList('tx.txList', 'tx-pagination');
                    } else if (typeof window.invalidateFinance === 'function') {
                        window.invalidateFinance('tx-pagination');
                    } else if (typeof window._moduleRenderApp === 'function') {
                        window._moduleRenderApp();
                    } else if (typeof window.scheduleRender === 'function') {
                        window.scheduleRender();
                    }

                    // Render the page even when the island scheduler has not mounted yet.
                    // renderTxIsland owns the same page presentation on later redraws.
                    try {
                        if (contextKey === _currentPaginationContextKey()) {
                            const { renderTxIsland } = await import("../ui/render/renderFinance.js?v=a9r18-qr-memo-r1-2d-20261103");
                            if (pgState.isCurrentContext() && requestSeq === pgState._requestSeq && contextKey === _currentPaginationContextKey()) {
                                renderTxIsland();
                            }
                        }
                    } catch (_rowErr) {
                        console.warn('[pagination/transactions] Direct row render lỗi (non-blocking):', _rowErr && _rowErr.message);
                    }
                } catch (err) {
                    if (!pgState.isCurrentContext() || requestSeq !== pgState._requestSeq || contextKey !== _currentPaginationContextKey()) return { stale: true };
                    pgState.isLoading = false;
                    pgState._loadError = true;
                    pgState._monthComplete = false;
                    const errMsg = (err && err.message) || String(err);
                    const isIndexErr = errMsg.includes('failed-precondition') ||
                                       errMsg.includes('requires an index') ||
                                       errMsg.includes('The query requires an index');
                    if (isIndexErr) {
                        console.error('[pagination/transactions] Thiếu Firestore index cho truy vấn giao dịch. Hãy deploy firestore.indexes.json hoặc tạo index từ link Firebase Console trong console.');
                        const linkMatch = errMsg.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/);
                        if (linkMatch) console.info('[pagination/transactions] 🔗 Tạo index nhanh (bấm link):', linkMatch[0]);
                        const txList = document.getElementById('txList');
                        if (txList) {
                            txList.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px 16px;color:#b91c1c;font-weight:600;line-height:1.6;">' +
                                '⚠️ Thiếu Firestore index — danh sách giao dịch chưa tải được.<br>' +
                                '<span style="font-weight:400;font-size:0.9em;">Admin cần deploy <code>firestore.indexes.json</code> hoặc bấm link tạo index trong Console trình duyệt.</span>' +
                                '</td></tr>';
                        }
                    } else {
                        console.error('[pagination/transactions] Lỗi load trang:', err);
                        const txList = document.getElementById('txList');
                        if (txList && !(pgState.currentItems || []).length) txList.innerHTML = '<tr><td colspan="10" role="alert">⚠️ Chưa đọc được giao dịch tháng. Không có tổng chính thức.</td></tr>';
                    }
                    _injectControls();
                    return { failed: true };
                } finally {
                    if (requestSeq === pgState._requestSeq) {
                        pgState._requestPending = false;
                        pgState.isLoading = false;
                    }
                }

                _injectControls();
                return { loaded: true };
            }

            async function loadFirstPage() {
                if (!pgState.isCurrentContext()) return { stale: true };
                if (!_isTransactionTabActuallyActive()) {
                    pgState._contextDirty = true;
                    return { skipped: 'transaction-tab-hidden' };
                }
                resetPagination(pgState);
                pgState._requestPending = false;
                pgState._visibleCount = PAGE_SIZE;
                _ensureLiveContext();
                pgState._mergedAllItems = null;
                pgState._monthQueryState = null;
                pgState._monthComplete = null;
                pgState._loadError = false;
                pgState.currentPage = 1;
                const result = await _doLoad(null, 'first');
                if (!result?.loaded) { pgState._contextDirty = true; return result; }
                pgState._initializedContextKey = _currentPaginationContextKey();
                pgState._contextDirty = false;
                return { loaded: true, contextKey: pgState._initializedContextKey };
            }

            async function _ensureActiveTransactionPage(reason) {
                if (!pgState.isCurrentContext()) return { stale: true };
                if (!_isTransactionTabActuallyActive()) return { skipped: 'transaction-tab-hidden', reason };
                const contextKey = _currentPaginationContextKey();
                const needsLoad = pgState._contextDirty === true ||
                    !pgState._initializedContextKey ||
                    pgState._initializedContextKey !== contextKey ||
                    !Array.isArray(pgState.currentItems);
                if (!needsLoad) return { reused: true, contextKey, reason };
                return loadFirstPage();
            }
            window.ensureTransactionPaginationForActiveTab = _ensureActiveTransactionPage;

            window._pgNext_transactions = async function () {
                if (!pgState.isCurrentContext() || pgState.isLoading) return;
                pgState._visibleCount += PAGE_SIZE;
                // Phase 4K-5H: nếu tháng dùng _mergedAllItems thì append client-side
                if (Array.isArray(pgState._mergedAllItems)) {
                    const currentLen = Array.isArray(pgState.currentItems) ? pgState.currentItems.length : 0;
                    const nextSlice  = pgState._mergedAllItems.slice(currentLen, currentLen + PAGE_SIZE);

                    if (!nextSlice.length) {
                        if (pgState._monthComplete === false) return _doLoad(null, 'next');
                        pgState.hasNext = false;
                        _injectControls(); return;
                    }

                    // Dedup by id
                    const byId = new Map();
                    (pgState.currentItems || []).forEach(t => { if (t && t.id) byId.set(t.id, t); });
                    nextSlice.forEach(t => { if (t && t.id) byId.set(t.id, t); });

                    pgState.currentItems = Array.from(byId.values());
                    pgState.totalLoaded  = pgState.currentItems.length;
                    pgState.currentPage  = (pgState.currentPage || 1) + 1;
                    pgState.hasNext      = pgState.currentItems.length < pgState._mergedAllItems.length || pgState._monthComplete === false;
                    pgState.enabled      = true;

                    store.pagination.transactions = pgState;
                    if (typeof window.invalidateList === 'function') {
                        window.invalidateList('tx.txList', 'load-more-tuition-merged');
                    } else if (typeof window.invalidateFinance === 'function') {
                        window.invalidateFinance('load-more-tuition-merged');
                    }

                    try {
                        const { renderTxIsland } = await import("../ui/render/renderFinance.js?v=a9r18-qr-memo-r1-2d-20261103");
                        if (pgState._displayContextKey === _currentPaginationContextKey()) renderTxIsland();
                    } catch (err) { console.warn('[pagination/transactions] Direct row render lỗi:', err); }
                    _injectControls();
                    return;
                }

                const cursor = prepareNextPage(pgState);
                if (!cursor) return;
                await _doLoad(cursor, 'next');
            };

            window._pgPrev_transactions = async function () {
                if (!pgState.isCurrentContext()) return { stale: true };
                const cursor = preparePreviousPage(pgState);
                if (cursor === null && !pgState.hasPrevious) return;
                if (cursor === null) {
                    resetPagination(pgState);
                    pgState.currentPage = 1;
                    await _doLoad(null, 'first');
                } else {
                    await _doLoad(cursor, 'prev');
                }
            };

            window.reloadTransactionsPage = async function () {
                pgState._contextDirty = true;
                if (!_isTransactionTabActuallyActive()) return { skipped: 'transaction-tab-hidden' };
                return loadFirstPage();
            };

            function _bindMonthReset() {
                const el = document.getElementById('filterMonth');
                if (!el || el.__pgTxBound) return;
                el.__pgTxBound = true;
                el.addEventListener('change', () => {
                    pgState._requestSeq = (pgState._requestSeq || 0) + 1;
                    resetPagination(pgState);
                    pgState._monthQueryState = null;
                    pgState._mergedAllItems = null;
                    pgState.currentPage = 1;
                    pgState._contextDirty = true;
                    if (_isTransactionTabActuallyActive()) _ensureActiveTransactionPage('month-change');
                });
            }

            function _bindSearchReset() {
                const el = document.getElementById('txSearch') ||
                           document.querySelector('#tx input[type="search"]');
                if (!el || el.__pgTxSearchBound) return;
                el.__pgTxSearchBound = true;
                let _debounce = null;
                el.addEventListener('input', () => {
                    clearTimeout(_debounce);
                    _debounce = setTimeout(() => {
                        pgState._requestSeq = (pgState._requestSeq || 0) + 1;
                        resetPagination(pgState);
                        pgState._monthQueryState = null;
                        pgState._mergedAllItems = null;
                        pgState.currentPage = 1;
                        pgState._contextDirty = true;
                        if (_isTransactionTabActuallyActive()) _ensureActiveTransactionPage('search-change');
                    }, 350);
                });
            }

            setTimeout(() => {
                _bindMonthReset();
                _bindSearchReset();
                // H8R2: hidden DOM must never trigger a transaction page read.
                if (_isTransactionTabActuallyActive()) {
                    _ensureActiveTransactionPage('pagination-auto-start-active');
                }
            }, 700);

            console.info('[finance.js] ✅ Phase 3.2A — initTransactionPagination() OK, PAGE_SIZE =', PAGE_SIZE);

        }).catch(err => console.error('[initTransactionPagination] import finance.service:', err));
    }).catch(err => console.error('[initTransactionPagination] import pagination.js:', err));
}

// Phase 4K-5G — Load More: HỌC PHÍ tab (global API)
window.loadMoreTuitionTransactions = function loadMoreTuitionTransactions() {
    if (typeof window._pgNext_transactions === 'function') {
        window._pgNext_transactions();
    } else {
        console.warn('[loadMoreTuitionTransactions] _pgNext_transactions chưa sẵn sàng');
    }
};

window.loadNextTransactionsPage = window.loadMoreTuitionTransactions;
