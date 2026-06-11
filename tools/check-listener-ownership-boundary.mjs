import fs from 'fs';

function read(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
}

const files = {
  module: read('js/core/listenerOwnershipBoundary.js'),
  main: read('js/main.js'),
  tabs: read('js/ui/tabs.js'),
  clubStats: read('js/core/clubStatsAutoCache.js'),
  listeners: read('js/utils/listeners.js'),
  app: read('app.js'),
  index: read('index.html'),
  pkg: read('package.json'),
};

let failed = false;
function check(label, condition) {
  if (condition) console.log('✅ ' + label);
  else { console.error('❌ ' + label); failed = true; }
}

check('listenerOwnershipBoundary module exists', files.module.length > 3000);
check('module declares 4K-6M phase', files.module.includes('4K-6M-listener-ownership-boundary-render-event-cleanup-20260608'));
check('module exports ListenerOwnershipBoundary', /export\s*\{[\s\S]*ListenerOwnershipBoundary/.test(files.module));
check('module exports initListenerOwnershipBoundary', files.module.includes('initListenerOwnershipBoundary'));
check('module has addOwnedEventListener', files.module.includes('addOwnedEventListener'));
check('module has cleanupOwnedEventsByOwner', files.module.includes('cleanupOwnedEventsByOwner'));
check('module has cleanupOwnedEventsByTabId', files.module.includes('cleanupOwnedEventsByTabId'));
check('module has scheduleRender wrapper metrics', files.module.includes('__listenerOwnershipWrapped') && files.module.includes('_recordRenderSchedule'));
check('module exposes debugListenerOwnershipBoundary', files.module.includes('debugListenerOwnershipBoundary'));
check('module exposes debugEventBindingOwnership', files.module.includes('debugEventBindingOwnership'));
check('module exposes debugRenderEventCleanup', files.module.includes('debugRenderEventCleanup'));
check('module has no Firestore write calls', !/\b(addDoc|setDoc|updateDoc|deleteDoc)\s*\(/.test(files.module));
check('module does not own processMultiItem', !/processMultiItem\s*=/.test(files.module) && !/function\s+processMultiItem/.test(files.module));

check('main imports listener ownership boundary', files.main.includes("./core/listenerOwnershipBoundary.js"));
check('main calls initListenerOwnershipBoundary', files.main.includes('initListenerOwnershipBoundary()'));
check('APP_BUILD_VERSION updated to 4K-6M', files.main.includes("4K-6M-listener-ownership-boundary-render-event-cleanup-20260608"));
check('index cache bust updated to 4K-6M', files.index.includes('main.js?v=listener-ownership-boundary-render-event-cleanup-20260608'));
check('debugRuntimeSmokeTest includes listener ownership debug', files.main.includes('debugListenerOwnershipBoundary') && files.main.includes('listenerOwnershipBoundaryOk'));
check('debugRuntimeSmokeTest includes event binding ownership debug', files.main.includes('debugEventBindingOwnership') && files.main.includes('eventBindingOwnershipOk'));
check('debugRuntimeSmokeTest includes render event cleanup debug', files.main.includes('debugRenderEventCleanup') && files.main.includes('renderEventCleanupOk'));

check('tabs.js notifies boundary on tab leave', files.tabs.includes('ListenerOwnershipBoundary?.onTabLeave'));
check('tabs.js notifies boundary on tab enter', files.tabs.includes('ListenerOwnershipBoundary?.onTabEnter'));
check('clubStatsAutoCache uses owned event boundary for window events', files.clubStats.includes('addOwnedEventListener') && files.clubStats.includes('clubStatsAutoCache:window-focus'));

check('existing Firestore safeRegisterSnapshot registry still present', files.listeners.includes('safeRegisterSnapshot') && files.listeners.includes('duplicatePreventedBeforeCreate'));
check('app.js scheduleRender still routes via LegacyRenderEntrypoints', files.app.includes('LegacyRenderEntrypoints.routeLegacyRenderReason'));
check('app.js processMultiItem remains present', files.app.includes('window.processMultiItem = async'));
check('app.js quickPay remains present', files.app.includes('quickPay') || files.app.includes('quickPayModal'));
check('package has check:listener-ownership-boundary', files.pkg.includes('check:listener-ownership-boundary'));

if (failed) {
  console.error('\ncheck-listener-ownership-boundary FAILED');
  process.exit(1);
}
console.log('\ncheck-listener-ownership-boundary PASS');
