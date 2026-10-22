// Fail closed on missing real owner/device/staging evidence. Read-only; no deploy.
import fs from 'node:fs';import {validate,fileDigest,runtimeHash} from './cutover.mjs';import {HISTORY_COACH_ACCESS} from '../../js/core/attendanceContract.js';
try{
 if(!HISTORY_COACH_ACCESS)throw Error('RELEASE_HOLD: default build is maintenance; no Coach cutover approved');
 const input=process.env.V11R2_RELEASE_DECISION_BUNDLE,keyFile=process.env.V11R2_OWNER_PUBLIC_KEY,pin=process.env.V11R2_TRUSTED_OWNER_KEY_SHA256;
 if(!input||!keyFile||!pin)throw Error('RELEASE_HOLD: real signed decision bundle and separately trusted owner key are required');
 const {bundle,evidence}=JSON.parse(fs.readFileSync(input)),proof=validate(bundle,{...evidence,ownerPublicKey:fs.readFileSync(keyFile,'utf8'),trustedOwnerKeySHA256:pin,now:Date.now()});
 if(proof.status!=='STAGING_CANDIDATE_VERIFIED_NOT_DEPLOYED')throw Error('RELEASE_HOLD: demo evidence never authorizes release');
 if(fileDigest('firestore.rules')!==bundle.plan.activeRulesSHA256||fileDigest('js/core/attendanceContract.js')!==bundle.plan.activeContractSHA256||fileDigest('firestore.indexes.json')!==bundle.plan.indexesSHA256||runtimeHash(process.cwd())!==bundle.plan.activeRuntimeSHA256)throw Error('RELEASE_HOLD: source/Rules/index identities differ from approved candidate');
 const a=evidence.approval.acceptance;
 if(!a||a.runtimeSHA256!==bundle.plan.activeRuntimeSHA256||a.rulesSHA256!==bundle.plan.activeRulesSHA256||a.indexesSHA256!==bundle.plan.indexesSHA256||a.deployedStagingIdentityVerified!==true||a.twoAccountBrowserJournal!==true||a.androidCoachPhysicalOffline!==true||a.iphoneSafariDebtQR!==true||a.iphoneSafariMultiReceiptQR!==true||a.independentPNGDecoderPassed!==true||a.providerTestDestinationApproved!==true)throw Error('RELEASE_HOLD: physical device, both QR paths and deployed staging identity evidence missing');
 console.log('SIGNED RELEASE EVIDENCE MATCHES EXACT CANDIDATE; this command performs no deployment');
}catch(error){console.error(error.message);process.exitCode=1}
