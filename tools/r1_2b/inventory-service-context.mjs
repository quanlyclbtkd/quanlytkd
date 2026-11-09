import { pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT=process.env.ROOT||process.cwd(); if(!ROOT) throw new Error('ROOT required');
const {installTransactionFixture}=await import(pathToFileURL(path.join(ROOT,'tools/inventory-stock-r1/transaction-fixture.mjs')).href);
let seq=0; const state={ops:[], merges:[], txMerges:[], removes:[], notifies:[]};
function setClub(club){ window.__store.clubId=club; window.__store.invRef={path:`clubs/${club}/inventory`,id:'inventory'}; window.__store.colRef={path:`clubs/${club}/transactions`,id:'transactions'}; }
function mkSdk(hooks={}){return {
 doc(...args){ if(args.length===1&&args[0]?.path){const id=`auto${++seq}`;return {path:`${args[0].path}/${id}`,id};} const seg=args.slice(1).map(String); const id=seg.at(-1)||`auto${++seq}`; return {path:seg.join('/'),id};},
 collection(...args){return {path:args.slice(1).map(String).join('/'),id:String(args.at(-1))};},
 increment:n=>({inc:n}), where:(...x)=>x, query:(...x)=>({q:x}),
 async getDoc(ref){ if(hooks.getDoc) await hooks.getDoc(ref); return {exists:()=>true,id:ref.id,data:()=>({category:'Võ phục',size:'1',type:'Xuất bán',qty:1,desc:'X',amount:100,unpaid:true,branch:'CS1'})};},
 async getDocs(){return {empty:true,docs:[]};},
 writeBatch(){ const ops=[]; state.ops.push(ops); return {set(ref,data,opt){ops.push(['set',ref.path,data,opt])},update(ref,data){ops.push(['update',ref.path,data])},delete(ref){ops.push(['delete',ref.path])}, async commit(){ if(hooks.commit) await hooks.commit(ops); }};}
};}
function setup(hooks={}){global.window={__store:{db:{},clubId:'A'},_fb_init:mkSdk(hooks),getLocalToday:()=> '2026-11-03',mergeInventoryIntoRuntimeStore:(x,r)=>state.merges.push([window.__store.clubId,x.id,r]),mergeTransactionIntoRuntimeStore:(x,r)=>state.txMerges.push([window.__store.clubId,x.id,r]),removeInventoryFromRuntimeStore:(id,r)=>state.removes.push([window.__store.clubId,id,r]),notifyInventoryMutation:(r,o)=>state.notifies.push([window.__store.clubId,r]),canonicalizeTransactionForWrite:x=>x,canonicalizeTransactionPatch:x=>x};setClub('A');installTransactionFixture(window._fb_init,ref=>window._fb_init.getDoc(ref));}
async function load(tag){return (await import(pathToFileURL(path.join(ROOT,'js/services/inventory.service.js')).href+`?${tag}-${Date.now()}-${Math.random()}`)).InventoryService;}
const results=[]; function chk(name,ok,detail){results.push({name,ok,detail}); console.log(ok?'PASS':'RED',name,detail||'');}
// add
state.ops=[];state.merges=[];state.notifies=[];setup({commit:async()=>{setClub('B')}});let S=await load('add');await S.addItem({category:'Võ phục',size:'1',type:'Nhập kho',qty:1});chk('B1_ADD_NO_B_PROJECTION',!state.merges.some(x=>x[0]==='B')&&!state.notifies.some(x=>x[0]==='B'),JSON.stringify({merges:state.merges,notifies:state.notifies}));
// prepared
state.ops=[];state.merges=[];state.txMerges=[];state.notifies=[];setup({commit:async()=>{setClub('B')}});S=await load('prep');const prepared=S.prepareAddItemMutation({category:'Võ phục',size:'1',type:'Nhập kho',qty:1});await S.commitPreparedAddItem({prepared,financeTx:{ref:{path:'clubs/A/transactions/txp',id:'txp'},payload:{},runtimeTx:{id:'txp'}}});chk('B1_PREPARED_NO_B_PROJECTION',state.merges.length===0&&state.txMerges.length===0&&state.notifies.length===0,JSON.stringify({merges:state.merges,tx:state.txMerges,notifies:state.notifies}));
// update same ref + projection
state.ops=[];state.merges=[];state.txMerges=[];state.notifies=[];setup({commit:async()=>{setClub('B')}});S=await load('update');await S.updateItem('same',{amount:200},{previous:{id:'same',category:'Võ phục',size:'1',type:'Xuất bán',qty:1,amount:100,unpaid:true},relatedTransaction:{id:'tx1',data:{amount:200},previous:{id:'tx1'}}});const paths=state.ops.flat().map(x=>x[1]).filter(Boolean);chk('B1_UPDATE_SINGLE_CLUB_AND_NO_B_PROJECTION',paths.every(p=>p.includes('clubs/A/'))&&state.merges.length===0&&state.txMerges.length===0&&state.notifies.length===0,JSON.stringify({paths,merges:state.merges,tx:state.txMerges,notifies:state.notifies}));
// delete
state.ops=[];state.removes=[];state.notifies=[];setup({commit:async()=>{setClub('B')}});S=await load('delete');await S.deleteItem('same',{previous:{id:'same',category:'Võ phục',size:'1',type:'Xuất bán',qty:1,amount:100,unpaid:true},relatedTxId:'tx1'});chk('B1_DELETE_NO_B_REMOVE',state.removes.length===0&&state.notifies.length===0,JSON.stringify({removes:state.removes,notifies:state.notifies}));
// markPaid
state.ops=[];state.merges=[];state.txMerges=[];state.notifies=[];setup({commit:async()=>{setClub('B')}});S=await load('paid');await S.markPaid('same');chk('B1_MARKPAID_NO_B_PROJECTION',state.merges.length===0&&state.txMerges.length===0&&state.notifies.length===0,JSON.stringify({merges:state.merges,tx:state.txMerges,notifies:state.notifies}));
// fallback mixed refs: switch during getDoc
state.ops=[];state.merges=[];state.txMerges=[];state.notifies=[];setup({getDoc:async()=>{setClub('B')}});S=await load('fallback');let staleReadAbort=false;try{await S.updateItem('same',{amount:200},{relatedTransaction:{id:'tx1',data:{amount:200},previous:{id:'tx1'}}});}catch(error){staleReadAbort=error.code==='finance/write-context-stale';}const fpaths=state.ops.flat().map(x=>x[1]).filter(Boolean);chk('B1_FALLBACK_STALE_READ_DENIES_BEFORE_WRITE',staleReadAbort&&fpaths.length===0,JSON.stringify(fpaths));
const fails=results.filter(r=>!r.ok).length; console.log('FAILS',fails,'OF',results.length); process.exitCode=fails?1:0;
