// Explicit reviewed source allowlist. This is not an owner approval or a deploy gate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildTag} from './import-graph.mjs';
import {stagingRuntimeOverrides} from '../v11r3/staging-source.mjs';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const need = (ok, code) => { if (!ok) throw Object.assign(Error(code),{code}); };
const LEGACY_ACCEPTED_SOURCE = Object.freeze({
 id:'V11R6_RETEST_MAINTENANCE',
 inputZIP_SHA256:'6135ccdad5455ccf5a723e576445cd509e37237322a501e390fc88ae0a74c07e',
 manifest:'handoff/V11R6_RETEST/SOURCE_AND_EVIDENCE.json',
 manifestSHA256:'3f5d53c130b200818d1c6407f229ae6d2760559ff38410bfb691c60c654e698a',
 runtimeSHA256:'2d0fbaf313af623a7ceb9e48ab60cbddf045c757c30d0cf137d4d186c461bfd8',
 rulesSHA256:'0d54b2e6369944f97fb716354733879be3a3ac49579ae52012e77157926f6ab0',
 indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
 buildTag:'qr-v11r6-review-20261021'
});
const A5_ACCEPTED_SOURCE = Object.freeze({
 id:'V11R6_A5_ATTENDANCE_MAINTENANCE',
 inputZIP_SHA256:'f20d07649104f1d4d371e7fd5c4b761697163264f9ac49587f58f8a4e342436d',
 manifest:'tools/v11r2/manifests/V11R6_A5_MAINTENANCE.json',
 manifestSHA256:"655e102a617526d239e53d00bc0e8c260f5b61adcbe6cfe6f09a97e78dff7666",
 runtimeSHA256:'6ee1c5d85d965f7b545642c460adc5d45c4ff88d6ffb443a1feae0ee465fcfb2',
 rulesSHA256:'0d54b2e6369944f97fb716354733879be3a3ac49579ae52012e77157926f6ab0',
 indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
 buildTag:'qr-v11r6-attendance-a5-20261022'
});
export const ACCEPTED_SOURCE = Object.freeze({
 "id": "V11R6_A6_COACH_QR_MAINTENANCE",
 "inputZIP_SHA256": "a2bf57e0b715470764cca1031dec5f27733dcfc8276e8cb1b44e9a06a8213fa0",
 "manifest": "tools/v11r2/manifests/V11R6_A6_MAINTENANCE.json",
 "manifestSHA256": "4df93e5f4a6e9802ef139c33748a17e64550e72493b23c429e071050c4140f2f",
 "runtimeSHA256": "9a3496ea84ae5a9a486cb053b9193fe6ab1abcae55c6b96d23452304ebb1f0d2",
 "rulesSHA256": "05a0b9b27529d94e5d0b74da0b8ad95324a3ae3b3d206ab95e5eb882ba47abb5",
 "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
 "buildTag": "qr-v11r6-a6-coach-qr-20261022"
});
// A8 V2 is a separate pinned, test-only descendant of exact A7 source.
// Existing A6/A5/legacy pins remain immutable; verification still authenticates all 128 runtime files.
const A8_ACCEPTED_SOURCE = Object.freeze({
  "id": "V11R6_A8_V2_TEST_ONLY_MAINTENANCE",
  "inputZIP_SHA256": "604dd9cf428ac957cb7c65c87c61738be385267587e505b72b0878c9d3ca8517",
  "manifest": "tools/v11r2/manifests/V11R6_A8_V2_MAINTENANCE.json",
  "manifestSHA256": "fa771b5a54569539cfc4c68a0161fbf30a8ff17100b8d6eddac10b67f8a37ae9",
  "runtimeSHA256": "e560304479fcebb996cf4c7ad841fa99523658c74f6bbdd9eaf85b46c2697f83",
  "rulesSHA256": "4800a5e196342fee35be81d3cc08a03e5c7f4b062481fe7fe0be9b0e4c92c362",
  "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
  "buildTag": "qr-v11r6-a8-v2-coach-acl-qr-20261023"
});
// A9R1 is a narrow post-audit UI wiring correction on pinned A9. The prior
// lineage entries remain immutable. This pin is not an approval to deploy.
const A9R1_ACCEPTED_SOURCE = Object.freeze({
  id:'V11R6_A9R1_COACH_REPAIR_UI_TEST_ONLY',
  inputZIP_SHA256:'bee77d013cf5c1e48b8d3c242cb3807dcf8229f3eb33857f7cf52731788cb525',
  manifest:'tools/v11r2/manifests/V11R6_A9R1_TEST_ONLY.json',
  manifestSHA256:'bb4a3a26aad101e10b9b121f5a3b382d88600e89876ff68b103dc387eaee409f',
  runtimeSHA256:'3dd0d01ac85833c19ba37ce1349c6222bf64802a7ac9625370d8646ae5acf3a0',
  rulesSHA256:'4800a5e196342fee35be81d3cc08a03e5c7f4b062481fe7fe0be9b0e4c92c362',
  indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
  buildTag:'qr-v11r6-a8-v2-coach-acl-qr-20261023'
});
// A9R4 retains exact A9R3 Rules and Mirror CAS; TEST ONLY, never deploy proof.
const A9R4_ACCEPTED_SOURCE = Object.freeze({
  id:'V11R6_A9R4_COACH_ONBOARDING_QR_DIAGNOSTICS_TEST_ONLY',
  inputZIP_SHA256:'e37a67e4c6ea97890fa0ee8734ecceb07fec0831800ea46c34df652d2c5e87b8',
  manifest:'tools/v11r2/manifests/V11R6_A9R4_TEST_ONLY.json',
  manifestSHA256:'f260820d8c3aae1de6d3fa1bf7f88d400a2d8198a21c51bc730da517ebd58214',
  runtimeSHA256:'0adb9ef9719a233bf165d5b8f6cc64e0303abd026506e63b36f858a1d2a08735',
  rulesSHA256:'23aae5fcb7f0376e4dd14ac324942233dc1bf2690304f4b7521e86c878cc7dad',
  indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
  buildTag:'qr-v11r6-a8-v2-coach-acl-qr-20261023'
});
// A9R3 is a separate pinned TEST-ONLY child of A9R2 (not deployment clearance).
const A9R3_ACCEPTED_SOURCE = Object.freeze({
  id:'V11R6_A9R3_MIRROR_VERSION_CAS_TEST_ONLY',
  inputZIP_SHA256:'e4df57f7b928afadc4d307f300ca98ec65aabc51f3e1b42f835d4e17f9f897ec',
  manifest:'tools/v11r2/manifests/V11R6_A9R3_TEST_ONLY.json',
  manifestSHA256:'28689b1b7a2ff7a9acc6e763dacc298f59d7dc61fb1210582b33bbd9d0fd5b0d',
  runtimeSHA256:'ca24b73bb9625d5bef4edbbe252fe1b02adc6989ef7a36975e315ca262296be5',
  rulesSHA256:'23aae5fcb7f0376e4dd14ac324942233dc1bf2690304f4b7521e86c878cc7dad',
  indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
  buildTag:'qr-v11r6-a8-v2-coach-acl-qr-20261023'
});
// A9 extends the reviewed source allowlist; previous A8/A6/A5 pins are intact.
// This verifies artifact lineage, NOT Emulator clearance or production approval.
const A9_ACCEPTED_SOURCE = Object.freeze({
  id:'V11R6_A9_AUTH_ACL_RECOVERY_TEST_ONLY',
  inputZIP_SHA256:'19cb8d8e4d0b438823d11f404c81462dda5e9eeda443654f3c9ed3f6ff1713dd',
  manifest:'tools/v11r2/manifests/V11R6_A9_TEST_ONLY.json',
  manifestSHA256:'cea894a5b97e27471f18376f9a449bd7870bd4dcf912c77cfb048b91491a2b99',
  runtimeSHA256:'88aefc699326942791840b464fa916e4a65cd08e7c401e055187d314cf7d68c6',
  rulesSHA256:'4800a5e196342fee35be81d3cc08a03e5c7f4b062481fe7fe0be9b0e4c92c362',
  indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
  buildTag:'qr-v11r6-a8-v2-coach-acl-qr-20261023'
});
// A9R6 exact source pin for an isolated DEMO cutover candidate only.
// Not owner approval, staging evidence, activation, or production permission.
const A9R6_ATTENDANCE_DEMO_ONLY = Object.freeze({
  id:'V11R6_A9R6_COACH_ATTENDANCE_PRE_CUTOVER_TEST_ONLY',
  inputZIP_SHA256:'b57558d9bb516dc1d580b263ba0e9322b473f06c07619ecb2a94f1a5b5e2ccdf',
  manifest:'tools/v11r2/manifests/V11R6_A9R6_PIN_FOR_ATTENDANCE_DEMO_TEST_ONLY.json',
  manifestSHA256:'74cd0338854af1d56364fa5642706799cd208abbe91091a138f0e5bd45767149',
  runtimeSHA256:'0b0bec51e19cf02f38c7695cfdc22fbdae76181503f0516fb5cfdfcf9746d7a5',
  rulesSHA256:'23aae5fcb7f0376e4dd14ac324942233dc1bf2690304f4b7521e86c878cc7dad',
  indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
  buildTag:'qr-v11r6-a8-v2-coach-acl-qr-20261023'
});


// A9R10 tooling-only staging preparation pin. Runtime bytes are exactly A9R9/A9R8;
// this pin authorizes source identity verification for an isolated staging derivative only.
// It is not deployment approval and does not open Coach attendance.
const A9R10_STAGING_BASE_TEST_ONLY = Object.freeze({
  id:'V11R6_A9R10_STAGING_BASE_TEST_ONLY',
  inputZIP_SHA256:'bf42a5bc6bc1cd1512cef781ed0bd4746af32ae8e2401e6c43d2241310848961',
  manifest:'tools/v11r2/manifests/V11R6_A9R10_STAGING_BASE_TEST_ONLY.json',
  manifestSHA256:'e1853ff9f86fbb59e07836d51af83a8e313eb3497be6d6e6070a0b5ec9bb2c96',
  runtimeSHA256:'5126e8b074be4b171139ecdf7fbbbe988ccfcf2fde35738ab19549ba17d8037d',
  rulesSHA256:'23aae5fcb7f0376e4dd14ac324942233dc1bf2690304f4b7521e86c878cc7dad',
  indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
  buildTag:'qr-v11r6-a8-v2-coach-acl-qr-20261023'
});


// A9R11 enables forward-only Coach Attendance on the reviewed A9R10R2 runtime.
// Fresh historyAuthority prevents legacy attendance from entering Coach scope;
// Journal V4 isolates all pre-cutover V3 pending rows from automatic replay.
// This is TEST ONLY source identity, not deployment approval.
const A9R11_COACH_ATTENDANCE_OPERATIONAL_TEST_ONLY = Object.freeze({
  id:'V11R6_A9R11_COACH_ATTENDANCE_OPERATIONAL_TEST_ONLY',
  inputZIP_SHA256:'80540cd8099f625f742f06d1038c3c01fc6bb56a58e0316bd950861dbe7420c3',
  manifest:'tools/v11r2/manifests/V11R6_A9R11_COACH_ATTENDANCE_OPERATIONAL_TEST_ONLY.json',
  manifestSHA256:'1f85302a1b3e3bace0ae71c727e163fdcd52552b32e3250e1a47a866eee86229',
  runtimeSHA256:'d9a39ba5e961863b90b37885f298f7a0f486d541abde618019ffca1c7149adb1',
  rulesSHA256:'63af4b507ad3356966a2e843c198a2cd690dd5e7f309450c13bcaca7a0ceb089',
  indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
  buildTag:'qr-v11r6-a9r11-coach-attendance-operational-20261024'
});

// A9R12 closes the real Coach daily-list permission gap found on the UI path.
// Current-authority Attendance is canonical-branch only; Coach list queries use
// branch equality and Rules prove direct membership in server-authoritative allowedBranches.
const A9R12_COACH_ATTENDANCE_QUERY_CLOSURE_TEST_ONLY = Object.freeze({
  id:'V11R6_A9R12_COACH_ATTENDANCE_QUERY_CLOSURE_TEST_ONLY',
  inputZIP_SHA256:'aee11c8340c18c13e1ffbca08617e29c480d5c7f3017d504fcf870ab341c7b62',
  manifest:'tools/v11r2/manifests/V11R6_A9R12_COACH_ATTENDANCE_QUERY_CLOSURE_TEST_ONLY.json',
  manifestSHA256:'bfa589a7bfc0af682f2a4f3bfa46683d5197191fa870e2deb1bce0c6ef5b9651',
  runtimeSHA256:'ed4480c6ddcdda330d0acd0a960be5047a223641bfb34124b35890d0d82e5273',
  rulesSHA256:'1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3',
  indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
  buildTag:'qr-v11r6-a9r12-coach-attendance-query-closure-20261024'
});

// A9R13 fixes member-history query scope and read-stage diagnostics. Rules and history authority are unchanged.
const A9R13_MEMBER_HISTORY_DIAGNOSTICS = Object.freeze({
  "id": "V11R6_A9R13_MEMBER_HISTORY_DIAGNOSTICS",
  "inputZIP_SHA256": "fb3e45ff8839cebf1e2fbef9d337db8b9b571eb49f98d9130e0f8567a776a737",
  "manifest": "tools/v11r2/manifests/V11R6_A9R13_MEMBER_HISTORY_DIAGNOSTICS.json",
  "manifestSHA256": "bd910723a417bfe62463ab87d142acb2a4c353ebf5eadec404bf2129351e72e7",
  "runtimeSHA256": "84b301af04677175011ff8b84079fa5922c66314345998c3e9c5862a1b13e861",
  "rulesSHA256": "1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3",
  "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
  "buildTag": "qr-v11r6-a9r13-member-history-diagnostics-20261024"
});

// A9R14 fixes legacy QA contracts and mobile layout and read-stage diagnostics. Rules, assignment policy and history authority are unchanged.
const A9R14_QA_MOBILE = Object.freeze({
  "id": "V11R6_A9R14_QA_MOBILE",
  "coachAssignmentContract": "server-verified-multi-branch-v1",
  "inputZIP_SHA256": "31030b29f44c171c7f3c4e891ff05c4ce393877fd63db7d3daccd59baa3be88f",
  "manifest": "tools/v11r2/manifests/V11R6_A9R14_QA_MOBILE.json",
  "manifestSHA256": "42ff81582d3a136ffc2fb09d57838f7844036b0c0f16007a30389461154cc0e4",
  "runtimeSHA256": "91dbd8a9866552c2317b7ee676ff019c285e2338febebe59c7d9376b4f956fe4",
  "rulesSHA256": "1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3",
  "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
  "buildTag": "qr-v11r6-a9r14-qa-mobile-20261025"
});

// A9R15 registration consistency and authorized history; source identity only, no release approval.
const A9R15_TRAINING_HISTORY = Object.freeze({
  "id": "V11R6_A9R15_TRAINING_HISTORY",
  "canonicalFileCount": 129,
  "coachAssignmentContract": "server-verified-multi-branch-v1",
  "inputZIP_SHA256": "a81478cb6fb50eeed23ece4d0e106c949d73397010d52ead8adff6841bbc5c8a",
  "manifest": "tools/v11r2/manifests/V11R6_A9R15_TRAINING_HISTORY.json",
  "manifestSHA256": "4aa1e25c77048c10c25fdd3ecea1f5b198f3f5e23e89d37b79d5b4851f3deffd",
  "runtimeSHA256": "f112c0aea086cb3e7684d03ddfe1897d82bcb159086b0a8fd895c71e9208fb67",
  "rulesSHA256": "1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3",
  "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
  "buildTag": "qr-v11r6-a9r15-training-history-closure-20261025"
});

// Isolated R2 source lineage only; this does not grant deployment or data authority.
const A9R16A_R2_SEQUENTIAL = Object.freeze({
  "id": "V11R6_A9R16A_R2_SEQUENTIAL",
  "canonicalFileCount": 129,
  "coachAssignmentContract": "server-verified-multi-branch-v1",
  "inputZIP_SHA256": "f5f40c35d8347036e0fc3490865ea50444b123815df10df785529334334d07d5",
  "manifest": "tools/v11r2/manifests/V11R6_A9R16A_R2_SEQUENTIAL.json",
  "manifestSHA256": "797fe5ed033324491f5b9e8257a114fa78018a5d20f818c79466e919fb10c48d",
  "runtimeSHA256": "93030b1d396b5c257b60d11a2c8a12f981cd967639fcc67603c90131c763e5fa",
  "rulesSHA256": "1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3",
  "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
  "buildTag": "qr-v11r6-a9r16a-r2-sequential-closure-20261025"
});

// R3 candidate lineage; source identity only, never release approval.
const A9R16A_R3_SHIFT_HISTORY = Object.freeze({
  "id": "V11R6_A9R16A_R3_SHIFT_HISTORY",
  "canonicalFileCount": 129,
  "coachAssignmentContract": "server-verified-multi-branch-v1",
  "inputZIP_SHA256": "b96b7e5fc9a77b119a8e696babddd5bbd87f0dda59bbaf8c1a0baf86f4699804",
  "manifest": "tools/v11r2/manifests/V11R6_A9R16A_R3_SHIFT_HISTORY.json",
  "manifestSHA256": "599f30aa4e289846d610de50684e53fdfd14fcd104273228551a76bd79bbf7f1",
  "runtimeSHA256": "950dde369575bd099170b86d6923063bf11ddf4f9ae6376c759a2ec680d1ea2d",
  "rulesSHA256": "1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3",
  "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
  "buildTag": "qr-v11r6-a9r16a-r3-shift-history-mobile-20261025"
});

// R3R1 review lineage; source identity only, never release approval.
const A9R16A_R3R1_REVIEW = Object.freeze({
  "id": "V11R6_A9R16A_R3R1_REVIEW",
  "canonicalFileCount": 129,
  "coachAssignmentContract": "server-verified-multi-branch-v1",
  "inputZIP_SHA256": "da9aad90e3b70d50203f153832012016a66f27452f8b023a7b0a4b849ab58624",
  "manifest": "tools/v11r2/manifests/V11R6_A9R16A_R3R1_REVIEW.json",
  "manifestSHA256": "4d1b1f424dde96ef8881e21daf1699469ff6e4e9d7479c99c7edbf3accd08d3f",
  "runtimeSHA256": "3b5f042637f7449c07fd3efdf69980d2d15d60071d12f673bda3d8387b50ed84",
  "rulesSHA256": "1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3",
  "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
  "buildTag": "qr-v11r6-a9r16a-r3r1-reviewed-history-20261026"
});

// A9R17 mobile layout and receipt render lineage; no release approval.
const A9R17_MOBILE_LAYOUT_QR = Object.freeze({
  "id": "V11R6_A9R17_MOBILE_LAYOUT_QR",
  "canonicalFileCount": 129,
  "coachAssignmentContract": "server-verified-multi-branch-v1",
  "inputZIP_SHA256": "7ac9a1249ad5f6d193e03043f5d27f81b4b9b95bfb57aee3ea0d235bc11416d3",
  "manifest": "tools/v11r2/manifests/V11R6_A9R17_MOBILE_LAYOUT_QR.json",
  "manifestSHA256": "c92122825fca6e5986af84b67d50cc4b33aaf332c97c7aeebff56502524a7c42",
  "runtimeSHA256": "a642be12f61d25eb0cb1b77f46224f7d5908bab5db78d9ce746fee88c80d3765",
  "rulesSHA256": "1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3",
  "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
  "buildTag": "qr-v11r6-a9r17-mobile-layout-qr-20261026"
});

// A9R18 D1 closure lineage; identity only, never authority or deployment approval.
const V11R6_A9R18_D1_CLOSURE = Object.freeze({
  "id": "V11R6_A9R18_D1_CLOSURE",
  "canonicalFileCount": 129,
  "coachAssignmentContract": "server-verified-multi-branch-v1",
  "inputZIP_SHA256": "0cc7854bb62dd1f8c51c1622ad3f0a82b2d5bc4911f37853341d6b1c7d1c1062",
  "manifest": "tools/v11r2/manifests/V11R6_A9R18_D1_CLOSURE.json",
  "manifestSHA256": "c0d6996c5a9895c477e114c6b312312d6897aa7b257e432473adff32b0723c75",
  "runtimeSHA256": "5070162c1d4310bc6c75b515d6adda1d33c939057f7e8c6353292562ac505d10",
  "rulesSHA256": "1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3",
  "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
  "buildTag": "qr-v11r6-a9r17-mobile-layout-qr-20261026"
});

export function verifySourceIdentity(root, actualRuntimeSHA256) {
 const pinned=[V11R6_A9R18_D1_CLOSURE,A9R17_MOBILE_LAYOUT_QR,A9R16A_R3R1_REVIEW,A9R16A_R3_SHIFT_HISTORY,A9R16A_R2_SEQUENTIAL,A9R15_TRAINING_HISTORY,A9R14_QA_MOBILE,A9R13_MEMBER_HISTORY_DIAGNOSTICS,A9R12_COACH_ATTENDANCE_QUERY_CLOSURE_TEST_ONLY,A9R11_COACH_ATTENDANCE_OPERATIONAL_TEST_ONLY,A9R10_STAGING_BASE_TEST_ONLY,A9R6_ATTENDANCE_DEMO_ONLY,A9R4_ACCEPTED_SOURCE,A9R3_ACCEPTED_SOURCE,A9R1_ACCEPTED_SOURCE,A9_ACCEPTED_SOURCE,A8_ACCEPTED_SOURCE,ACCEPTED_SOURCE,A5_ACCEPTED_SOURCE,LEGACY_ACCEPTED_SOURCE];
 const exact=pinned.find(p=>p.runtimeSHA256===actualRuntimeSHA256);
 if(!exact&&fs.existsSync(path.join(root,'STAGING_SOURCE_ONLY.json')))return verifyDerivedStaging(root,actualRuntimeSHA256,pinned);
 const p = exact||ACCEPTED_SOURCE, manifestPath = path.join(root,p.manifest);
 need(fs.existsSync(manifestPath) && sha(fs.readFileSync(manifestPath)) === p.manifestSHA256,'SOURCE_MANIFEST_NOT_ACCEPTED');
 const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 need(actualRuntimeSHA256 === p.runtimeSHA256 && manifest.runtimeSHA256 === p.runtimeSHA256,'SOURCE_RUNTIME_NOT_ACCEPTED');
 need(sha(fs.readFileSync(path.join(root,'firestore.rules'))) === p.rulesSHA256,'SOURCE_RULES_NOT_ACCEPTED');
 need(sha(fs.readFileSync(path.join(root,'firestore.indexes.json'))) === p.indexesSHA256,'SOURCE_INDEXES_NOT_ACCEPTED');
 const files = Object.entries(manifest.canonicalRuntimeFiles || {});
 need(files.length === (p.canonicalFileCount || 128) && files.every(([file,hash]) => !path.isAbsolute(file) && !file.split('/').includes('..') &&
  fs.existsSync(path.join(root,file)) && sha(fs.readFileSync(path.join(root,file))) === hash),'SOURCE_MANIFEST_FILE_MISMATCH');
 // The pinned manifest authenticates js/main.js before its build identity is read.
 const actualBuild = buildTag(fs.readFileSync(path.join(root,'js/main.js'),'utf8')).tag;
 need(actualBuild === p.buildTag,'SOURCE_BUILD_TAG_INVALID');
 return {...p,canonicalFileCount:files.length};
}

function verifyDerivedStaging(root,actualRuntimeSHA256,pinned){
 const descriptor=JSON.parse(fs.readFileSync(path.join(root,'STAGING_SOURCE_ONLY.json'),'utf8'));
 const base=pinned.find(p=>p.runtimeSHA256===descriptor.baseRuntimeSHA256);need(base,'STAGING_BASE_NOT_ACCEPTED');
 const manifestPath=path.join(root,base.manifest);need(fs.existsSync(manifestPath)&&sha(fs.readFileSync(manifestPath))===base.manifestSHA256,'SOURCE_MANIFEST_NOT_ACCEPTED');
 const files=JSON.parse(fs.readFileSync(manifestPath,'utf8')).canonicalRuntimeFiles,originals=descriptor.originals;
 need(files&&Object.keys(files).length===(base.canonicalFileCount||128)&&originals&&typeof originals==='object'&&!Array.isArray(originals),'STAGING_ORIGINALS_INVALID');
 need(Object.entries(originals).every(([file,text])=>Object.hasOwn(files,file)&&typeof text==='string'&&sha(text)===files[file]),'STAGING_ORIGINALS_NOT_PINNED');
 // Validate the entire reconstructed base, including modules not changed by configuration/cache.
 need(Object.entries(files).every(([file,hash])=>sha(Object.hasOwn(originals,file)?originals[file]:fs.readFileSync(path.join(root,file)))===hash),'STAGING_BASE_FILE_MISMATCH');
 const expected=stagingRuntimeOverrides(root,descriptor.config,originals);
 need(descriptor.kind==='ISOLATED_STAGING_SOURCE_NOT_DEPLOYED'&&descriptor.projectId===descriptor.config.projectId&&descriptor.buildTag===expected.tag,'STAGING_DESCRIPTOR_MISMATCH');
 const entries=Object.keys(files).sort().map(file=>{const bytes=Object.hasOwn(expected.overrides,file)?expected.overrides[file]:fs.readFileSync(path.join(root,file));need(sha(fs.readFileSync(path.join(root,file)))===sha(bytes),'STAGING_RUNTIME_TAMPERED');return[file,sha(bytes)]});
 need(sha(JSON.stringify(entries))===actualRuntimeSHA256,'STAGING_RUNTIME_NOT_DERIVED');
 need(sha(fs.readFileSync(path.join(root,'firestore.rules')))===base.rulesSHA256,'SOURCE_RULES_NOT_ACCEPTED');
 need(sha(fs.readFileSync(path.join(root,'firestore.indexes.json')))===base.indexesSHA256,'SOURCE_INDEXES_NOT_ACCEPTED');
 return {...base,id:base.id+'_STAGING_DERIVED',runtimeSHA256:actualRuntimeSHA256,buildTag:expected.tag,canonicalFileCount:base.canonicalFileCount||128,derivedFrom:base.runtimeSHA256,projectId:descriptor.projectId};
}
