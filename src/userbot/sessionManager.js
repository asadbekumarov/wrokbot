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
    addMessageHash,
    getUserProfile,
    saveAnalyzedMessage
} from '../database/db.js';
import {
    decryptSession,
    findMatchedKeywords,
    checkAntiCvStopWords,
    hashMessage,
    formatVacancyAlert
} from '../utils/filter.js';
import { getLocale } from '../locales/i18n.js';
import { analyzeMessageWithGemini } from '../services/geminiService.js';

// Telegram Bot API orqali xabar yuboruvchi tashqi callback funksiyalari
let sendVacancyAlertCallback = null;
let sendAiAlertCallback = null;

export function registerAlertSender(fn) {
    sendVacancyAlertCallback = fn;
}

export function registerAiAlertSender(fn) {
    sendAiAlertCallback = fn;
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

            // Foydalanuvchining o'z xabarlari filtri:
            // Oddiy 1-ga-1 shaxsiy chatlarda boshqa odamga yozgan javoblari tashlab ketiladi.
            // Lekin Kanallar (test kanallar ham), Guruhlar yoki O'ziga (Saved Messages) yozilgan test xabarlar doim tahlil qilinadi!
            const isChannelOrGroup = Boolean(message.isChannel || message.isGroup || message.post);
            if (message.out && !isChannelOrGroup) {
                const peerUserId = (message.peerId?.userId || message.peerId?.user_id || '').toString();
                const isSaved = peerUserId === userId.toString();
                if (!isSaved) {
                    return;
                }
            }

            const msgText = message.message || message.text;
            // Xotirani tejash: matnsiz yoki juda qisqa xabarlarga e'tibor berilmaydi
            if (!msgText || typeof msgText !== 'string' || msgText.trim().length < 6) return;

            logger.info('USERBOT_MSG', `[User ${userId}] Yangi xabar: "${msgText.slice(0, 45).replace(/\n/g, ' ')}..." (out=${message.out}, isChannelOrGroup=${isChannelOrGroup})`);

            try {
                // Foydalanuvchi profili va AI sozlamalari
                const profile = getUserProfile(userId);
                const geminiKey = profile?.gemini_api_key || env.geminiApiKey;

                // Tezkor shovqin filtri: 1-2 so'zli oddiy salom-aliklar Gemini ga yuborilmaydi
                const isVeryShort = msgText.trim().split(/\s+/).length < 3 && msgText.trim().length < 25;
                const isCommonNoise = /^(salom|assalomu alaykum|privet|hi|hello|ok|rahmat|spasibo|tushundim|ha|yo'q|yoq|yaxshi|norm|xa|va alaykum|hayrli kun|zo'r|zur)\b/i.test(msgText.trim());
                if (isVeryShort && isCommonNoise) {
                    return;
                }

                // Anti-Duplicate (SHA-256 xesh tekshiruvi)
                const msgHash = hashMessage(msgText);
                if (!msgHash || isDuplicateHash(userId, msgHash)) {
                    return;
                }
                addMessageHash(userId, msgHash);

                // Chat turini aniqlash (Channel, Group, DM, Bot)
                let sourceType = 'channel';
                let sourceName = 'Telegram Chat';
                let sourceIdentifier = '';
                let link = '';

                if (message.isPrivate) {
                    const peerUserId = (message.peerId?.userId || message.peerId?.user_id || '').toString();
                    const isSaved = peerUserId === userId.toString();

                    if (isSaved) {
                        sourceType = 'dm';
                        sourceName = 'Saqlangan xabarlar (Saved Messages)';
                        sourceIdentifier = 'Saved Messages';
                    } else {
                        let sender = null;
                        try {
                            sender = await message.getSender();
                        } catch {}

                        if (sender?.bot) {
                            sourceType = 'bot';
                            if (!profile.scope_bots) return;
                            sourceName = sender.firstName || sender.username || 'Telegram Bot';
                            sourceIdentifier = sender.username ? `@${sender.username}` : (sender.id ? sender.id.toString() : '');
                        } else {
                            sourceType = 'dm';
                            if (!profile.scope_dms) return;
                            sourceName = sender ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || sender.username || 'Foydalanuvchi' : 'Shaxsiy chat';
                            sourceIdentifier = sender?.username ? `@${sender.username}` : (sender?.id ? sender.id.toString() : '');
                        }
                    }
                } else {
                    let chat = null;
                    try {
                        chat = await message.getChat();
                    } catch {}

                    if (!chat) {
                        try {
                            chat = await client.getEntity(message.peerId);
                        } catch {}
                    }

                    const isBroadcast = Boolean(chat?.broadcast || message.isChannel && !message.isGroup || message.post);

                    if (isBroadcast) {
                        sourceType = 'channel';
                        if (!profile.scope_channels) return;
                    } else {
                        sourceType = 'group';
                        if (!profile.scope_groups) return;
                    }

                    sourceName = chat?.title || message.chat?.title || (isBroadcast ? 'Telegram Kanal' : 'Telegram Guruh');
                    const username = chat?.username || message.chat?.username;
                    sourceIdentifier = username ? `@${username}` : (chat?.id ? chat.id.toString() : '');

                    if (username) {
                        link = `https://t.me/${username}/${message.id}`;
                    } else if (chat?.id) {
                        const cleanId = chat.id.toString().replace(/^-100/, '').replace(/^-/, '');
                        link = `https://t.me/c/${cleanId}/${message.id}`;
                    }
                }

                const currentUser = getUser(userId);
                const userLang = currentUser?.language || 'uz';

                // 1. GEMINI AI TAHLILI (Agar Gemini API kalit mavjud bo'lsa)
                if (geminiKey) {
                    const analysis = await analyzeMessageWithGemini({
                        apiKey: geminiKey,
                        userProfile: profile.profile_text,
                        text: msgText,
                        sourceInfo: {
                            type: sourceType,
                            name: sourceName,
                            identifier: sourceIdentifier
                        },
                        language: userLang
                    });

                    if (analysis && analysis.is_important) {
                        logger.info('GEMINI_MATCH', `[User ${userId}] [${sourceType.toUpperCase()}] ${sourceName}: Ball ${analysis.importance_score}/10, Shoshilinch: ${analysis.is_urgent ? 'HA' : 'YO\'Q'}`);

                        const savedId = saveAnalyzedMessage(userId, {
                            source_type: sourceType,
                            source_name: sourceName,
                            source_identifier: sourceIdentifier,
                            message_id: message.id,
                            link,
                            original_text: msgText,
                            importance_score: analysis.importance_score || (analysis.priority === 'HIGH' ? 9 : 6),
                            is_urgent: analysis.is_urgent || analysis.priority === 'HIGH',
                            category: analysis.category || 'General',
                            ai_summary: analysis.nima_boldi || analysis.summary || '',
                            ai_reasoning: analysis.nima_uchun_muhim || analysis.why_it_matters || '',
                            action_items: analysis.sizdan_kerak || analysis.action || ''
                        });

                        // Agar xabar o'ta muhim yoki shoshilinch bo'lsa -> zudlik bilan bot orqali yuborish
                        if ((analysis.is_urgent || analysis.importance_score >= 8) && sendAiAlertCallback) {
                            await sendAiAlertCallback({
                                userId,
                                messageId: savedId,
                                sourceType,
                                sourceName,
                                sourceIdentifier,
                                link,
                                originalText: msgText,
                                analysis,
                                userLang
                            });
                        }
                    }
                }

                // 2. MAVJUD KALIT SO'ZLAR / VAKANSIYALAR FILTRI (Kanal va guruhlar uchun moslik)
                const userKeywords = getKeywords(userId);
                if (userKeywords && userKeywords.length > 0 && (sourceType === 'channel' || sourceType === 'group')) {
                    const matchedKeywords = findMatchedKeywords(msgText, userKeywords);
                    if (matchedKeywords.length > 0) {
                        const userStopWords = getStopWords(userId);
                        if (!checkAntiCvStopWords(msgText, userStopWords)) {
                            logger.match(userId, sourceName, matchedKeywords);
                            const langStrings = getLocale(userLang);
                            const formatted = formatVacancyAlert({
                                channelName: sourceName,
                                text: msgText,
                                link,
                                keywords: matchedKeywords,
                                channelIdentifier: sourceIdentifier,
                                langStrings
                            });

                            if (sendVacancyAlertCallback) {
                                await sendVacancyAlertCallback({
                                    userId,
                                    channelName: sourceName,
                                    cleanText: formatted.cleanText,
                                    formattedText: formatted.formattedText,
                                    link,
                                    channelIdentifier: sourceIdentifier,
                                    matchedKeywords,
                                    contacts: formatted.contacts,
                                    userLang
                                });
                            }
                        }
                    }
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
