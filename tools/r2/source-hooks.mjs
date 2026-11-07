// Test-loader-only source taps. Disk runtime remains byte-identical to R1.
// No source pin bypass: authenticate the disk source before using this loader.
// These overlays have UNIT_TEST evidence only and are not a deployed build.
import {parse} from '../v11r2/vendor/acorn.mjs';
const prefix=`\nfunction __r2mark(marker){try{globalThis.__financeLatencyTraceR2?.mark(marker);}catch(_){}}\nfunction __r2source(source,end){try{globalThis.__financeLatencyTraceR2?.source(source,end);}catch(_){}}\n`;
export function instrumentSource(file,source,{enabled=true}={}) {
  if(!enabled)return source;
  const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'}),edits=[];
  const insert=(at,text)=>edits.push({at,text});
  const wrap=(node,enter,leave)=>{insert(node.body.start+1,enter+'\ntry{\n');insert(node.body.end-1,'\n}finally{'+leave+'}\n');};
  const nodes=[];function walk(n,parent){if(!n||typeof n!=='object')return;nodes.push({n,parent});for(const v of Object.values(n))if(Array.isArray(v))v.forEach(x=>walk(x,n));else if(v&&typeof v==='object'&&v.type)walk(v,n);}walk(tree);
  if(file==='js/core/tuitionCommandBoundary.js') {
    const collect=nodes.find(({n,parent})=>parent?.key?.name==='collectTuition'&&n.type==='FunctionExpression')?.n;
    const resolver=nodes.find(({n})=>n.type==='FunctionDeclaration'&&n.id.name==='_resolveTuitionSettlementForWrite')?.n;
    if(!collect||!resolver)throw Error('R2_HOOK_OWNER_MISSING');
    insert(collect.body.start+1,"__r2mark('boundaryEnter');__r2mark('validationStart');");
    const runner=nodes.find(({n})=>n.type==='ReturnStatement'&&n.start>collect.start&&n.end<collect.end&&source.slice(n.argument?.start,n.argument?.start+24).startsWith("_run('tuition"))?.n;
    if(!runner)throw Error('R2_RUNNER_MISSING');insert(runner.start,"__r2mark('validationEnd');");
    wrap(resolver,"__r2mark('evidenceStart');","__r2mark('evidenceEnd');");
    const decision=nodes.find(({n})=>n.type==='VariableDeclaration'&&n.start>collect.start&&n.end<collect.end&&source.slice(n.start,n.end).startsWith('const writeDecision = await'))?.n;
    if(!decision)throw Error('R2_DECISION_MISSING');insert(decision.end,"__r2mark('recheckStart');");
    const today=nodes.find(({n})=>n.type==='VariableDeclaration'&&n.start>collect.start&&n.end<collect.end&&source.slice(n.start,n.end).startsWith('const today = getLocalToday'))?.n;
    if(!today)throw Error('R2_RECHECK_MISSING');insert(today.start,"__r2mark('recheckEnd');");
  }
  if(file==='js/services/finance.service.js') {
    const read=nodes.find(({n})=>n.type==='FunctionDeclaration'&&n.id.name==='_readCompleteQuerySource')?.n;
    if(!read)throw Error('R2_SOURCE_OWNER_MISSING');wrap(read,'__r2source(source,false);','__r2source(source,true);');
    const commit=nodes.find(({n})=>n.type==='ExpressionStatement'&&source.slice(n.start,n.end)==='await batch.commit();')?.n;
    if(!commit)throw Error('R2_PRIMARY_ACK_MISSING');insert(commit.start,"__r2mark('commitStart');");insert(commit.end,"__r2mark('primaryAck');");
  }
  if(file==='js/modules/finance.js') {
    const q=nodes.find(({n})=>n.type==='AssignmentExpression'&&n.left?.object?.name==='window'&&n.left?.property?.name==='quickPay')?.n.right;
    if(!q)throw Error('R2_UI_OWNER_MISSING');wrap(q,"__r2mark('handlerEnter');__r2mark('validationStart');","__r2mark('commandReturn');");
    const feedback=nodes.find(({n})=>n.type==='ExpressionStatement'&&n.start>q.start&&n.end<q.end&&source.slice(n.start,n.end).startsWith('window.showToast(result.completedReplay'))?.n;
    if(!feedback)throw Error('R2_SUCCESS_OWNER_MISSING');insert(feedback.end,"__r2mark('successFeedback');");
    const receipt=nodes.find(({n})=>n.type==='VariableDeclaration'&&source.slice(n.start,n.end).startsWith('const receipt = window.exportReceipt'))?.n;
    if(!receipt)throw Error('R2_RECEIPT_OWNER_MISSING');insert(receipt.start,"__r2mark('receiptQueued');");
    for(const name of ['onsubmit','processCombo']) {
      const assignment=nodes.find(({n})=>n.type==='AssignmentExpression'&&n.left?.property?.name===name&&n.left?.object?.name===(name==='onsubmit'?'_txFormEl':'window'))?.n;
      if(!assignment)throw Error('R2_FORM_OWNER_MISSING');const fn=assignment.right;
      wrap(fn,"__r2mark('handlerEnter');__r2mark('validationStart');","__r2mark('commandReturn');");
      const inside=nodes.filter(({n})=>n.start>fn.start&&n.end<fn.end);
      const declaration=prefix=>inside.find(({n})=>n.type==='VariableDeclaration'&&source.slice(n.start,n.end).startsWith(prefix))?.n;
      const lane=declaration(name==='onsubmit'?'const result = await laneOwner.runInProfile':'const result=await laneOwner.runInProfile');
      if(lane)insert(lane.start,"__r2mark('validationEnd');__r2mark('boundaryEnter');");
      const decision=declaration(name==='onsubmit'?'const tuitionDecision = await':'const decisions=await');
      if(decision)insert(decision.end,"__r2mark('recheckStart');");
      const atomic=declaration(name==='onsubmit'?'const atomic = await FinanceService.commitAtomic':'const atomic=await FinanceService.commitAtomic');
      if(atomic)insert(atomic.start,"__r2mark('recheckEnd');");
      const toast=inside.find(({n})=>n.type==='ExpressionStatement'&&source.slice(n.start,n.end).startsWith(name==='onsubmit'?"window.showToast('✅ Đã lưu khoản thu!')":"window.showToast('✅ Đã ghi sổ gộp thành công!')"))?.n;
      if(toast)insert(toast.end,"__r2mark('successFeedback');");
      if(name==='processCombo'){const receipt=inside.find(({n})=>n.type==='ExpressionStatement'&&source.slice(n.start,n.end).startsWith('window.exportReceipt?.'))?.n;if(receipt)insert(receipt.start,"if(typeof window.exportReceipt==='function')__r2mark('receiptQueued');");}
    }
  }
  if(!edits.length)return source;
  let output=source;for(const e of edits.sort((a,b)=>b.at-a.at))output=output.slice(0,e.at)+e.text+output.slice(e.at);
  output=prefix+output;parse(output,{ecmaVersion:'latest',sourceType:'module'});return output;
}
