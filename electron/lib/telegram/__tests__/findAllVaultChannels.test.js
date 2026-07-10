const { test, describe } = require('node:test');
const assert = require('node:assert');
const { ChannelService } = require('../channelService');

describe('findAllVaultChannels', () => {
  test('returns channels with #televault-v1 excluding ownChatId', async () => {
    const mockClient = {
      invoke: async (req) => {
        if (req._ === 'getChats') return { chat_ids: [100, 200, 300] };
        if (req._ === 'getChat') {
          const map = {
            100: { id: 100, title: 'My Vault', type: { _: 'chatTypeSupergroup', is_channel: true, supergroup_id: 10 } },
            200: { id: 200, title: 'Friend Vault', type: { _: 'chatTypeSupergroup', is_channel: true, supergroup_id: 20 } },
            300: { id: 300, title: 'Random Group', type: { _: 'chatTypeSupergroup', is_channel: false, supergroup_id: 30 } },
          };
          return map[req.chat_id];
        }
        if (req._ === 'getSupergroupFullInfo') {
          const map = {
            10: { description: 'Kho file TeleVault #televault-v1' },
            20: { description: 'Kho file TeleVault #televault-v1' },
            30: { description: 'Just a group' },
          };
          return map[req.supergroup_id];
        }
        return {};
      },
    };

    const results = await ChannelService.findAllVaultChannels(mockClient, 100);
    assert.equal(results.length, 1);
    assert.equal(results[0].chatId, 200);
    assert.equal(results[0].title, 'Friend Vault');
  });

  test('returns empty array when no shared vaults found', async () => {
    const mockClient = {
      invoke: async (req) => {
        if (req._ === 'getChats') return { chat_ids: [100] };
        if (req._ === 'getChat') {
          return { id: 100, title: 'My Vault', type: { _: 'chatTypeSupergroup', is_channel: true, supergroup_id: 10 } };
        }
        if (req._ === 'getSupergroupFullInfo') {
          return { description: 'Kho file TeleVault #televault-v1' };
        }
        return {};
      },
    };

    const results = await ChannelService.findAllVaultChannels(mockClient, 100);
    assert.equal(results.length, 0);
  });

  test('skips non-channel supergroups', async () => {
    const mockClient = {
      invoke: async (req) => {
        if (req._ === 'getChats') return { chat_ids: [200] };
        if (req._ === 'getChat') {
          return { id: 200, title: 'A Group', type: { _: 'chatTypeSupergroup', is_channel: false, supergroup_id: 20 } };
        }
        if (req._ === 'getSupergroupFullInfo') {
          return { description: '#televault-v1' };
        }
        return {};
      },
    };

    const results = await ChannelService.findAllVaultChannels(mockClient, 100);
    assert.equal(results.length, 0);
  });
});
