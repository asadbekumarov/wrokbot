import http from 'node:http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './database/db.js';
import { initBot } from './bot/nativeBot.js';
import { restoreAllSessions, disconnectAll } from './userbot/sessionManager.js';

// -------------------------------------------------------------
// GLOBAL EXCEPTION HANDLERS (Dastur qulab tushmasligi uchun)
// -------------------------------------------------------------
process.on('unhandledRejection', (reason, promise) => {
    logger.error('SYSTEM', 'Ushlanmagan Rejection (Unhandled Rejection):', reason);
});

process.on('uncaughtException', (err) => {
    logger.error('SYSTEM', 'Ushlanmagan Xatolik (Uncaught Exception):', err);
});

// -------------------------------------------------------------
// ALWAYSDATA HTTP SERVER (Kam resursli sog'lomlik tekshiruvi)
// -------------------------------------------------------------
// Express o'rniga yengil native http moduli ishlatildi (RAM tejash uchun)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        service: 'WorkBot Multi-User Telegram Radar',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    }));
});

server.listen(env.port, () => {
    logger.info('SERVER', `AlwaysData HTTP server ${env.port}-portda ishlamoqda`);
});

// -------------------------------------------------------------
// BOOTSTRAP: TIZIMNI ISHGA TUSHIRISH
// -------------------------------------------------------------
async function bootstrap() {
    console.log(`
\x1b[36m╔══════════════════════════════════════════════════════════╗
║               🤖 WORKBOT MULTI-USER RADAR               ║
║   MTProto (GramJS) + Bot API + SQLite (WAL) + i18n       ║
╚══════════════════════════════════════════════════════════╝\x1b[0m
    `);

    logger.info('BOOTSTRAP', 'Tizim initsializatsiyasi boshlandi...');

    // 1. Ma'lumotlar bazasini o't oldirish
    initDatabase();

    // 2. Bot API ni ishga tushirish (Long polling)
    initBot();

    // 3. Avval ro'yxatdan o'tgan barcha faol foydalanuvchilar UserBot sessiyalarini tiklash
    await restoreAllSessions();

    // 4. AlwaysData uchun vaqti-vaqti bilan xotira monitoringi
    logger.memory();
    setInterval(() => {
        logger.memory();
    }, 15 * 60 * 1000); // har 15 daqiqada

    logger.info('BOOTSTRAP', '✅ WorkBot platformasi barcha foydalanuvchilar uchun tayyor!');
}

bootstrap().catch((err) => {
    logger.error('BOOTSTRAP', 'Tizimni ishga tushirishda jiddiy xato:', err);
    process.exit(1);
});

// -------------------------------------------------------------
// GRACEFUL SHUTDOWN (Toza to'xtatish)
// -------------------------------------------------------------
async function gracefulShutdown(signal) {
    logger.warn('SHUTDOWN', `${signal} signali qabul qilindi. Tizim xavfsiz to'xtatilmoqda...`);
    
    try {
        server.close();
        await disconnectAll();
        closeDatabase();
        logger.info('SHUTDOWN', 'Barcha resurslar xavfsiz ozod qilindi. Xayr!');
    } catch (err) {
        logger.error('SHUTDOWN', 'Resurslarni yopishda xato:', err);
    } finally {
        process.exit(0);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
