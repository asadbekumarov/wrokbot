import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const TelegramBot = require('node-telegram-bot-api');
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { t } from '../locales/i18n.js';
import {
    getUser,
    upsertUser,
    getKeywords,
    getStopWords,
    getUserState,
    saveVacancy,
    getSavedVacancies,
    getSavedVacanciesCount,
    deleteSavedVacancy,
    clearSavedVacancies,
    isVacancySaved
} from '../database/db.js';
import { escapeHtml } from '../utils/filter.js';
import { registerAlertSender, isUserSessionActive } from '../userbot/sessionManager.js';

import { handleLanguageCommand, handleLanguageCallback } from './handlers/languageHandler.js';
import { handleKeywordsCommand, handleStopWordsCommand, handleKeywordCallback, processKeywordTextInput } from './handlers/keywordHandler.js';
import { handleLoginCommand, handleLogoutCommand, handleAuthCallback, processAuthTextInput } from './handlers/authHandler.js';

let bot = null;

// Vaqtinchalik xotira: xabarlar ostidagi ⭐ Saqlash tugmasi uchun
// vacancyId -> vacancyData
const memoryVacancies = new Map();

export function initBot() {
    if (bot) return bot;

    bot = new TelegramBot(env.botToken, {
        polling: {
            interval: 300,
            autoStart: true,
            params: {
                timeout: 10
            }
        }
    });

    // Sessiya menejeri uchun bildirishnoma jo'natuvchini ro'yxatdan o'tkazish
    registerAlertSender(sendVacancyAlert);

    // Polling xatolarini ushlash (uzilishlarda bot qulamasligi uchun)
    bot.on('polling_error', (error) => {
        if (error?.code !== 'EFATAL' && !error?.message?.includes('ETELEGRAM: 409')) {
            // oddiy tarmoq tanaffuslari
        } else {
            logger.warn('BOT_POLLING', `Polling xabari: ${error.message || error.code}`);
        }
    });

    // Bot komandalarini ro'yxatga olish
    setupBotCommands();
    setupBotListeners();

    logger.bot("Telegram Bot API (Long Polling) muvaffaqiyatli ishga tushdi 🟢");
    return bot;
}

async function setupBotCommands() {
    try {
        await bot.setMyCommands([
            { command: 'start', description: 'Botni ishga tushirish / qayta yuklash' },
            { command: 'login', description: 'Telegram hisobini ulash (SMS kod)' },
            { command: 'keywords', description: 'Qidiruv kalit so\'zlarini sozlash' },
            { command: 'stopwords', description: 'Anti-CV va stop-so\'zlar' },
            { command: 'saved', description: 'Saqlangan vakansiyalar' },
            { command: 'status', description: 'Hisob va monitoring holati' },
            { command: 'language', description: 'Tilni o\'zgartirish / Choose language' },
            { command: 'logout', description: 'Hisobni uzish' },
            { command: 'help', description: 'Qo\'llanma va yordam' }
        ]);
    } catch (err) {
        logger.error('BOT_INIT', `Buyruqlarni o'rnatishda xato: ${err.message}`);
    }
}

export function getMainInlineKeyboard(lang = 'uz') {
    return {
        inline_keyboard: [
            [
                { text: t(lang, 'menu_status'), callback_data: "menu_status" },
                { text: t(lang, 'menu_keywords'), callback_data: "menu_keywords" }
            ],
            [
                { text: t(lang, 'menu_saved'), callback_data: "menu_saved" },
                { text: t(lang, 'menu_stopwords'), callback_data: "menu_stopwords" }
            ],
            [
                { text: t(lang, 'menu_language'), callback_data: "menu_language" },
                { text: t(lang, 'menu_help'), callback_data: "menu_help" }
            ]
        ]
    };
}

function setupBotListeners() {
    // ---------------------------------------------------------
    // 1. BUYRUQLAR (COMMANDS)
    // ---------------------------------------------------------

    bot.onText(/\/start/, async (msg) => {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'Foydalanuvchi';
        
        let user = getUser(userId);
        if (!user) {
            user = upsertUser(userId, null, null, 'uz');
        }

        const lang = user?.language || 'uz';
        const welcomeText = t(lang, 'welcome', { name: escapeHtml(firstName) });

        const isLoggedIn = Boolean(user && user.session_data && user.is_active);

        // Agar foydalanuvchi hali login qilmagan bo'lsa: FAQAT bitta login tugmasi chiqadi
        if (!isLoggedIn) {
            const notLoggedInMsg = `${welcomeText}\n\n${t(lang, 'not_logged_in_start')}`;
            await bot.sendMessage(userId, notLoggedInMsg, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: t(lang, 'login_btn'), callback_data: 'auth_login' }]
                    ]
                }
            });
            return;
        }

        // Agar foydalanuvchi allaqachon login qilgan bo'lsa:
        const statusText = '\n\n' + t(lang, 'logged_in_status', { phone: user.phone || '—' });

        await bot.sendMessage(userId, welcomeText + statusText, {
            parse_mode: 'HTML',
            reply_markup: { remove_keyboard: true }
        });

        // Boshqaruv paneli
        await bot.sendMessage(userId, t(lang, 'menu_panel_title'), {
            parse_mode: 'HTML',
            reply_markup: getMainInlineKeyboard(lang)
        });
    });

    bot.onText(/\/login/, async (msg) => {
        await handleLoginCommand(bot, msg);
    });

    bot.onText(/\/logout/, async (msg) => {
        await handleLogoutCommand(bot, msg);
    });

    function checkUserLoggedIn(userId, lang) {
        const user = getUser(userId);
        if (!user || !user.session_data || !user.is_active) {
            bot.sendMessage(userId, t(lang, 'not_logged_in'), {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: t(lang, 'login_btn'), callback_data: 'auth_login' }]
                    ]
                }
            });
            return false;
        }
        return true;
    }

    bot.onText(/\/keywords/, async (msg) => {
        const user = getUser(msg.from.id);
        const lang = user?.language || 'uz';
        if (!checkUserLoggedIn(msg.from.id, lang)) return;
        await handleKeywordsCommand(bot, msg);
    });

    bot.onText(/\/stopwords/, async (msg) => {
        const user = getUser(msg.from.id);
        const lang = user?.language || 'uz';
        if (!checkUserLoggedIn(msg.from.id, lang)) return;
        await handleStopWordsCommand(bot, msg);
    });

    bot.onText(/\/language/, async (msg) => {
        await handleLanguageCommand(bot, msg);
    });

    bot.onText(/\/status/, async (msg) => {
        const user = getUser(msg.from.id);
        const lang = user?.language || 'uz';
        if (!checkUserLoggedIn(msg.from.id, lang)) return;
        await showUserStatus(msg.from.id);
    });

    bot.onText(/\/saved/, async (msg) => {
        const user = getUser(msg.from.id);
        const lang = user?.language || 'uz';
        if (!checkUserLoggedIn(msg.from.id, lang)) return;
        await showSavedVacancies(msg.from.id, 0);
    });

    bot.onText(/\/help/, async (msg) => {
        const userId = msg.from.id;
        const user = getUser(userId);
        const lang = user?.language || 'uz';
        await bot.sendMessage(userId, t(lang, 'help_text'), { parse_mode: 'HTML' });
    });

    // ---------------------------------------------------------
    // 2. MATNLI XABARLAR VA FOYDALANUVCHI HOLATI (FSM)
    // ---------------------------------------------------------

    bot.on('message', async (msg) => {
        // Buyruqlarga tegmaymiz (ular onText da ushlanadi)
        if (!msg.text || msg.text.startsWith('/')) return;

        const userId = msg.from.id;
        const text = msg.text.trim();
        const user = getUser(userId);
        const lang = user?.language || 'uz';
        const userState = getUserState(userId);

        // A. Agar biror formani to'ldirayotgan bo'lsa (Login / Keywords)
        if (userState && userState.state) {
            // Login jarayoni
            if (['AWAIT_PHONE', 'AWAIT_CODE', 'AWAIT_2FA'].includes(userState.state)) {
                const handled = await processAuthTextInput(bot, msg, userState);
                if (handled) return;
            }

            // Kalit so'z yoki Stop-so'z kiritish
            if (['AWAIT_KEYWORD_ADD', 'AWAIT_STOPWORD_ADD'].includes(userState.state)) {
                const handled = await processKeywordTextInput(bot, msg, userState);
                if (handled) return;
            }
        }

        // B. Asosiy Reply klaviatura tugmalari (barcha variantlar: yangi va eski tugmalar)
        const lowerText = text.toLowerCase();

        // 1. Sozlamalar / Status
        if (
            text === "📊 Status" || 
            text === "📊 Holat" || 
            text.includes("mening sozlamalarim") || 
            text.includes("sozlamalar")
        ) {
            await showUserStatus(userId);
            return;
        }

        // 2. Kalit so'zlar
        if (text === "🔑 Kalit so'zlar" || text === "🔑 Keywords") {
            await handleKeywordsCommand(bot, msg);
            return;
        }

        // 3. So'z qo'shish (pastdagi tugma)
        if (text.includes("so'z qo'shish") || text.includes("добавить слово") || text.includes("add keyword")) {
            setUserState(userId, 'AWAIT_KEYWORD_ADD', {});
            await bot.sendMessage(userId, t(lang, 'prompt_add_keyword'), {
                parse_mode: 'HTML',
                reply_markup: { remove_keyboard: true }
            });
            return;
        }

        // 4. So'z o'chirish (pastdagi tugma)
        if (text.includes("so'z o'chirish") || text.includes("удалить слово") || text.includes("remove keyword")) {
            const keywords = getKeywords(userId);
            if (keywords.length === 0) {
                await bot.sendMessage(userId, t(lang, 'keywords_empty'), { parse_mode: 'HTML' });
                return;
            }
            const buttons = keywords.map(k => ([
                { text: `🗑 ${k}`, callback_data: `kw_del_${encodeURIComponent(k)}` }
            ]));
            await bot.sendMessage(userId, t(lang, 'prompt_del_keyword'), {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: buttons }
            });
            return;
        }

        // 5. Kanal qo'shish / o'chirish
        if (text.includes("kanal qo'shish") || text.includes("kanal o'chirish")) {
            await bot.sendMessage(userId, `ℹ️ <b>Kanal nazorati haqida:</b>\n\nSiz Telegram hisobingizni ulaganingizda (/login), tizim siz a'zo bo'lgan <b>barcha ochiq va yopiq kanallarni</b>, guruhlarni avtomatik ravishda to'g'ridan-to'g'ri kuzatadi.\n\nSiz yangi kanalga a'zo bo'lsangiz — bot uni o'z-o'zidan darhol kuzatishni boshlaydi!`, {
                parse_mode: 'HTML'
            });
            return;
        }

        // 6. Yangi kanallarni qidirish
        if (text.includes("yangi kanallarni qidirish") || text.includes("avto-kanal") || text.includes("aqlli analiz")) {
            await bot.sendMessage(userId, `🔍 <b>Avtomatik kanallar monitoringi faol!</b>\n\nSiz a'zo bo'lgan barcha kanallardagi xabarlar real-time rejimida o'qilib, kalit so'zlaringizga mos ish e'lonlari darhol shu yerga yuboriladi.\n\nKalit so'zlarni ko'rish yoki yangilash uchun: /keywords`, {
                parse_mode: 'HTML'
            });
            return;
        }

        // 7. Stop-so'zlar
        if (text === "🛑 Stop-so'zlar" || text === "🛑 Stop-words" || text.includes("stop-so'z")) {
            await handleStopWordsCommand(bot, msg);
            return;
        }

        // 8. Saqlanganlar
        if (text === "⭐ Saqlanganlar" || text === "⭐ Saved" || text.includes("saqlangan postlar")) {
            await showSavedVacancies(userId, 0);
            return;
        }

        // 9. Til tanlash
        if (text === "🌐 Til / Language" || text === "🌐 Til" || text === "🌐 Language") {
            await handleLanguageCommand(bot, msg);
            return;
        }

        // 10. Yordam
        if (text === "📖 Yordam" || text === "📖 Help") {
            await bot.sendMessage(userId, t(lang, 'help_text'), { parse_mode: 'HTML' });
            return;
        }

        // 11. Klaviaturani yashirish
        if (text === "/hide_keyboard" || text === "❌ Klaviaturani yopish") {
            await bot.sendMessage(userId, "✅ Pastdagi klaviatura yopildi. Barcha buyruqlarni chapdagi ko'k <b>Menu</b> tugmasi orqali boshqarishingiz mumkin!", {
                parse_mode: 'HTML',
                reply_markup: { remove_keyboard: true }
            });
            return;
        }

        // Agar hech biriga tushmasa
        await bot.sendMessage(userId, t(lang, 'unknown_command'), { parse_mode: 'HTML' });
    });

    // ---------------------------------------------------------
    // 3. INLINE TUGMALAR (CALLBACK QUERY ROUTING)
    // ---------------------------------------------------------

    bot.on('callback_query', async (query) => {
        const userId = query.from.id;
        const data = query.data;
        if (!data) return;

        try {
            // 0. Bosh menyu inline tugmalari
            if (data.startsWith('menu_')) {
                await bot.answerCallbackQuery(query.id);
                const user = getUser(userId);
                const lang = user?.language || 'uz';

                if (data === 'menu_status') {
                    if (!checkUserLoggedIn(userId, lang)) return;
                    await showUserStatus(userId);
                } else if (data === 'menu_keywords') {
                    if (!checkUserLoggedIn(userId, lang)) return;
                    await handleKeywordsCommand(bot, { from: { id: userId } });
                } else if (data === 'menu_saved') {
                    if (!checkUserLoggedIn(userId, lang)) return;
                    await showSavedVacancies(userId, 0);
                } else if (data === 'menu_stopwords') {
                    if (!checkUserLoggedIn(userId, lang)) return;
                    await handleStopWordsCommand(bot, { from: { id: userId } });
                } else if (data === 'menu_language') {
                    await handleLanguageCommand(bot, { from: { id: userId } });
                } else if (data === 'menu_help') {
                    await bot.sendMessage(userId, t(lang, 'help_text'), { parse_mode: 'HTML' });
                }
                return;
            }

            // 1. Til tanlash
            if (data.startsWith('lang_')) {
                await handleLanguageCallback(bot, query);
                return;
            }

            // 2. Kalit so'zlar / Stop-so'zlar
            if (data.startsWith('kw_') || data.startsWith('sw_')) {
                await handleKeywordCallback(bot, query);
                return;
            }

            // 3. Login / Logout
            if (data.startsWith('auth_')) {
                await handleAuthCallback(bot, query);
                return;
            }

            // 4. Vakansiyani saqlash (⭐ Saqlash)
            if (data.startsWith('save_vac_')) {
                const vacId = data.replace('save_vac_', '');
                const user = getUser(userId);
                const lang = user?.language || 'uz';

                if (isVacancySaved(userId, vacId)) {
                    await bot.answerCallbackQuery(query.id, {
                        text: t(lang, 'alert_already_saved'),
                        show_alert: false
                    });
                    return;
                }

                const vacData = memoryVacancies.get(vacId);
                if (vacData) {
                    saveVacancy(userId, vacData);
                    await bot.answerCallbackQuery(query.id, {
                        text: t(lang, 'alert_saved_success'),
                        show_alert: false
                    });

                    // Tugmani yangilaymiz: ⭐ Saqlash -> ✅ Saqlandi
                    if (query.message && query.message.reply_markup) {
                        const newKeyboard = query.message.reply_markup.inline_keyboard.map(row =>
                            row.map(btn => {
                                if (btn.callback_data === data) {
                                    return { text: t(lang, 'btn_saved_done'), callback_data: 'noop' };
                                }
                                return btn;
                            })
                        );
                        await bot.editMessageReplyMarkup(
                            { inline_keyboard: newKeyboard },
                            { chat_id: userId, message_id: query.message.message_id }
                        ).catch(() => {});
                    }
                } else {
                    await bot.answerCallbackQuery(query.id, {
                        text: t(lang, 'alert_saved_success'),
                        show_alert: false
                    });
                }
                return;
            }

            // 5. Saqlanganlar sahifalash va o'chirish
            if (data.startsWith('saved_page_')) {
                const page = parseInt(data.replace('saved_page_', ''), 10) || 0;
                await bot.answerCallbackQuery(query.id);
                await showSavedVacancies(userId, page, query.message.message_id);
                return;
            }

            if (data.startsWith('delsaved_')) {
                const id = data.replace('delsaved_', '');
                const user = getUser(userId);
                const lang = user?.language || 'uz';

                deleteSavedVacancy(userId, id);
                await bot.answerCallbackQuery(query.id, {
                    text: t(lang, 'alert_deleted_saved'),
                    show_alert: false
                });

                await showSavedVacancies(userId, 0, query.message.message_id);
                return;
            }

            if (data === 'clear_all_saved') {
                const user = getUser(userId);
                const lang = user?.language || 'uz';

                clearSavedVacancies(userId);
                await bot.answerCallbackQuery(query.id, {
                    text: t(lang, 'alert_all_saved_cleared'),
                    show_alert: true
                });

                await showSavedVacancies(userId, 0, query.message.message_id);
                return;
            }

            if (data === 'noop') {
                await bot.answerCallbackQuery(query.id);
                return;
            }

            await bot.answerCallbackQuery(query.id);
        } catch (err) {
            logger.error('BOT_CALLBACK', `Callback query xatosi: ${err.message}`);
        }
    });
}

// -------------------------------------------------------------
// STATUS FUNKSIYASI
// -------------------------------------------------------------

async function showUserStatus(userId) {
    const user = getUser(userId);
    const lang = user?.language || 'uz';

    const keywords = getKeywords(userId);
    const stopWords = getStopWords(userId);
    const savedCount = getSavedVacanciesCount(userId);
    const isActive = isUserSessionActive(userId);

    let text = t(lang, 'status_title') + '\n\n';
    text += `👤 <b>ID:</b> <code>${userId}</code>\n`;
    text += t(lang, 'status_phone', { phone: user?.phone || '—' }) + '\n';
    text += `🟢 <b>Monitoring:</b> ${isActive ? t(lang, 'session_active') : t(lang, 'session_inactive')}\n\n`;
    text += t(lang, 'status_keywords_count', { count: keywords.length }) + '\n';
    text += t(lang, 'status_stopwords_count', { count: stopWords.length }) + '\n';
    text += t(lang, 'status_saved_count', { count: savedCount }) + '\n';

    const inline_keyboard = [];
    if (!isActive) {
        inline_keyboard.push([{ text: t(lang, 'login_btn'), callback_data: 'auth_login' }]);
    } else {
        inline_keyboard.push([{ text: t(lang, 'logout_btn'), callback_data: 'auth_logout_confirm' }]);
    }

    await bot.sendMessage(userId, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
}

// -------------------------------------------------------------
// SAQLANGAN VAKANSIYALAR RO'YXATI VA SAHIFALASH
// -------------------------------------------------------------

async function showSavedVacancies(userId, page = 0, editMessageId = null) {
    const user = getUser(userId);
    const lang = user?.language || 'uz';

    const totalCount = getSavedVacanciesCount(userId);
    if (totalCount === 0) {
        const emptyMsg = t(lang, 'saved_empty');
        if (editMessageId) {
            await bot.editMessageText(emptyMsg, {
                chat_id: userId,
                message_id: editMessageId,
                parse_mode: 'HTML'
            }).catch(() => {});
        } else {
            await bot.sendMessage(userId, emptyMsg, { parse_mode: 'HTML' });
        }
        return;
    }

    const pageSize = 4;
    const totalPages = Math.ceil(totalCount / pageSize);
    const currentPage = Math.min(Math.max(0, page), totalPages - 1);
    const offset = currentPage * pageSize;

    const items = getSavedVacancies(userId, pageSize, offset);

    let msg = t(lang, 'saved_title', { count: totalCount }) + ` [${currentPage + 1}/${totalPages}]:\n\n`;
    const inline_keyboard = [];

    items.forEach((v, idx) => {
        const num = offset + idx + 1;
        const channel = escapeHtml(v.channel_name || v.channel_id || 'Kanal');
        const snippet = escapeHtml((v.text || '').substring(0, 120).replace(/\s+/g, ' '));

        msg += `<b>${num}. 📌 ${channel}</b>\n${snippet}...\n📅 <i>${v.saved_at}</i>\n\n`;

        const row = [];
        if (v.link && v.link.startsWith('http')) {
            row.push({ text: `🔗 #${num}`, url: v.link });
        }
        row.push({ text: `🗑 #${num}`, callback_data: `delsaved_${v.id}` });
        inline_keyboard.push(row);
    });

    const navRow = [];
    if (currentPage > 0) {
        navRow.push({ text: t(lang, 'btn_prev_page'), callback_data: `saved_page_${currentPage - 1}` });
    }
    if (currentPage < totalPages - 1) {
        navRow.push({ text: t(lang, 'btn_next_page'), callback_data: `saved_page_${currentPage + 1}` });
    }
    if (navRow.length > 0) {
        inline_keyboard.push(navRow);
    }

    inline_keyboard.push([
        { text: t(lang, 'btn_clear_all_saved'), callback_data: 'clear_all_saved' }
    ]);

    if (editMessageId) {
        await bot.editMessageText(msg, {
            chat_id: userId,
            message_id: editMessageId,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard }
        }).catch(() => {});
    } else {
        await bot.sendMessage(userId, msg, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard }
        });
    }
}

// -------------------------------------------------------------
// VAKANSIYA BILDIRISHNOMASINI YUBORISH (SEND VACANCY ALERT)
// -------------------------------------------------------------

export async function sendVacancyAlert({
    userId,
    channelName,
    cleanText,
    formattedText,
    link,
    channelIdentifier,
    matchedKeywords,
    contacts,
    userLang
}) {
    if (!bot) return;

    const uniqueId = 'v_' + Math.random().toString(36).substring(2, 9);
    
    memoryVacancies.set(uniqueId, {
        id: uniqueId,
        channelName,
        text: cleanText,
        link,
        channelIdentifier,
        matchedKeywords,
        contacts
    });

    // AlwaysData RAM tejash: xotira to'lib ketmasligi uchun 500 tadan oshganda eskisini o'chirish
    if (memoryVacancies.size > 500) {
        const firstKey = memoryVacancies.keys().next().value;
        memoryVacancies.delete(firstKey);
    }

    const inline_keyboard = [
        [
            { text: t(userLang, 'btn_save'), callback_data: `save_vac_${uniqueId}` }
        ]
    ];

    if (link && link.startsWith('http')) {
        inline_keyboard[0].push({ text: t(userLang, 'btn_original_post'), url: link });
    }

    try {
        await bot.sendMessage(userId, formattedText, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard }
        });
    } catch (err) {
        logger.error('BOT_ALERT', `User ${userId} ga alert jo'natishda xato: ${err.message}`);
    }
}
