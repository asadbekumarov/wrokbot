import 'dotenv/config';
import { startUserBot } from './userbot/client.js';
import { startLongPolling } from './bot/nativeBot.js';

// Dastur qulashining oldini olish uchun Global Exception Handler'lar
process.on('unhandledRejection', (reason, promise) => {
    console.error('[System] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[System] Uncaught Exception thrown:', err);
});

async function bootstrap() {
    console.log("Tizim ishga tushirilmoqda...");
    
    // UserBot va Native Bot API'ni bir vaqtda mustaqil ishga tushirish
    await Promise.all([
        startUserBot(),
        startLongPolling()
    ]);
}

bootstrap();
