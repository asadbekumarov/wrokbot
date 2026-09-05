import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
    getUser,
    getAllActiveUsers,
    getKeywords,
    getStopWords,
    isDuplicateHash,
    addMessageHash
} from '../database/db.js';
import {
    decryptSession,
    findMatchedKeywords,
    checkAntiCvStopWords,
    hashMessage,
    formatVacancyAlert
} from '../utils/filter.js';
import { getLocale } from '../locales/i18n.js';

// Telegram Bot API orqali xabar yuboruvchi tashqi callback funksiyasi
let sendVacancyAlertCallback = null;

export function registerAlertSender(fn) {
    sendVacancyAlertCallback = fn;
}

/**
 * Har bir foydalanuvchi GramJS sessiyasini saqlash xaritasi
 * userId -> { client, isRunning, stringSession }
 */
const activeClients = new Map();

/**
 * Bitta foydalanuvchi uchun GramJS UserBot mijozini ishga tushirish
 */
export async function startUserSession(userId) {
    const user = getUser(userId);
    if (!user || !user.session_data || !user.is_active) {
        logger.warn('SESSION_MGR', `User ${userId} sessiya ma'lumotiga ega emas yoki nofaol.`);
        return false;
    }

    // Agar allaqachon ishlab turgan bo'lsa, avval to'xtatamiz
    if (activeClients.has(userId)) {
        await stopUserSession(userId);
    }

    const sessionString = decryptSession(user.session_data);
    if (!sessionString) {
        logger.error('SESSION_MGR', `User ${userId} sessiyasini deshifrlab bo'lmadi!`);
        return false;
    }

    try {
        const stringSession = new StringSession(sessionString);
        
        // AlwaysData kam xotirali muhiti uchun optimal parametrlar
        const client = new TelegramClient(stringSession, env.apiId, env.apiHash, {
            connectionRetries: 5,
            retryDelay: 3000,
            autoReconnect: true,
            floodSleepThreshold: 60,
            deviceModel: 'AlwaysData WorkBot',
            appVersion: '1.0.0',
            systemVersion: 'Linux',
            useWSS: false
        });

        await client.connect();

        const isAuth = await client.checkAuthorization();
        if (!isAuth) {
            logger.warn('SESSION_MGR', `User ${userId} sessiyasi avtorizatsiyadan o'tmadi (muddati o'tgan yoki bekor qilingan).`);
            await client.disconnect();
            return false;
        }

        // Xabarlarni qabul qiluvchi Event Handler
        client.addEventHandler(async (event) => {
            const message = event.message;
            if (!message) return;

            // Foydalanuvchining o'z xabarlariga tegilmaydi
            if (message.out) return;

            // Shaxsiy yozishmalarga tegilmaydi (faqat guruh va kanallar)
            if (message.isPrivate || message.peerId?.className === 'PeerUser') return;

            const msgText = message.message || message.text;
            // Xotirani tejash: matnsiz yoki juda qisqa xabarlarga e'tibor berilmaydi
            if (!msgText || typeof msgText !== 'string' || msgText.trim().length < 5) return;

            try {
                // 1. Kalit so'zlar tekshiruvi (eng boshida tekshirilib, keraksiz getChat RPC so'rovlari oldi olinadi)
                const userKeywords = getKeywords(userId);
                if (!userKeywords || userKeywords.length === 0) return;

                const matchedKeywords = findMatchedKeywords(msgText, userKeywords);
                if (matchedKeywords.length === 0) return;

                // 2. Anti-CV va Stop-so'zlar tekshiruvi
                const userStopWords = getStopWords(userId);
                const stopWordFound = checkAntiCvStopWords(msgText, userStopWords);
                if (stopWordFound) {
                    return;
                }

                // 3. Anti-Duplicate (SHA-256 xesh tekshiruvi)
                const msgHash = hashMessage(msgText);
                if (!msgHash || isDuplicateHash(userId, msgHash)) {
                    return;
                }
                addMessageHash(userId, msgHash);

                // 4. Kanal / Chat ma'lumotlarini olish (faqat kalit so'z to'liq mos kelgandagina)
                const chat = await message.getChat();
                if (!chat || chat.className === 'User') return;

                // Kanal identifikatori va havola yasash
                let channelIdentifier = chat.username ? `@${chat.username}` : (chat.id ? chat.id.toString() : '');
                let link = '';
                if (chat.username) {
                    link = `https://t.me/${chat.username}/${message.id}`;
                } else if (chat.id) {
                    const cleanId = chat.id.toString().replace(/^-100/, '').replace(/^-/, '');
                    link = `https://t.me/c/${cleanId}/${message.id}`;
                }

                const channelName = chat.title || channelIdentifier || 'Telegram Chat';
                logger.match(userId, channelName, matchedKeywords);

                // 5. Foydalanuvchining tiliga mos formatlash
                const currentUser = getUser(userId);
                const userLang = currentUser?.language || 'uz';
                const langStrings = getLocale(userLang);

                const formatted = formatVacancyAlert({
                    channelName,
                    text: msgText,
                    link,
                    keywords: matchedKeywords,
                    channelIdentifier,
                    langStrings
                });

                // 6. Telegram Bot API orqali ogohlantirish yuborish
                if (sendVacancyAlertCallback) {
                    await sendVacancyAlertCallback({
                        userId,
                        channelName,
                        cleanText: formatted.cleanText,
                        formattedText: formatted.formattedText,
                        link,
                        channelIdentifier,
                        matchedKeywords,
                        contacts: formatted.contacts,
                        userLang
                    });
                }
            } catch (err) {
                logger.error('SESSION_EVENT', `User ${userId} xabar tahlilida xato: ${err.message}`);
            }
        }, new NewMessage({}));

        activeClients.set(userId, {
            client,
            isRunning: true,
            stringSession
        });

        logger.userbot(userId, "MTProto UserBot sessiyasi muvaffaqiyatli ishga tushdi 🟢");
        return true;
    } catch (err) {
        logger.error('SESSION_MGR', `User ${userId} sessiyasini ishga tushirishda xato:`, err);
        return false;
    }
}

/**
 * Bitta foydalanuvchi UserBot sessiyasini to'xtatish
 */
export async function stopUserSession(userId) {
    if (!activeClients.has(userId)) return true;

    try {
        const item = activeClients.get(userId);
        if (item && item.client) {
            await item.client.disconnect();
        }
        activeClients.delete(userId);
        logger.userbot(userId, "Sessiya to'xtatildi 🛑");
        return true;
    } catch (err) {
        logger.error('SESSION_MGR', `User ${userId} sessiyasini to'xtatishda xato: ${err.message}`);
        activeClients.delete(userId);
        return false;
    }
}

/**
 * Tizim o't oldirilganda barcha faol foydalanuvchilar sessiyalarini tiklash
 */
export async function restoreAllSessions() {
    logger.info('SESSION_MGR', "Barcha faol foydalanuvchilar sessiyalari tiklanmoqda...");
    const users = getAllActiveUsers();

    if (!users || users.length === 0) {
        logger.info('SESSION_MGR', "Hozircha faol sessiyalar mavjud emas.");
        return 0;
    }

    let startedCount = 0;
    // AlwaysData cheklovlarida flood bo'lmasligi uchun ketma-ket, kichik tanaffus bilan yuklaymiz
    for (const user of users) {
        try {
            logger.info('SESSION_MGR', `Tiklanmoqda: User ID ${user.telegram_id}...`);
            const ok = await startUserSession(user.telegram_id);
            if (ok) startedCount++;
            // Har bir sessiya orasida 1 soniya kutish
            await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
            logger.error('SESSION_MGR', `User ${user.telegram_id} sessiyasini tiklashda xato: ${err.message}`);
        }
    }

    logger.info('SESSION_MGR', `✅ Jami ${startedCount}/${users.length} ta sessiya muvaffaqiyatli tiklandi.`);
    return startedCount;
}

/**
 * Foydalanuvchi sessiyasi faolmi tekshirish
 */
export function isUserSessionActive(userId) {
    const item = activeClients.get(userId);
    return Boolean(item && item.isRunning);
}

/**
 * Jami faol sessiyalar sonini olish
 */
export function getActiveSessionCount() {
    return activeClients.size;
}

/**
 * Graceful shutdown paytida barcha ulanishlarni xavfsiz yopish
 */
export async function disconnectAll() {
    logger.info('SESSION_MGR', "Barcha faol GramJS sessiyalari uzilmoqda...");
    const promises = [];
    for (const [userId, item] of activeClients.entries()) {
        promises.push((async () => {
            try {
                if (item.client) {
                    await item.client.disconnect();
                }
            } catch {}
        })());
    }
    await Promise.allSettled(promises);
    activeClients.clear();
    logger.info('SESSION_MGR', "Barcha sessiyalar muvaffaqiyatli yopildi.");
}
