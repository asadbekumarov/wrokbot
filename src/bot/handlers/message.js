import { NewMessage } from 'telegram/events/index.js';
import { logger } from '../../utils/logger.js';

export function setupBotHandlers(client) {
    client.addEventHandler(async (event) => {
        const message = event.message;
        logger.info(`Bot xabar qabul qildi: ${message.message}`);
        
        if (message.message === '/start') {
            await client.sendMessage(message.chatId, { message: "Salom! Men gibrid botman." });
        }
    }, new NewMessage({}));
}
