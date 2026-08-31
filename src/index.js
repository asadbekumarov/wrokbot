import 'dotenv/config';
import express from 'express';
import { startUserBot } from './userbot/client.js';
import { startLongPolling } from './bot/nativeBot.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.send('Bot is running...');
});

app.listen(PORT, () => {
    console.log(`[System] Web server is running on port ${PORT}`);
});

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
