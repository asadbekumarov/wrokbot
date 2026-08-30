import { NewMessage } from 'telegram/events/index.js';
import { logger } from '../../utils/logger.js';

export function setupUserBotHandlers(client) {
    client.addEventHandler(async (event) => {
        const message = event.message;
        
        // Misol uchun, o'zingiz yozgan '.ping' xabariga javob qaytarish
        if (message.out && message.message === '.ping') {
            await message.edit({ text: "Pong! Userbot ishlamoqda." });
        }
    }, new NewMessage({}));
}
