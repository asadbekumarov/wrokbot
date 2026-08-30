import { NewMessage } from 'telegram/events/index.js';
import { logger } from '../../utils/logger.js';
import { storage } from '../../utils/storage.js';

export function setupBotHandlers(client) {
    client.addEventHandler(async (event) => {
        const message = event.message;
        const text = message.message || '';
        logger.info(`Bot xabar qabul qildi: ${text}`);
        
        if (text === '/start') {
            await client.sendMessage(message.chatId, { 
                message: "Salom! Men gibrid botman.\n\nBuyruqlar:\n/addkanal @kanal_user - Kanal qo'shish\n/delkanal @kanal_user - Kanalni o'chirish\n/addkalit so'z - Kalit so'z qo'shish\n/delkalit so'z - Kalit so'zni o'chirish\n/list - Joriy sozlamalarni ko'rish" 
            });
        } else if (text.startsWith('/addkanal ')) {
            const channel = text.split(' ')[1];
            if (channel) {
                const added = await storage.addChannel(channel);
                await client.sendMessage(message.chatId, { message: added ? `${channel} kanali qo'shildi. ✅` : `${channel} kanali avvaldan mavjud. ℹ️` });
            }
        } else if (text.startsWith('/delkanal ')) {
            const channel = text.split(' ')[1];
            if (channel) {
                const deleted = await storage.delChannel(channel);
                await client.sendMessage(message.chatId, { message: deleted ? `${channel} kanali o'chirildi. 🗑` : `${channel} kanali topilmadi. ❌` });
            }
        } else if (text.startsWith('/addkalit ')) {
            const kw = text.substring('/addkalit '.length).trim();
            if (kw) {
                const added = await storage.addKeyword(kw);
                await client.sendMessage(message.chatId, { message: added ? `"${kw}" kalit so'zi qo'shildi. ✅` : `"${kw}" kalit so'zi avvaldan mavjud. ℹ️` });
            }
        } else if (text.startsWith('/delkalit ')) {
            const kw = text.substring('/delkalit '.length).trim();
            if (kw) {
                const deleted = await storage.delKeyword(kw);
                await client.sendMessage(message.chatId, { message: deleted ? `"${kw}" kalit so'zi o'chirildi. 🗑` : `"${kw}" kalit so'zi topilmadi. ❌` });
            }
        } else if (text === '/list') {
            const data = await storage.read();
            let msg = `📋 **Kanallar:**\n${data.channels.length ? data.channels.join('\n') : "Yo'q"}\n\n`;
            msg += `🔑 **Kalit so'zlar:**\n${data.keywords.length ? data.keywords.join('\n') : "Yo'q"}`;
            await client.sendMessage(message.chatId, { message: msg });
        }
    }, new NewMessage({ incoming: true }));
}
