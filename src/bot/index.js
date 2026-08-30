import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { setupBotHandlers } from './handlers/message.js';

export async function startBot() {
    if (!config.botToken) {
        logger.warn("Bot token topilmadi. Bot ishga tushirilmadi.");
        return;
    }

    const client = new TelegramClient(new StringSession(""), config.apiId, config.apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        botAuthToken: config.botToken,
    });

    logger.info("Bot tizimga muvaffaqiyatli ulandi.");
    
    setupBotHandlers(client);
}
