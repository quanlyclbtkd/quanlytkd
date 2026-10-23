/** Existing Coach assignment/login owner. A6: server-authorized branches. */
(function initCoachBranchRuntimeRepair(global) {
  'use strict';
  if (global.CoachBranchRuntimeRepair?.version === 'A6') return;
  const canonical = (value, fallback = '') => {
    if (global.BranchIdentity?.normalize) return global.BranchIdentity.normalize(value, {fallback});
    const s=String(value||'').trim();if (/^(Mặc định|mac dinh|default)$/i.test(s)) return 'CS1';
    return /^CS(?:[1-9]|10)$/.test(s)?s:fallback;
  };
  const error=(code,message)=>Object.assign(new Error(message),{code});
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const sdk=()=>global._fb_init||{},db=()=>global.__store?.db,clubId=()=>String(global.__store?.clubId||'');
  const toast=message=>global.showToast?global.showToast(message,4500):global.alert(message);
  const disabled=data=>['locked','disabled','suspended'].includes(String(data?.status||'active').toLowerCase());
  // Explicit arrays are strict. Malformed arrays never fall back to a scalar.
  function normalizeAssignment(data={},options={}) {
    const primary=canonical(data.primaryCoachBranch||data.defaultBranch||data.branch||data.coachBranch);
    const explicit=Object.prototype.hasOwnProperty.call(data,'allowedBranches');
    const values=explicit?data.allowedBranches:[primary];
    if(Array.isArray(values)&&values.length===0&&options.allowRevoked)return {primary:'',branches:[]};
    if(!primary||!Array.isArray(values)||values.length<1||values.length>10||
      values.some(b=>typeof b!=='string'||!/^CS(?:[1-9]|10)$/.test(b))||
      new Set(values).size!==values.length||!values.includes(primary)||
      (data.branch&&canonical(data.branch)!==primary)||
      (!data.primaryCoachBranch&&data.coachBranch&&canonical(data.coachBranch)!==primary))
      throw error('auth/coach-assignment-invalid','Phân công HLV không hợp lệ: cần cơ sở hợp lệ trong cấu hình CLB; cơ sở mặc định phải nằm trong danh sách.');
    return {primary,branches:values.slice().sort((a,b)=>Number(a.slice(2))-Number(b.slice(2)))};
  }
  const same=(a,b)=>a.primary===b.primary&&JSON.stringify(a.branches)===JSON.stringify(b.branches);
  function verifiedSnapshot(snap){
    if(snap?.metadata?.fromCache!==false||snap.metadata.hasPendingWrites!==false)
      throw error('auth/coach-assignment-unverified','Chưa xác minh được phân công từ máy chủ. Kiểm tra kết nối và thử lại.');
    return snap;
  }
  async function readVerified(firestore,...segments){return verifiedSnapshot(await sdk().getDoc(sdk().doc(firestore,...segments)));}
  async function resolveAuthContext({user,context,db:firestore}) {
    const role=String(context?.role||'').toLowerCase().replace(/^(hlv|trainer)$/,'coach');
    const result={...context,uid:String(user?.uid||context?.uid||''),role,clubId:String(context?.clubId||'')};
    if(role!=='coach')return result;
    const {doc,getDoc}=sdk();
    if(!result.uid||!result.clubId||!firestore)throw error('auth/coach-assignment-missing','Thiếu hồ sơ tài khoản hoặc CLB. Admin cần kiểm tra.');
    const snap=await readVerified(firestore,'clubs',result.clubId,'coaches',result.uid);
    if(!snap.exists())throw error('auth/coach-assignment-missing','Không có hồ sơ phân công HLV. Admin cần khôi phục hồ sơ, không tạo lại tài khoản Auth.');
    const assigned=snap.data()||{};
    if(assigned.role!=='coach'||assigned.clubId!==result.clubId||disabled(assigned))
      throw error('auth/coach-assignment-invalid','Phân công HLV sai vai trò, CLB hoặc đã bị khóa.');
    if(Array.isArray(assigned.allowedBranches)&&assigned.allowedBranches.length===0)throw error('auth/coach-assignment-revoked','HLV đã được thu hồi toàn bộ cơ sở. Nhật ký chưa đồng bộ được giữ nguyên.');
    if(disabled(context))throw error('auth/coach-assignment-invalid','Hồ sơ tài khoản HLV đã bị khóa.');
    const a=normalizeAssignment(assigned),mirror=normalizeAssignment(context);
    if(!same(a,mirror)||(assigned.assignmentVersion||'legacy')!==(context.assignmentVersion||'legacy'))throw error('auth/coach-assignment-mismatch','Phân công HLV và users/{uid} chưa khớp. Admin cần lưu lại cơ sở hoặc đồng bộ tài khoản HLV cũ.');
    return {...result,coachBranch:a.primary,primaryCoachBranch:a.primary,allowedBranches:Object.freeze(a.branches.slice()),activeBranch:a.primary};
  }
  function allowedBranches(context=global.__verifiedAuthContextState){
    if(context?.ready!==true||context.role!=='coach')return [];
    try{return normalizeAssignment(context).branches}catch{return []}
  }
  function renderCoachBranchSelectors(){
    const state=global.__verifiedAuthContextState,branches=allowedBranches(state);
    if(global.userRole!=='coach')return;
    for(const id of ['att_branch','att_month_branch']){
      const el=document.getElementById(id);if(!el)continue;
      el.innerHTML=branches.map(b=>'<option value="'+b+'">📍 '+esc(global.getBranchNameDisplay?.(b)||b)+'</option>').join('');
      el.value=branches.includes(state.coachBranch)?state.coachBranch:'';el.disabled=branches.length<2;
    }
    if(state?.ready!==true){const info=document.getElementById('coach_att_info');if(info){info.textContent='Quyền cơ sở chưa được xác minh. Nhật ký được giữ nguyên. ';const retry=document.createElement('button');retry.type='button';retry.textContent='Xác minh lại quyền';retry.onclick=()=>global.selectCoachBranch(state.coachBranch,{revalidate:true});info.appendChild(retry);}}
  }
  const branchName=b=>global.getBranchNameDisplay?.(b)||b;
  const branchCount=()=>Math.max(0,Math.min(10,Number(global.__store?.clubConfig?.branchCount)||0));
  const selectId=uid=>'coach_assigned_branch_'+String(uid||'').replace(/[^A-Za-z0-9_-]/g,'_');
  function choices(id,values=[]){
    let html='<fieldset id="'+id+'" style="display:flex;flex-wrap:wrap;gap:8px;padding:8px;border:1px solid #cbd5e1;border-radius:9px"><legend>Chọn cơ sở được phép</legend>';
    for(let i=1;i<=branchCount();i++){const b='CS'+i;html+='<label style="display:flex;align-items:center;gap:6px;min-height:40px;padding:4px 8px"><input type="checkbox" value="'+b+'"'+(values.includes(b)?' checked':'')+' style="width:20px;height:20px">'+esc(branchName(b))+'</label>'}
    return html+'</fieldset><label>Cơ sở mặc định <select id="'+id+'_primary" style="padding:8px">'+values.map(b=>'<option value="'+b+'">'+esc(branchName(b))+'</option>').join('')+'</select></label>';
  }
  function renderCreateBranchChoices(){
    const wrap=document.getElementById('coach_branch_choices');if(!wrap)return;
    const previous=Array.from(wrap.querySelectorAll('input:checked')).map(el=>el.value),primary=document.getElementById('coach_create_branches_primary')?.value;
    wrap.innerHTML=choices('coach_create_branches',previous);bindChoices('coach_create_branches');if(previous.includes(primary))document.getElementById('coach_create_branches_primary').value=primary;
  }
  function bindChoices(id){
    const box=document.getElementById(id),primary=document.getElementById(id+'_primary');if(!box||!primary)return;
    box.onchange=()=>{const selected=Array.from(box.querySelectorAll('input:checked')).map(el=>el.value),old=primary.value;primary.innerHTML=selected.map(b=>'<option value="'+b+'">'+esc(branchName(b))+'</option>').join('');if(selected.includes(old))primary.value=old;};
  }
  function chosen(id,legacyId){
    const container=document.getElementById(id);
    const values=container?Array.from(container.querySelectorAll('input:checked')).map(el=>el.value):[document.getElementById(legacyId)?.value||''];
    return normalizeAssignment({branch:document.getElementById(id+'_primary')?.value||values[0],allowedBranches:values},{allowRevoked:true});
  }
  function adminContext(){
    const v=global.__verifiedAuthContextState,s=global.__store;
    if(v?.ready!==true||!['admin','owner','super_admin'].includes(v.role)||global.userRole!==v.role||s?.userRole!==v.role||!v.uid||s?.currentUser?.uid!==v.uid||!db()||!clubId()||
      (v.role!=='super_admin'&&v.clubId!==clubId()))throw error('permission-denied','Chỉ Admin/SuperAdmin đã xác minh được quản lý HLV.');
    const captured=JSON.stringify([v.uid,v.role,v.generation,clubId()]),firestore=db(),club=clubId();
    return {club,firestore,ensure(){const now=global.__verifiedAuthContextState;if(now?.ready!==true||db()!==firestore||JSON.stringify([now.uid,now.role,now.generation,clubId()])!==captured||global.userRole!==now.role||global.__store?.currentUser?.uid!==now.uid)throw error('auth/context-changed','Phiên quản trị đã thay đổi; dừng lưu phân công.')}};
  }
  // Reuse the existing assignment batch owner. Auth creation is not a Firestore transaction.
  async function savePair(uid,assignment,data,owner,{creating=false,repair=false}={}){
    owner.ensure();const {doc,getDoc,writeBatch,increment}=sdk(),{club,firestore}=owner;
    const config=await readVerified(firestore,'clubs',club,'settings','main_config');owner.ensure();
    const rawCount=config.exists()?config.data().branchCount:null;
    const count=Number(rawCount);
    // The Rules contract requires an integer, not a numeric string; fail locally
    // with the actual config problem rather than an opaque batch permission-denied.
    if(typeof rawCount!=='number'||!Number.isInteger(rawCount)) throw error('auth/coach-config-invalid','Cài đặt main_config.branchCount trên máy chủ phải là số nguyên. Admin cần sửa cấu hình CLB trước khi cấp quyền HLV.');
    if(!Number.isInteger(count)||count<1||count>10||assignment.branches.some(b=>Number(b.slice(2))>count))throw error('auth/coach-branch-inactive','Cơ sở đã chọn không nằm trong cấu hình hiện hành của CLB. Tải lại cấu hình và chọn lại.');
    // Admin-only, server-confirmed preflight. No extra listener and no writes.
    // An old non-integer epoch causes Firestore increment / Rules to reject.
    const rootSnap=await readVerified(firestore,'clubs',club);owner.ensure();
    if(!rootSnap.exists())throw error('auth/coach-root-missing','Thiếu tài liệu gốc CLB, không thể tăng coachAclEpoch an toàn.');
    const epoch=rootSnap.data()?.coachAclEpoch;
    if(epoch!==undefined&&(!Number.isSafeInteger(epoch)||epoch<0))
      throw error('auth/coach-epoch-invalid','coachAclEpoch trên máy chủ không phải số nguyên không âm; phải đối soát bản sao lưu trước khi cấp quyền.');
    // A9R4: A fresh Auth UID has no User mirror yet. Admin's get() permission
    // for /users/{uid} deliberately requires an existing same-club Coach;
    // reading the missing document here denied the whole creation after Auth
    // already succeeded. Do not widen Rules: skip only this PRE-WRITE read.
    // The A9R3 Rules MUST still authorize all three writes atomically and
    // reject a pre-existing User/Coach via the 'absent' version precondition.
    const userSnap=creating ? {exists:()=>false} : await readVerified(firestore,'users',uid);owner.ensure();
    if(userSnap.exists()){
      const oldUser=userSnap.data()||{};
      if(!['coach','hlv','trainer'].includes(oldUser.role)||oldUser.clubId!==club)
        throw error('auth/coach-mirror-unsafe','Hồ sơ users hiện hữu không thuộc vai trò HLV hợp lệ cùng CLB. Dừng cập nhật để tránh chiếm quyền tài khoản.');
      // Do not let a stale client overwrite a newer user mirror after another Admin.
      if(!repair&&oldUser.assignmentVersion&&oldUser.assignmentVersion!==(data.assignmentVersion||'legacy'))
        throw error('auth/coach-mirror-stale','Phiên bản user mirror khác canonical HLV. Dừng lưu, cần đối soát trước khi thay đổi.');
    }
    // A9: The ordinary write is unchanged. A mismatched mirror may ONLY be
    // restored through this one canonical owner after explicit Admin review.
    // A Web SDK writeBatch cannot CAS a separate document read earlier. The
    // repair path therefore uses a single atomic Firestore transaction over
    // exactly the same three documents, with four authoritative reads and
    // optimistic concurrency checking *both* previous versions + root epoch.
    let repairBaseline=null;
    if(repair){
      if(creating||!userSnap.exists())
        throw error('auth/coach-repair-review','Không đủ dữ liệu canonical/mirror để sửa có điều kiện; cần Admin review.');
      const mirror=userSnap.data()||{};
      const baseline=await readVerified(firestore,'clubs',club,'coaches',uid);owner.ensure();
      if(!baseline.exists()||baseline.data()?.assignmentVersion!==data.assignmentVersion)
        throw error('auth/coach-assignment-stale','Canonical đã thay đổi, không thể khôi phục từ dữ liệu cũ.');
      const oldCoach=baseline.data();
      if(oldCoach.role!=='coach'||oldCoach.clubId!==club||!['coach','hlv','trainer'].includes(mirror.role)||mirror.clubId!==club)
        throw error('auth/coach-mirror-unsafe','Role/club không thể xác minh cùng CLB; khóa repair.');
      // Reject incoherent alias fields instead of guessing which legacy value wins.
      const coherent=(d,a)=>[d.branch,d.coachBranch,d.primaryCoachBranch,d.defaultBranch]
        .every(value=>value==null||value===''||canonical(value)===a.primary);
      const acl=normalizeAssignment(oldCoach,{allowRevoked:true});
      const mirrorAcl=normalizeAssignment(mirror,{allowRevoked:true});
      if(!coherent(oldCoach,acl)||!coherent(mirror,mirrorAcl))
        throw error('auth/coach-repair-review','Các trường branch/coachBranch/primary/default mâu thuẫn; cần Admin review trước repair.');
      if(!same(acl,assignment))throw error('auth/coach-repair-review','Chỉ khôi phục đúng quyền canonical hiện tại; không đồng thời thay đổi cơ sở.');
      if(disabled(oldCoach)!==disabled(mirror)||String(oldCoach.status||'active')!==String(mirror.status||'active'))
        throw error('auth/coach-repair-review','Trạng thái khóa giữa hai hồ sơ khác nhau; không được tự mở khóa. Cần đối soát riêng.');
      const oldMirrorACL=mirrorAcl;
      if((mirror.assignmentVersion||'legacy')===(oldCoach.assignmentVersion||'legacy')&&same(oldMirrorACL,acl))
        throw error('auth/coach-repair-unneeded','Hai hồ sơ đang khớp; dùng thao tác Lưu thông thường.');
      // The review surface never exposes UID/email or unrestricted user data.
      const comparison='Canonical: '+acl.branches.join(',')+' | cơ sở mặc định '+(acl.primary||'ĐÃ THU HỒI')
        +'\nMirror: '+oldMirrorACL.branches.join(',')+' | cơ sở mặc định '+(oldMirrorACL.primary||'ĐÃ THU HỒI')
        +'\nPhiên bản canonical/mirror: '+(oldCoach.assignmentVersion||'legacy').length+'/'+(mirror.assignmentVersion||'legacy').length+' ký tự';
      if(!global.confirm('Đối soát phân quyền HLV cùng CLB (không tăng cơ sở):\n'+comparison+'\n\nChọn CANONICAL làm nguồn thẩm quyền và khôi phục mirror?'))
        throw error('auth/coach-repair-cancelled','Đã hủy repair trước khi ghi.');
      if(typeof global.prompt!=='function'||global.prompt('Nhập chính xác KHOI PHUC để xác nhận cập nhật nguyên tử:', '')!=='KHOI PHUC')
        throw error('auth/coach-repair-cancelled','Chưa xác nhận repair bằng từ khóa; không ghi dữ liệu.');
      repairBaseline={coach:oldCoach,mirror,canonicalVersion:oldCoach.assignmentVersion||'legacy',mirrorVersion:mirror.assignmentVersion||'legacy',epoch:epoch??0,branchCount:count};
    }
    // A9R3: each document claims its *own* version before this atomic write.
    // In a reviewed repair canonicalVersion != mirrorVersion is allowed; the new
    // assignmentVersion must match after the write. Rules CAS validates both.
    const canonicalPreviousVersion=repair?repairBaseline.canonicalVersion:(data.assignmentVersion||(creating?'absent':'legacy'));
    const mirrorPreviousVersion=repair?repairBaseline.mirrorVersion:(userSnap.exists()?(userSnap.data()?.assignmentVersion||'legacy'):'absent');
    const assignmentVersion=global.crypto.randomUUID?.()||Array.from(global.crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
    // Keep all existing primary aliases in sync. Older Coach records can retain
    // primaryCoachBranch; a partial update otherwise makes login reject a valid ACL.
    const fields={assignmentVersion,status:data.status||'active',role:'coach',clubId:club,branch:assignment.primary,coachBranch:assignment.primary,primaryCoachBranch:assignment.primary,allowedBranches:assignment.branches,defaultBranch:assignment.primary,email:data.email||'',updatedAt:new Date().toISOString()};
    const coachFields={...fields,assignmentPreviousVersion:canonicalPreviousVersion};
    const userFields={...fields,assignmentPreviousVersion:mirrorPreviousVersion};
    const coachRef=doc(firestore,'clubs',club,'coaches',uid),userRef=doc(firestore,'users',uid),rootRef=doc(firestore,'clubs',club);
    let commitError=null;
    if(repair){
      const {runTransaction}=sdk();
      if(typeof runTransaction!=='function')throw error('auth/coach-repair-cas-unavailable','Không có Firestore transaction/CAS; tuyệt đối không fallback sang batch thường.');
      const expected=repairBaseline;
      const identity=d=>JSON.stringify({role:d?.role,clubId:d?.clubId,status:d?.status||'active',branch:d?.branch||'',coachBranch:d?.coachBranch||'',primaryCoachBranch:d?.primaryCoachBranch||'',defaultBranch:d?.defaultBranch||'',allowedBranches:d?.allowedBranches||[],assignmentVersion:d?.assignmentVersion||'legacy'});
      const settingsRef=doc(firestore,'clubs',club,'settings','main_config');
      try{
        await runTransaction(firestore,async txn=>{
          owner.ensure();
          // Transaction reads must precede all writes; SDK rechecks every read
          // version at commit, including mirror, which writeBatch cannot do.
          const [c,u,r,setting]=await Promise.all([txn.get(coachRef),txn.get(userRef),txn.get(rootRef),txn.get(settingsRef)]);
          owner.ensure();
          if(!c.exists()||!u.exists()||!r.exists()||!setting.exists()||
            identity(c.data())!==identity(expected.coach)||identity(u.data())!==identity(expected.mirror)||
            (r.data()?.coachAclEpoch??0)!==expected.epoch||setting.data()?.branchCount!==expected.branchCount)
            throw error('auth/coach-repair-cas-conflict','Canonical/mirror/epoch/cấu hình đã đổi sau preflight. Dừng, không overwrite.');
          txn.set(coachRef,{...data,...coachFields,uid},{merge:true});
          txn.set(userRef,userFields,{merge:true});
          txn.set(rootRef,{coachAclEpoch:increment(1)},{merge:true});
        },{maxAttempts:3});
      }catch(e){commitError=e}
    }else{
      const batch=writeBatch(firestore);
      batch.set(coachRef,{...data,...coachFields,uid},{merge:true});batch.set(userRef,userFields,{merge:true});batch.set(rootRef,{coachAclEpoch:increment(1)},{merge:true});owner.ensure();
      try{await batch.commit()}catch(e){commitError=e}
    }
    owner.ensure();
    let coach,mirror,rootAfter;
    try{
      coach=await readVerified(firestore,'clubs',club,'coaches',uid);owner.ensure();
      mirror=await readVerified(firestore,'users',uid);owner.ensure();
      rootAfter=await readVerified(firestore,'clubs',club);owner.ensure();
    }catch(e){
      const uncertain=error('COMMIT_OUTCOME_UNVERIFIED','Không thể xác minh kết quả batch từ máy chủ. Không bấm lưu lặp lại; tải lại hai hồ sơ và epoch khi có mạng.');
      uncertain.originalCode=String(commitError?.code||commitError?.name||'NONE').slice(0,80);
      uncertain.readbackCode=String(e?.code||e?.name||'READBACK_FAILED').slice(0,80);
      throw uncertain;
    }
    let paired=false;
    try{paired=coach.exists()&&mirror.exists()&&rootAfter.exists()&&rootAfter.data().coachAclEpoch===(epoch??0)+1&&coach.data().assignmentPreviousVersion===canonicalPreviousVersion&&mirror.data().assignmentPreviousVersion===mirrorPreviousVersion&&[coach.data(),mirror.data()].every(d=>d.role==='coach'&&d.clubId===club&&d.assignmentVersion===assignmentVersion&&d.status===fields.status&&same(normalizeAssignment(d,{allowRevoked:true}),assignment));}catch{}
    if(!paired){
      if(commitError)throw commitError; // preserve actual SDK error code/name.
      throw error('COMMIT_OUTCOME_UNVERIFIED','Batch đã gửi nhưng readback không khớp. Không được tự động thử lại vì kết quả có thể đã thay đổi.');
    }
    return true; // Lost ACK: accept only exact authoritative readback.
  }
  async function loadCoachAccounts(){
    const list=document.getElementById('coachAccountsList');if(!list)return;
    list.textContent='Đang tải...';
    try{
      const owner=adminContext(),{collection,getDocs,query,limit}=sdk();
      const snap=await getDocs(query(collection(owner.firestore,'clubs',owner.club,'coaches'),limit(200)));owner.ensure();
      if(snap.empty){list.textContent='Chưa có tài khoản HLV nào';return}
      let html='';snap.forEach(item=>{const data=item.data()||{};let assigned=null;try{assigned=normalizeAssignment(data)}catch{}
        html+='<section style="padding:12px;border:1px solid #cbd5e1;border-radius:10px;margin:8px 0"><strong>'+esc(data.displayName||data.email||'HLV')+'</strong><div>'+esc(data.email||'')+'</div><div>'+esc(assigned?assigned.branches.map(branchName).join(' · '):'Chưa có phân công hợp lệ — cần Admin chọn lại')+'</div>'+choices(selectId(item.id),assigned?.branches||[])+'<button type="button" data-coach-save="'+esc(item.id)+'" style="padding:10px">💾 Lưu cơ sở</button><button type="button" data-coach-repair="'+esc(item.id)+'" style="padding:10px" title="Chỉ dành cho hồ sơ canonical/mirror bị lệch; yêu cầu xác nhận và CAS">🛠 Khôi phục mirror</button><button type="button" data-coach-status="'+esc(item.id)+'">'+(disabled(data)?'Mở khóa':'Khóa HLV')+'</button><button type="button" data-coach-reset="'+esc(data.email||'')+'">Đặt lại MK</button><button type="button" data-coach-delete="'+esc(item.id)+'" data-coach-email="'+esc(data.email||'')+'">Xóa HLV</button></section>';
      });list.innerHTML=html;
      snap.forEach(item=>{bindChoices(selectId(item.id));const box=document.getElementById(selectId(item.id));if(box)box.dataset.assignmentVersion=item.data().assignmentVersion||'legacy';try{document.getElementById(selectId(item.id)+'_primary').value=normalizeAssignment(item.data()).primary}catch{}});
      list.querySelectorAll('[data-coach-repair]').forEach(b=>b.onclick=()=>repairCoachMirror(b.dataset.coachRepair));
      list.querySelectorAll('[data-coach-status]').forEach(b=>b.onclick=()=>updateCoachStatus(b.dataset.coachStatus));
      list.querySelectorAll('[data-coach-save]').forEach(b=>b.onclick=()=>updateCoachBranch(b.dataset.coachSave));
      list.querySelectorAll('[data-coach-reset]').forEach(b=>b.onclick=()=>global.resetCoachPassword(b.dataset.coachReset));
      list.querySelectorAll('[data-coach-delete]').forEach(b=>b.onclick=()=>global.deleteCoachAccount(b.dataset.coachDelete,b.dataset.coachEmail));
    }catch(e){list.textContent='Lỗi tải phân công: '+e.message}
  }
  async function updateCoachBranch(uid){
    const el=document.getElementById(selectId(uid));
    // Disable the whole edit surface while the single owner is committing.
    if(el)el.querySelectorAll?.('input,select,button')?.forEach(node=>node.disabled=true);
    try{
      const owner=adminContext(),assignment=chosen(selectId(uid)),{doc,getDoc}=sdk();
      if(!assignment.branches.length&&!global.confirm('Thu hồi toàn bộ cơ sở của HLV? Dữ liệu chờ đồng bộ vẫn được giữ để đối soát.'))return;
      const snap=await readVerified(owner.firestore,'clubs',owner.club,'coaches',uid);owner.ensure();
      if(!snap.exists())throw error('auth/coach-assignment-missing','Không tìm thấy hồ sơ HLV trong CLB.');
      if(el?.dataset.assignmentVersion !== (snap.data().assignmentVersion||'legacy'))throw error('auth/coach-assignment-stale','Phân công đã được Admin khác thay đổi. Tải lại danh sách trước khi lưu; không ghi đè quyền vừa thu hồi.');
      await savePair(uid,assignment,snap.data(),owner);toast('Đã lưu và xác minh '+assignment.branches.map(branchName).join(' · ')+'. HLV cần đăng nhập lại hoặc chọn cơ sở để xác minh quyền mới.');await loadCoachAccounts();
    }catch(e){global.alert('Không thể lưu cơ sở HLV: '+((e?.code==='permission-denied'||e?.code==='firestore/permission-denied')?'Firestore từ chối batch phân quyền. Chưa có readback xác minh thành công; cần đối chiếu Rules cùng phiên bản, quyền Admin và 3 document.':e.message))}finally{if(el)el.querySelectorAll?.('input,select,button')?.forEach(node=>node.disabled=false)}
  }
  async function repairCoachMirror(uid){
    const el=document.getElementById(selectId(uid));
    if(el)el.querySelectorAll?.('input,select,button')?.forEach(node=>node.disabled=true);
    try{
      const owner=adminContext();
      const coach=await readVerified(owner.firestore,'clubs',owner.club,'coaches',uid);owner.ensure();
      if(!coach.exists())throw error('auth/coach-assignment-missing','Canonical Coach không tồn tại; dừng repair.');
      if(el?.dataset.assignmentVersion!==(coach.data().assignmentVersion||'legacy'))
        throw error('auth/coach-assignment-stale','Admin cần tải lại trước khi repair.');
      // Never grant a new branch during ACL recovery. Normal editing uses savePair
      // without repair and retains its strict stale-mirror guard.
      await savePair(uid,normalizeAssignment(coach.data(),{allowRevoked:true}),coach.data(),owner,{repair:true});
      toast('Đã xác minh khôi phục cặp HLV từ server.');await loadCoachAccounts();
    }catch(e){global.alert('Chưa khôi phục ACL HLV: '+String(e?.message||e?.code||'UNKNOWN'))}
    finally{if(el)el.querySelectorAll?.('input,select,button')?.forEach(node=>node.disabled=false)}
  }
  async function updateCoachStatus(uid){
    try{
      const owner=adminContext(),{doc,getDoc}=sdk(),snap=await readVerified(owner.firestore,'clubs',owner.club,'coaches',uid);owner.ensure();
      if(!snap.exists())throw Error('Không tìm thấy HLV.');
      const box=document.getElementById(selectId(uid)),data=snap.data();
      if(box?.dataset.assignmentVersion!==(data.assignmentVersion||'legacy'))throw Error('Phân công đã thay đổi. Tải lại danh sách trước khi khóa/mở khóa.');
      const status=disabled(data)?'active':'locked';if(!global.confirm(status==='locked'?'Khóa quyền HLV và giữ journal để đối soát?':'Mở khóa HLV theo đúng phân công hiện hành?'))return;
      await savePair(uid,normalizeAssignment(data,{allowRevoked:true}),{...data,status},owner);toast('Đã cập nhật và xác minh trạng thái HLV.');await loadCoachAccounts();
    }catch(e){global.alert('Chưa cập nhật được trạng thái HLV: '+e.message)}
  }
  let pendingCreated=null;
  async function createCoachAccount(){
    const btn=document.getElementById('btnCreateCoach');if(btn)btn.disabled=true;
    try{
      const owner=adminContext(),email=(document.getElementById('coach_email')?.value||'').trim(),pass=(document.getElementById('coach_pass')?.value||'').trim(),name=(document.getElementById('coach_name')?.value||'').trim();
      const assignment=chosen('coach_create_branches','coach_branch');
      if(!assignment.branches.length||!email||!name||(!pendingCreated&&pass.length<6))throw Error('Nhập tên, email, mật khẩu tối thiểu 6 ký tự và chọn cơ sở được phép.');
      const {createUserWithEmailAndPassword,signOut}=sdk();
      if(pendingCreated&&(pendingCreated.email!==email||pendingCreated.club!==owner.club))throw error('auth/coach-create-pending','Tài khoản Auth trước chưa hoàn tất; xử lý hồ sơ cũ trước khi tạo tài khoản khác.');
      if(!pendingCreated){const cred=await createUserWithEmailAndPassword(global._secondaryAuth,email,pass);pendingCreated={uid:cred.user.uid,email,club:owner.club};}
      owner.ensure();await savePair(pendingCreated.uid,assignment,{email,displayName:name,createdAt:new Date().toISOString()},owner,{creating:true});pendingCreated=null;
      try{await signOut(global._secondaryAuth)}catch{}
      global.alert('Đã tạo và xác minh hồ sơ HLV: '+email+' — '+assignment.branches.map(branchName).join(' · '));
      ['coach_email','coach_pass','coach_name'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});await loadCoachAccounts();
    }catch(e){
      // Never expose credentials or UID in logs/dialogs. A lost ACK MUST NOT
      // trigger automatic Auth creation or an unverified second ACL write.
      const prefix=pendingCreated?'Auth đã tạo nhưng hồ sơ chưa xác minh. Không tạo Auth lần hai; kiểm tra Rules/deployment và trạng thái UID. ':'';
      const detail=e?.code==='auth/email-already-in-use'?'Email đã có trong Firebase Auth. Dùng khôi phục có xác minh UID nếu đây là hồ sơ tạo dở; không tạo email khác. ':'';
      global.alert(prefix+detail+String(e?.code||e?.message||'UNKNOWN'));
    }
    finally{try{await sdk().signOut(global._secondaryAuth)}catch{}if(btn)btn.disabled=false}
  }
  // A9R4: Manual recovery of an orphaned Auth identity, never lookup-by-email
  // and never a second ACL writer. Only the matching Auth credentials + UID
  // entered from Firebase Console can establish the identity. This requires
  // Admin review and the ORIGINAL three-document savePair(creating:true).
  async function recoverCreatedCoachAccount(){
    const btn=document.getElementById('btnRecoverCoach');if(btn)btn.disabled=true;
    try{
      const owner=adminContext(),email=String(document.getElementById('coach_email')?.value||'').trim(),
        password=String(document.getElementById('coach_pass')?.value||''),
        name=String(document.getElementById('coach_name')?.value||'').trim(),
        assignment=chosen('coach_create_branches','coach_branch');
      if(!email||!name||password.length<6||!assignment.branches.length)
        throw error('auth/coach-recovery-input','Cần tên, email, mật khẩu đúng của Auth hiện có và cơ sở được phép.');
      if(pendingCreated)throw error('auth/coach-recovery-pending','Phiên hiện tại đang có Auth vừa tạo; chỉ dùng Tạo tài khoản để hoàn tất hồ sơ đó.');
      if(!global.confirm('Chỉ dùng chức năng này cho UID Auth đã tạo dở và chưa có cả canonical Coach lẫn User mirror.\nĐã kiểm tra UID ở Firebase Console và sao lưu trạng thái?'))return;
      const uid=String(global.prompt?.('Nhập UID Auth đã kiểm tra trong Firebase Console (không nhập email):','')||'').trim();
      if(!/^[A-Za-z0-9_-]{6,128}$/.test(uid))throw error('auth/coach-recovery-uid','UID không hợp lệ hoặc chưa được cung cấp.');
      const {signInWithEmailAndPassword,signOut}=sdk();
      if(typeof signInWithEmailAndPassword!=='function'||!global._secondaryAuth)
        throw error('auth/coach-recovery-auth-unavailable','Không có secondary Firebase Auth. Không được dùng primary session.');
      // Identity must be proven by Firebase Auth, not by a caller-supplied UID.
      const identity=await signInWithEmailAndPassword(global._secondaryAuth,email,password);
      owner.ensure();
      if(identity?.user?.uid!==uid||String(identity?.user?.email||'').toLowerCase()!==email.toLowerCase())
        throw error('auth/coach-recovery-identity-mismatch','UID/email đã xác minh bằng Auth không trùng UID Admin kiểm tra; dừng khôi phục.');
      const coach=await readVerified(owner.firestore,'clubs',owner.club,'coaches',uid);owner.ensure();
      if(coach.exists())throw error('auth/coach-recovery-review','Đã có canonical Coach. Không được tạo ghi đè; dùng đối soát ACL/repair hiện hữu.');
      // A9R3 Rules prevent creating a mirror on an existing user document:
      // its assignmentPreviousVersion='absent' is DENIED for UPDATE.
      // Do not read a nonexistent user before write (the root of A9R3 bug).
      if(!global.confirm('Đã xác minh đúng Auth UID và canonical Coach chưa tồn tại.\nChỉ ghi cặp hồ sơ khi cả Coach/User mirror chưa có, không thay quyền của hồ sơ hiện hữu. Xác nhận tiếp tục?'))return;
      await savePair(uid,assignment,{email,displayName:name,createdAt:new Date().toISOString()},owner,{creating:true});
      global.alert('Đã khôi phục và đọc lại hồ sơ HLV từ server. Hãy đặt lại mật khẩu lộ trong ảnh nếu có.');
      for(const id of ['coach_email','coach_pass','coach_name']){const el=document.getElementById(id);if(el)el.value='';}
      await loadCoachAccounts();
    }catch(e){global.alert('Không thể khôi phục Auth tạo dở: '+String(e?.code||e?.message||'UNKNOWN')+'. Không thử tạo Auth lần nữa và không chỉnh UID thủ công.');}
    finally{try{await sdk().signOut?.(global._secondaryAuth)}catch{}if(btn)btn.disabled=false;}
  }
  async function migrateCoachAccounts(){
    const btn=document.getElementById('btnMigrateCoaches');if(btn)btn.disabled=true;
    try{
      const owner=adminContext(),{collection,query,limit,getDocs}=sdk();const snap=await getDocs(query(collection(owner.firestore,'clubs',owner.club,'coaches'),limit(200)));owner.ensure();let saved=0,review=0;
      if(!global.confirm('Kiểm tra và tải backup phân công hiện tại trước khi đồng bộ tối đa 200 HLV? Không tự cấp thêm cơ sở.'))return;
      const backup=[];
      for(const coach of snap.docs){
        const user=await readVerified(owner.firestore,'users',coach.id);owner.ensure();
        backup.push({uid:coach.id,assignment:coach.data(),mirror:user.exists()?user.data():null});
      }
      const blob=new Blob([JSON.stringify({clubId:owner.club,createdAt:new Date().toISOString(),records:backup},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='coach-acl-backup.json';link.click();URL.revokeObjectURL(url);
      if(!global.confirm('Chỉ tiếp tục khi đã giữ được backup. Đồng bộ các quyền đang được Admin cấp, không thêm cơ sở?'))return;
      for(const row of backup){try{const data={...row.assignment,status:disabled(row.assignment)||disabled(row.mirror)?'locked':row.assignment.status||'active'};await savePair(row.uid,normalizeAssignment(data,{allowRevoked:true}),data,owner);saved++}catch(e){review++;console.warn('[CoachAssignment] record failed (UID redacted)',String(e?.code||'UNKNOWN').slice(0,60))}owner.ensure();}
      global.alert('Đã xác minh '+saved+' hồ sơ; cần Admin kiểm tra '+review+'. Phạm vi lần này tối đa 200 hồ sơ, không tự mở thêm cơ sở.');await loadCoachAccounts();
    }catch(e){global.alert('Đồng bộ chưa hoàn tất: '+e.message)}finally{if(btn)btn.disabled=false}
  }
  function installAdminOverrides(){
    if(!global.__appLoaded)return setTimeout(installAdminOverrides,25);
    Object.assign(global,{loadCoachAccounts,updateCoachBranch,createCoachAccount,recoverCreatedCoachAccount,migrateCoachAccounts});
  }
  global.CoachBranchRuntimeRepair=Object.freeze({version:'A6',loadCoachAccounts,createCoachAccount,recoverCreatedCoachAccount,migrateCoachAccounts,resolveAuthContext,normalizeAssignment,allowedBranches,renderCoachBranchSelectors,renderCreateBranchChoices,installAdminOverrides});
  installAdminOverrides();
})(window);
