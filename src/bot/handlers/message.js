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
                message: "Salom! Men gibrid botman.\n\nBuyruqlar:\n/addkalit so'z - Kalit so'z qo'shish\n/delkalit so'z - Kalit so'zni o'chirish\n/list - Joriy sozlamalarni ko'rish" 
            });
        } else if (text.startsWith('/addkalit ')) {
            const kw = text.substring('/addkalit '.length).trim();
            if (kw) {
                // debugger;
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
            let msg = `🔑 **Kalit so'zlar:**\n${data.keywords.length ? data.keywords.join('\n') : "Yo'q"}`;
            await client.sendMessage(message.chatId, { message: msg });
        }
    }, new NewMessage({ incoming: true }));
}
