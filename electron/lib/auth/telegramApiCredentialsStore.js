const fs = require('fs');
const path = require('path');

function credentialsFile(userDataPath, userId) {
  const trimmed = String(userId || '').trim();
  return path.join(userDataPath, `televault-tg-api-${trimmed}.json`);
}

function load({ userDataPath, userId }) {
  const trimmed = String(userId || '').trim();
  if (!trimmed) return null;
  try {
    const p = credentialsFile(userDataPath, trimmed);
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const apiId = Number(raw?.apiId);
    const apiHash = String(raw?.apiHash || '').trim();
    if (!Number.isFinite(apiId) || apiId <= 0 || !apiHash) return null;
    return { apiId, apiHash };
  } catch {
    return null;
  }
}

function save({ userDataPath, userId, apiId, apiHash }) {
  const trimmed = String(userId || '').trim();
  if (!trimmed) throw new Error('userId is required');
  const id = Number(apiId);
  const hash = String(apiHash || '').trim();
  if (!Number.isFinite(id) || id <= 0 || !hash) {
    throw new Error('Invalid Telegram API credentials');
  }
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    credentialsFile(userDataPath, trimmed),
    JSON.stringify({ apiId: id, apiHash: hash }),
    'utf8',
  );
}

function clear({ userDataPath, userId }) {
  const trimmed = String(userId || '').trim();
  if (!trimmed) return;
  try {
    const p = credentialsFile(userDataPath, trimmed);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

module.exports = { load, save, clear };
