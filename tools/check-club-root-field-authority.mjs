#!/usr/bin/env node
import fs from 'node:fs';

const rules = fs.readFileSync('firestore.rules', 'utf8');
let pass = 0, fail = 0;
function check(name, ok, detail='') { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name, detail); } }

const helperMatch = rules.match(/function\s+clubAdminRootUpdateFieldsOnly\s*\(\)\s*\{([\s\S]*?)\n\s*\}/);
const helper = helperMatch?.[1] || '';
const required = [
  'cachedActiveCount','cachedStudentCount','activeStudentCount','totalStudents',
  'cachedProfileCount','cachedInvCount','cachedCountUpdatedAt','cacheCoverage','cachedTxCount',
  'cachedCurrentMonthRevenue','currentMonthRevenue','cachedMonthlyRevenue','revenueByMonth',
  'superAdminStats','statsUpdatedAt','statsSource'
];
const privileged = ['parentCode','expiryDate','accountStatus','adminEmail','clubName','examEnabled','adminPassword','passwordChangedAt'];
check('clubAdminRootUpdateFieldsOnly helper exists', !!helperMatch);
check('Admin root helper uses affectedKeys().hasOnly()', /diff\(resource\.data\)[\s\S]*affectedKeys\(\)[\s\S]*hasOnly\(/.test(helper));
for (const field of required) check(`legitimate Admin root field remains whitelisted: ${field}`, helper.includes(`'${field}'`));
for (const field of privileged) check(`privileged field excluded from Admin root whitelist: ${field}`, !helper.includes(`'${field}'`));
const rootBlock = rules.match(/match\s+\/clubs\/\{clubId\}\s*\{([\s\S]*?)\n\s*match\s+\/profiles/ )?.[1] || rules;
check('SuperAdmin root update authority preserved', /isSuperAdmin\(\)[\s\S]*clubAdminPasswordTransitionSafe\(\)/.test(rootBlock));
check('Club Admin root update requires field whitelist', /isClubAdmin\(clubId\)[\s\S]*clubAdminRootUpdateFieldsOnly\(\)/.test(rootBlock));
check('password transition guard remains part of root update', (rootBlock.match(/clubAdminPasswordTransitionSafe\(\)/g)||[]).length >= 2);
check('no public club root write', !/match\s+\/clubs\/\{clubId\}[\s\S]{0,900}allow\s+(?:create|update|delete|write)[^;]*if\s+true/.test(rules));

console.log(`PASS ${pass}/${pass+fail}`);
if (fail) process.exit(1);
