const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

class AccountManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.accountsFile = path.join(userDataPath, 'accounts.json');
    this.state = this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.accountsFile)) {
        this._migrateLegacyData();
      }
      if (fs.existsSync(this.accountsFile)) {
        const raw = fs.readFileSync(this.accountsFile, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('[AccountManager] failed to load accounts', e);
    }
    return { activeId: null, accounts: {} };
  }

  _migrateLegacyData() {
    try {
      const oldTd = path.join(this.userDataPath, 'td');
      const oldDb = path.join(this.userDataPath, 'index.db');
      const oldApi = path.join(this.userDataPath, 'televault-tg-api-default_user.json');
      
      // If legacy data exists
      if (fs.existsSync(oldTd) || fs.existsSync(oldDb) || fs.existsSync(oldApi)) {
        console.log('[AccountManager] Migrating legacy data to default account...');
        const defaultPath = path.join(this.userDataPath, 'accounts', 'default');
        fs.mkdirSync(defaultPath, { recursive: true });
        
        if (fs.existsSync(oldTd)) fs.renameSync(oldTd, path.join(defaultPath, 'td'));
        if (fs.existsSync(oldDb)) fs.renameSync(oldDb, path.join(defaultPath, 'index.db'));
        if (fs.existsSync(oldApi)) {
          fs.renameSync(oldApi, path.join(this.userDataPath, 'televault-tg-api-default.json'));
        }
        
        const state = {
          activeId: 'default',
          accounts: {
            'default': { id: 'default', name: 'Legacy Account' }
          }
        };
        fs.writeFileSync(this.accountsFile, JSON.stringify(state, null, 2), 'utf8');
      }
    } catch (e) {
      console.error('[AccountManager] Legacy migration failed', e);
    }
  }

  _save() {
    try {
      fs.mkdirSync(this.userDataPath, { recursive: true });
      fs.writeFileSync(this.accountsFile, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e) {
      console.error('[AccountManager] failed to save accounts', e);
    }
  }

  getActiveAccountId() {
    return this.state.activeId;
  }

  getAccount(id) {
    return this.state.accounts[id] || null;
  }

  getAccounts() {
    return Object.values(this.state.accounts);
  }

  addOrUpdateAccount(id, payload = {}) {
    const accountId = id || randomUUID();
    const existing = this.state.accounts[accountId] || {};
    this.state.accounts[accountId] = { ...existing, id: accountId, ...payload };
    if (!this.state.activeId) {
      this.state.activeId = accountId;
    }
    this._save();
    return this.state.accounts[accountId];
  }

  setActiveAccount(id) {
    if (this.state.accounts[id]) {
      this.state.activeId = id;
      this._save();
      return true;
    }
    return false;
  }

  deleteAccount(id) {
    if (this.state.accounts[id]) {
      delete this.state.accounts[id];
      if (this.state.activeId === id) {
        const remaining = Object.keys(this.state.accounts);
        this.state.activeId = remaining.length > 0 ? remaining[0] : null;
      }
      this._save();
      return true;
    }
    return false;
  }
}

module.exports = { AccountManager };
