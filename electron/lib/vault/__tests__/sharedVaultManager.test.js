const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { SharedVaultManager } = require('../sharedVaultManager');

describe('SharedVaultManager', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-test-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeMockClient(chatIds, chatMap, supergroupMap) {
    return {
      invoke: async (req) => {
        if (req._ === 'getChats') return { chat_ids: chatIds };
        if (req._ === 'getChat') return chatMap[req.chat_id] || {};
        if (req._ === 'getSupergroupFullInfo') return supergroupMap[req.supergroup_id] || {};
        return {};
      },
      on: () => {},
      off: () => {},
    };
  }

  test('discover stores shared vaults list', async () => {
    const client = makeMockClient(
      [200],
      { 200: { id: 200, title: 'Friend Vault', type: { _: 'chatTypeSupergroup', is_channel: true, supergroup_id: 20 } } },
      { 20: { description: '#televault-v1' } },
    );

    const mgr = new SharedVaultManager({
      client,
      ownChatId: 100,
      userDataPath: tmpDir,
      onChange: () => {},
    });

    await mgr.discover();
    const vaults = mgr.getDiscoveredVaults();
    assert.equal(vaults.length, 1);
    assert.equal(vaults[0].chatId, 200);
    assert.equal(vaults[0].title, 'Friend Vault');

    mgr.dispose();
  });

  test('getDiscoveredVaults returns empty when none found', async () => {
    const client = makeMockClient([], {}, {});

    const mgr = new SharedVaultManager({
      client,
      ownChatId: 100,
      userDataPath: tmpDir,
      onChange: () => {},
    });

    await mgr.discover();
    assert.deepStrictEqual(mgr.getDiscoveredVaults(), []);
    mgr.dispose();
  });

  test('dispose cleans up instances', async () => {
    const client = makeMockClient([], {}, {});

    const mgr = new SharedVaultManager({
      client,
      ownChatId: 100,
      userDataPath: tmpDir,
      onChange: () => {},
    });

    mgr.dispose();
    assert.deepStrictEqual(mgr.getDiscoveredVaults(), []);
  });
});
