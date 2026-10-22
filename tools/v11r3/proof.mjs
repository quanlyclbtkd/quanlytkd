// Tooling only. No Firebase dependency, session establishment or application writer.
import crypto from 'node:crypto';
export const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
export const sha=v=>crypto.createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
export const requireProof=(yes,code)=>{if(!yes)throw Object.assign(Error('AUDIT_BLOCKED: '+code),{code})};
export function signedPayload(envelope,{publicKey,trustedKeySHA256,purpose,now=Date.now()}){
 const key=crypto.createPublicKey(publicKey);requireProof(key.asymmetricKeyType==='ed25519','OWNER_KEY_TYPE');
 requireProof(/^[0-9a-f]{64}$/.test(trustedKeySHA256||'')&&sha(key.export({type:'spki',format:'der'}))===trustedKeySHA256,'OWNER_KEY_NOT_PINNED');
 const p=envelope?.payload;requireProof(p?.decision==='approved'&&p.authority==='system_owner'&&p.purpose===purpose,'OWNER_DECISION_PENDING_OR_WRONG_PURPOSE');
 requireProof(crypto.verify(null,Buffer.from(canonical(p)),key,Buffer.from(envelope.signature||'','base64')),'OWNER_SIGNATURE_INVALID');
 requireProof(Number.isFinite(Date.parse(p.notBefore))&&Date.parse(p.notBefore)<=now&&Number.isFinite(Date.parse(p.expiresAt))&&Date.parse(p.expiresAt)>now,'OWNER_DECISION_EXPIRED');
 requireProof(p.environment==='demo'?p.evidenceScope==='DEMO_ONLY':p.environment==='staging'&&p.evidenceScope==='STAGING_VERIFIED','DEMO_EVIDENCE_NOT_STAGING');
 requireProof(p.environment==='demo'||p.fixture!==true,'TEST_FIXTURE_NOT_STAGING_AUTHORITY');
 return p;
}
export function timestampKey(s){const m=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(s||'');requireProof(m&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(m[1]+'Z')).toISOString().slice(0,19)===m[1],'READ_TIME_INVALID');return m[1]+'.'+(m[2]||'').padEnd(9,'0')+'Z'}
export const order=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
export function safeProject(p){requireProof(/^[a-z][a-z0-9-]{4,62}$/.test(p||''),'PROJECT_INVALID');requireProof(p!=='quanly-tst','PRODUCTION_TARGET_FORBIDDEN');}
