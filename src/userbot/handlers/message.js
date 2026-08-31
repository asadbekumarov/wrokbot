import { NewMessage } from 'telegram/events/index.js';
import { logger } from '../../utils/logger.js';
import { storage } from '../../utils/storage.js';

export function setupUserBotHandlers(client) {
    client.addEventHandler(async (event) => {
        const message = event.message;
        
        if (message.out && message.message === '.ping') {
            await message.edit({ text: "Pong! Userbot ishlamoqda." });
            return;
        }

        const text = message.message || '';
        if (!text) return;

        const data = await storage.read();
        if (data.keywords.length === 0) return;

        const lowerText = text.toLowerCase();
        const hasKeyword = data.keywords.some(kw => lowerText.includes(kw));

        if (hasKeyword) {
            try {
                await client.forwardMessages('me', {
                    messages: [message.id],
                    fromPeer: message.peerId
                });
                logger.info(`Topilgan xabar 'me' ga yuborildi.`);
            } catch (err) {
                logger.error(`Xabarni yuborishda xatolik: ${err.message}`);
            }
        }
    }, new NewMessage({ incoming: true }));
}
