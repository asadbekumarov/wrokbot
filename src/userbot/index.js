import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { setupUserBotHandlers } from './handlers/message.js';
import input from 'input'; 

export async function startUserBot() {
    if (!config.apiId || !config.apiHash) {
        logger.warn("API_ID yoki API_HASH topilmadi. Userbot ishga tushirilmadi.");
        return;
    }

    const stringSession = new StringSession(config.sessionString);
    const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await input.text("Telefon raqamingizni kiriting: "),
        password: async () => await input.text("2FA parolingizni kiriting: "),
        phoneCode: async () => await input.text("Kodni kiriting: "),
        onError: (err) => logger.error(err.message),
    });

    logger.info("Userbot tizimga muvaffaqiyatli ulandi.");
    
    // Yangi ulanish bo'lsa session string'ni saqlab qolish uchun konsolga chiqaramiz
    const sessionStr = client.session.save();
    if (sessionStr !== config.sessionString) {
        logger.info("Yangi session string: " + sessionStr + "\nBuni .env faylga saqlab qo'ying.");
    }
    
    setupUserBotHandlers(client);
}
