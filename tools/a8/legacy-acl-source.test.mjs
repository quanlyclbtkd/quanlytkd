import fs from 'node:fs';
import assert from 'node:assert/strict';
const rules=fs.readFileSync('firestore.rules','utf8');
const body=rules.match(/function existingCoachBelongsToMyClub\(data\)\s*\{([\s\S]*?)\n\s*\}/)?.[1]||'';
assert(body.includes("canonicalRole(data.get('role', '')) == 'coach'"), 'Legacy hlv/trainer must be canonicalized only in same-club Coach boundary');
assert(body.includes("data.get('clubId', '') == myClubId()"), 'must guard same tenant');
assert(/request\.resource\.data\.get\('role',''\) == 'coach'\s*&& coachMirrorVersionedWrite\(\) && coachUserPairAfter\(/.test(rules), 'updated target role must remain coach with canonical pair AND mirror-version CAS');
assert(rules.includes('function coachAttendanceCutoverOpen() {\n          return false;'), 'maintenance must remain closed');
console.log('PASS narrow legacy role migration only, Coach target canonical, S01 HOLD');
