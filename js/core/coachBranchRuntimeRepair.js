/**
 * Phase 4K-6V4D5 — Coach Branch Assignment + Login Index Repair
 * Owns the Coach authorization repair workflow outside legacy app.js.
 */
(function initCoachBranchRuntimeRepair(global) {
  'use strict';
  if (global.CoachBranchRuntimeRepair?.version === '4K-6V4D5') return;

  const canonical = (value, fallback = '') => {
    if (global.BranchIdentity?.normalize) return global.BranchIdentity.normalize(value, { fallback });
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    if (/^(mặc định|mac dinh|default)$/i.test(raw)) return 'CS1';
    const match = raw.match(/^CS0*([1-9]|10)$/i);
    return match ? `CS${Number(match[1])}` : fallback;
  };
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const sdk = () => global._fb_init || {};
  const db = () => global.__store?.db || null;
  const clubId = () => String(global.__store?.clubId || '').trim();
  const toast = (message, duration = 3500) => global.showToast ? global.showToast(message, duration) : alert(message);
  const assertAdmin = () => {
    if (!['admin', 'owner', 'super_admin'].includes(global.userRole)) throw new Error('Chỉ Admin/Owner mới có quyền quản lý HLV.');
    if (!db() || !clubId()) throw new Error('Dữ liệu CLB chưa sẵn sàng. Vui lòng tải lại trang.');
  };
  const branchName = code => global.getBranchNameDisplay ? global.getBranchNameDisplay(code) : code;
  const branchCount = () => Math.max(1, Math.min(10, Number(global.__store?.clubConfig?.branchCount) || 1));
  const selectId = uid => `coach_assigned_branch_${String(uid || '').replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const options = selectedValue => {
    const selected = canonical(selectedValue);
    let html = '<option value="">⚠️ Chọn cơ sở phụ trách</option>';
    for (let i = 1; i <= branchCount(); i++) {
      const code = `CS${i}`;
      html += `<option value="${code}"${selected === code ? ' selected' : ''}>📍 ${esc(branchName(code))}</option>`;
    }
    return html;
  };

  async function resolveAuthContext({ user, context, db: firestore }) {
    const role = String(context?.role || '').trim().toLowerCase().replace(/-/g, '_').replace(/^(hlv|trainer)$/, 'coach');
    const result = {
      uid: String(user?.uid || context?.uid || '').trim(), role,
      clubId: String(context?.clubId || '').trim(),
      coachBranch: role === 'coach' ? canonical(context?.coachBranch || context?.branch || '') : ''
    };
    if (result.role !== 'coach' || !result.clubId || !result.uid || !firestore) return result;
    const { doc, getDoc, setDoc } = sdk();
    let snap;
    try { snap = await getDoc(doc(firestore, 'clubs', result.clubId, 'coaches', result.uid)); }
    catch (error) { console.warn('[CoachBranchRepair] assignment read failed:', error.code || error.message); return result; }
    if (!snap.exists()) return result;
    const assigned = snap.data() || {};
    const assignedBranch = canonical(assigned.branch || assigned.coachBranch || '');
    if (!assignedBranch) return { ...result, coachBranch: result.coachBranch };
    // Phase 4K-6V4D5: always refresh both mirrors, even when the branch already
    // matches. This lets coach_login_index recover missing/stale users/{uid}
    // without leaving HLV logged in but blocked by Firestore branch rules.
    try {
      const now = new Date().toISOString();
      const mirror = {
        role: 'coach', clubId: result.clubId, branch: assignedBranch, coachBranch: assignedBranch,
        email: user?.email || assigned.email || '', uid: result.uid, updatedAt: now
      };
      await setDoc(doc(firestore, 'users', result.uid), mirror, { merge: true });
      await setDoc(doc(firestore, 'coach_login_index', result.uid), mirror, { merge: true });
    } catch (cause) {
      const error = new Error('Cơ sở HLV chưa đồng bộ. Admin cần chọn đúng cơ sở, bấm “Lưu cơ sở” rồi chạy “Đồng bộ tài khoản HLV cũ”.');
      error.code = 'auth/coach-branch-mirror-sync-failed'; error.cause = cause; throw error;
    }
    return { ...result, coachBranch: assignedBranch };
  }

  async function loadCoachAccounts() {
    const list = document.getElementById('coachAccountsList');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:.85rem">Đang tải...</div>';
    try {
      assertAdmin();
      const { collection, getDocs, query, limit } = sdk();
      const snap = await getDocs(query(collection(db(), 'clubs', clubId(), 'coaches'), limit(200)));
      if (snap.empty) { list.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:.85rem">Chưa có tài khoản HLV nào</div>'; return; }
      let html = '';
      snap.forEach(item => {
        const data = item.data() || {};
        const branch = canonical(data.branch || data.coachBranch || '');
        const label = branch ? branchName(branch) : '⚠️ Chưa gán cơ sở — HLV sẽ không tải dữ liệu';
        html += `<div style="padding:12px;background:#f8fafc;border-radius:10px;border:1px solid ${branch ? '#e2e8f0' : '#f59e0b'};margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div style="min-width:0;flex:1">
          <div style="font-weight:700;font-size:.88rem;color:#1e293b">${esc(data.displayName || data.email || 'HLV')}</div>
          <div style="font-size:.72rem;color:#64748b;overflow-wrap:anywhere">${esc(data.email || '')}</div>
          <div style="font-size:.68rem;color:${branch ? '#0369a1' : '#b45309'};margin-top:3px;font-weight:700">📍 ${esc(label)}</div></div>
          <div style="display:flex;gap:6px"><button data-coach-reset="${esc(data.email || '')}" style="background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;padding:5px 9px;border-radius:8px;font-size:.7rem;font-weight:700">🔑 Đặt lại MK</button>
          <button data-coach-delete="${esc(item.id)}" data-coach-email="${esc(data.email || '')}" style="background:#fee2e2;color:#dc2626;border:0;padding:5px 9px;border-radius:8px;font-size:.7rem;font-weight:700">🗑️ Xóa</button></div></div>
          <div style="display:flex;gap:7px;margin-top:9px"><select id="${selectId(item.id)}" style="flex:1;min-width:0;padding:8px 9px;border:1.5px solid #cbd5e1;border-radius:9px;background:#fff;font-size:.76rem;font-weight:700">${options(branch)}</select>
          <button data-coach-save="${esc(item.id)}" style="background:#0f766e;color:#fff;border:0;padding:9px 11px;border-radius:9px;font-size:.72rem;font-weight:800;white-space:nowrap">💾 Lưu cơ sở</button></div></div>`;
      });
      list.innerHTML = html;
      list.querySelectorAll('[data-coach-save]').forEach(btn => btn.addEventListener('click', () => updateCoachBranch(btn.dataset.coachSave)));
      list.querySelectorAll('[data-coach-reset]').forEach(btn => btn.addEventListener('click', () => global.resetCoachPassword(btn.dataset.coachReset)));
      list.querySelectorAll('[data-coach-delete]').forEach(btn => btn.addEventListener('click', () => global.deleteCoachAccount(btn.dataset.coachDelete, btn.dataset.coachEmail)));
    } catch (error) { list.innerHTML = `<div style="color:#dc2626;font-size:.82rem;padding:12px">Lỗi tải danh sách: ${esc(error.message || error)}</div>`; }
  }

  async function updateCoachBranch(uid) {
    try {
      assertAdmin();
      const select = document.getElementById(selectId(uid));
      const branch = canonical(select?.value || '');
      if (!branch) return alert('Vui lòng chọn một cơ sở cụ thể cho HLV.');
      if (select) select.disabled = true;
      const { doc, getDoc, writeBatch } = sdk();
      const coachRef = doc(db(), 'clubs', clubId(), 'coaches', uid);
      const coachSnap = await getDoc(coachRef);
      if (!coachSnap.exists()) throw new Error('Không tìm thấy hồ sơ HLV trong CLB.');
      const data = coachSnap.data() || {}, now = new Date().toISOString(), batch = writeBatch(db());
      batch.set(coachRef, { role:'coach', clubId:clubId(), branch, coachBranch:branch, updatedAt:now }, { merge:true });
      batch.set(doc(db(), 'users', uid), { role:'coach', clubId:clubId(), branch, coachBranch:branch, email:data.email || '', uid, updatedAt:now }, { merge:true });
      batch.set(doc(db(), 'coach_login_index', uid), { role:'coach', clubId:clubId(), branch, coachBranch:branch, email:data.email || '', uid, updatedAt:now }, { merge:true });
      await batch.commit();
      toast(`✅ Đã giao ${branchName(branch)} cho HLV. HLV cần đăng nhập lại.`, 4000);
      await loadCoachAccounts();
    } catch (error) { console.error('[CoachBranchRepair] save failed:', error); alert(`Không thể lưu cơ sở HLV: ${error.message || error}`); }
    finally { const el = document.getElementById(selectId(uid)); if (el) el.disabled = false; }
  }

  async function createCoachAccount() {
    const email = (document.getElementById('coach_email')?.value || '').trim();
    const pass = (document.getElementById('coach_pass')?.value || '').trim();
    const name = (document.getElementById('coach_name')?.value || '').trim();
    const branchEl = document.getElementById('coach_branch');
    const branch = canonical(branchEl?.value || '');
    if (!name || !email || !branch || pass.length < 6) return alert(!branch ? 'Vui lòng chọn một cơ sở phụ trách cho HLV!' : 'Vui lòng nhập đủ tên, email và mật khẩu tối thiểu 6 ký tự.');
    const btn = document.getElementById('btnCreateCoach');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang tạo...'; }
    try {
      assertAdmin();
      const { createUserWithEmailAndPassword, signOut, doc, setDoc } = sdk();
      const cred = await createUserWithEmailAndPassword(global._secondaryAuth, email, pass);
      const uid = cred.user.uid; try { await signOut(global._secondaryAuth); } catch (_) {}
      const base = { email, displayName:name, role:'coach', clubId:clubId(), branch, coachBranch:branch, uid, createdAt:new Date().toISOString() };
      await setDoc(doc(db(), 'clubs', clubId(), 'coaches', uid), base);
      let mirrorError = null;
      try {
        const mirror = { role:'coach', clubId:clubId(), branch, coachBranch:branch, email, uid, updatedAt:new Date().toISOString() };
        await setDoc(doc(db(), 'users', uid), mirror, { merge:true });
        await setDoc(doc(db(), 'coach_login_index', uid), mirror, { merge:true });
      }
      catch (error) { mirrorError = error; }
      alert(mirrorError
        ? `⚠️ Auth và hồ sơ HLV đã tạo nhưng users/{uid} chưa ghi được.\n\nKHÔNG tạo lại để tránh trùng email. Hãy deploy Rules V4D5 rồi chạy đồng bộ.\n\nTên: ${name}\nEmail: ${email}\nCơ sở: ${branchName(branch)}`
        : `✅ Tạo tài khoản HLV thành công!\n\nTên: ${name}\nEmail: ${email}\nMật khẩu: ${pass}\nCơ sở: ${branchName(branch)}`);
      ['coach_email','coach_pass','coach_name'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
      if (branchEl) branchEl.value = 'CS1';
      await loadCoachAccounts();
    } catch (error) { alert(error.code === 'auth/email-already-in-use' ? 'Email này đã được sử dụng bởi tài khoản khác!' : `Lỗi tạo tài khoản: ${error.message || error.code}`); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '➕ Tạo tài khoản'; } }
  }

  async function migrateCoachAccounts() {
    const btn = document.getElementById('btnMigrateCoaches');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang xử lý...'; }
    try {
      assertAdmin();
      const { collection, query, limit, getDocs, doc, getDoc, writeBatch } = sdk();
      const snap = await getDocs(query(collection(db(), 'clubs', clubId(), 'coaches'), limit(200)));
      let fixed=0, synced=0, skipped=0, needsAssignment=0, failed=0;
      for (const coach of snap.docs) {
        try {
          const data=coach.data() || {}, uid=coach.id, userRef=doc(db(),'users',uid), userSnap=await getDoc(userRef), old=userSnap.exists()?userSnap.data():{};
          const branch=canonical(data.branch || data.coachBranch || old.branch || old.coachBranch || '');
          if (!branch) { needsAssignment++; continue; }
          const coachFix=data.role!=='coach'||data.clubId!==clubId()||data.branch!==branch||data.coachBranch!==branch;
          const userFix=!userSnap.exists()||old.role!=='coach'||old.clubId!==clubId()||old.branch!==branch||old.coachBranch!==branch||(data.email&&old.email!==data.email);
          if (!coachFix && !userFix) { skipped++; }
          const now=new Date().toISOString(), batch=writeBatch(db());
          if (coachFix) { batch.set(doc(db(),'clubs',clubId(),'coaches',uid), { uid,role:'coach',clubId:clubId(),branch,coachBranch:branch,email:data.email||old.email||'',displayName:data.displayName||data.email||old.email||'',updatedAt:now }, {merge:true}); fixed++; }
          if (userFix) { batch.set(userRef,{role:'coach',clubId:clubId(),branch,coachBranch:branch,email:data.email||old.email||'',uid,updatedAt:now},{merge:true}); synced++; }
          batch.set(doc(db(),'coach_login_index',uid), {role:'coach',clubId:clubId(),branch,coachBranch:branch,email:data.email||old.email||'',uid,updatedAt:now},{merge:true});
          await batch.commit();
        } catch (error) { failed++; console.warn('[CoachBranchRepair] sync failed:', coach.id, error.code || error.message); }
      }
      const incomplete=failed>0||needsAssignment>0;
      alert(`${incomplete?'⚠️ Đồng bộ chưa hoàn tất!':'✅ Đồng bộ hoàn tất!'}\n\n• Chuẩn hóa hồ sơ HLV: ${fixed}\n• Đồng bộ users/{uid}: ${synced}\n• Đã đúng: ${skipped}\n• Chưa được Admin gán cơ sở: ${needsAssignment}\n• Không đồng bộ được: ${failed}\n\n${incomplete?'Chọn đúng cơ sở cho từng tài khoản cảnh báo, bấm “Lưu cơ sở”, rồi chạy lại đến khi hai chỉ số cuối bằng 0.':'HLV đã có branch đồng nhất và chỉ tải đúng cơ sở.'}`);
      await loadCoachAccounts();
    } catch (error) { alert(`Lỗi đồng bộ: ${error.message || error}`); }
    finally { if (btn) { btn.disabled=false; btn.textContent='🔄 Đồng bộ tài khoản HLV cũ'; } }
  }

  function installAdminOverrides() {
    if (!global.__appLoaded) return setTimeout(installAdminOverrides, 25);
    global.loadCoachAccounts = loadCoachAccounts;
    global.updateCoachBranch = updateCoachBranch;
    global.createCoachAccount = createCoachAccount;
    global.migrateCoachAccounts = migrateCoachAccounts;
  }

  global.CoachBranchRuntimeRepair = Object.freeze({ version:'4K-6V4D5', resolveAuthContext, installAdminOverrides });
  installAdminOverrides();
})(window);
