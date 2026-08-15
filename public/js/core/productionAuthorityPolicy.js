// Phase 4K-6V5U6E — one production authority policy.
// This module owns policy only. It performs no Firestore read/write and exposes
// one immutable object for runtime writers/recovery helpers to consult.

const POLICY = Object.freeze({
  version: '4K-6V5U6E-production-authority-closure-20260814',
  mode: 'client-only',
  statsWriter: 'client',
  superAdminServerRefresh: false,
  legacyRuntimeRecovery: false,
});

function initProductionAuthorityPolicy() {
  if (typeof window === 'undefined') return POLICY;
  const current = window.ProductionAuthorityPolicy;
  if (current && current.version === POLICY.version) return current;
  Object.defineProperty(window, 'ProductionAuthorityPolicy', {
    value: POLICY,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  return POLICY;
}

function getProductionAuthorityPolicy() {
  return (typeof window !== 'undefined' && window.ProductionAuthorityPolicy) || POLICY;
}

export { POLICY as ProductionAuthorityPolicy, initProductionAuthorityPolicy, getProductionAuthorityPolicy };
