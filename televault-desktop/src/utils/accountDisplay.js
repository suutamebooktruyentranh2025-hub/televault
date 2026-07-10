const FREE_TOKEN_MAX = 100;
const TRIAL_DAYS = 7;

export function emailInitial(email) {
  const local = String(email || '').trim().split('@')[0];
  return (local[0] || '?').toUpperCase();
}

/** Split for sidebar display — avoids single-line ellipsis on long addresses. */
export function splitEmailAddress(email) {
  const normalized = String(email || '').trim();
  const at = normalized.indexOf('@');
  if (at <= 0) return { local: normalized, domain: null };
  return {
    local: normalized.slice(0, at),
    domain: normalized.slice(at),
  };
}

export function trialDaysRemaining(createdAt) {
  if (!createdAt) return null;
  const registeredAt = new Date(createdAt);
  if (Number.isNaN(registeredAt.getTime())) return null;
  const ageDays = Math.floor((Date.now() - registeredAt.getTime()) / (86400000));
  return Math.max(0, TRIAL_DAYS - ageDays);
}

export function tokenDisplay(remaining) {
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) {
    return { remaining: FREE_TOKEN_MAX, max: FREE_TOKEN_MAX, ratio: 1 };
  }
  const clamped = Math.max(0, Math.min(FREE_TOKEN_MAX, Math.floor(remaining)));
  return {
    remaining: clamped,
    max: FREE_TOKEN_MAX,
    ratio: clamped / FREE_TOKEN_MAX,
  };
}

export { FREE_TOKEN_MAX, TRIAL_DAYS };
