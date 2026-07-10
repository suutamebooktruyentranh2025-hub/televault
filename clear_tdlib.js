const { bootstrapTelegram } = require('./electron/lib/telegram/bootstrap');
const path = require('path');
const os = require('os');

async function main() {
  const userDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'televault-desktop');
  const { client } = await bootstrapTelegram({
    userDataPath,
    apiId: Number(process.env.TG_API_ID) || 0,
    apiHash: process.env.TG_API_HASH || ''
  });

  await client.login();
  const chats = await client.invoke({ _: 'getChats', chat_list: { _: 'chatListMain' }, limit: 100 });
  const allToDelete = new Map();

  for (const chatId of chats.chat_ids) {
    let fromMessageId = 0;
    const toDelete = [];
    
    while (true) {
      const page = await client.invoke({
        _: 'getChatHistory',
        chat_id: chatId,
        from_message_id: fromMessageId,
        offset: 0,
        limit: 100,
        only_local: true,
      });
      if (!page.messages || page.messages.length === 0) break;

      for (const msg of page.messages) {
        if (msg.sending_state) {
          toDelete.push(msg.id);
        }
      }

      const nextFrom = page.messages[page.messages.length - 1].id;
      if (nextFrom === fromMessageId) break;
      fromMessageId = nextFrom;
    }
    
    if (toDelete.length > 0) {
      allToDelete.set(chatId, toDelete);
    }
  }
  
  let totalDeleted = 0;
  for (const [chatId, toDelete] of allToDelete.entries()) {
    for (let i = 0; i < toDelete.length; i += 100) {
      const chunk = toDelete.slice(i, i + 100);
      await client.invoke({
        _: 'deleteMessages',
        chat_id: chatId,
        message_ids: chunk,
        revoke: true
      });
      totalDeleted += chunk.length;
    }
  }

  await client.close();
  console.log(`Swept ${totalDeleted} messages.`);
}

main().catch(console.error);
