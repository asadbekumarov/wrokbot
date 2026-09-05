import { t } from '../../locales/i18n.js';
import {
    getUser,
    getKeywords,
    addKeyword,
    deleteKeyword,
    clearKeywords,
    getStopWords,
    addStopWord,
    deleteStopWord,
    setUserState,
    clearUserState
} from '../../database/db.js';
import { escapeHtml } from '../../utils/filter.js';

export async function handleKeywordsCommand(bot, msg) {
    const userId = msg.from.id;
    const user = getUser(userId);
    const lang = user?.language || 'uz';

    const keywords = getKeywords(userId);

    let text = t(lang, 'keywords_title') + '\n\n';
    if (keywords.length === 0) {
        text += t(lang, 'keywords_empty');
    } else {
        text += keywords.map((k, i) => `${i + 1}. <code>${escapeHtml(k)}</code>`).join('\n');
    }

    const inline_keyboard = [
        [
            { text: t(lang, 'btn_add_keyword'), callback_data: 'kw_add' },
            { text: t(lang, 'btn_del_keyword'), callback_data: 'kw_del_menu' }
        ]
    ];

    if (keywords.length > 0) {
        inline_keyboard.push([
            { text: t(lang, 'btn_clear_keywords'), callback_data: 'kw_clear_all' }
        ]);
    }

    await bot.sendMessage(userId, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
}

export async function handleStopWordsCommand(bot, msg) {
    const userId = msg.from.id;
    const user = getUser(userId);
    const lang = user?.language || 'uz';

    const stopWords = getStopWords(userId);

    let text = t(lang, 'stopwords_title') + '\n\n';
    if (stopWords.length === 0) {
        text += "<i>Hozircha shaxsiy stop-so'zlar yo'q (standart rezyume filtrlari ishlamoqda).</i>";
    } else {
        text += stopWords.map((w, i) => `${i + 1}. <code>${escapeHtml(w)}</code>`).join('\n');
    }

    const inline_keyboard = [
        [
            { text: t(lang, 'btn_add_stopword'), callback_data: 'sw_add' },
            { text: t(lang, 'btn_del_stopword'), callback_data: 'sw_del_menu' }
        ]
    ];

    await bot.sendMessage(userId, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
}

export async function handleKeywordCallback(bot, query) {
    const userId = query.from.id;
    const data = query.data;
    const user = getUser(userId);
    const lang = user?.language || 'uz';

    if (data === 'kw_add') {
        setUserState(userId, 'AWAIT_KEYWORD_ADD', {});
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(userId, t(lang, 'prompt_add_keyword'), {
            parse_mode: 'HTML',
            reply_markup: { remove_keyboard: true }
        });
        return;
    }

    if (data === 'kw_del_menu') {
        const keywords = getKeywords(userId);
        await bot.answerCallbackQuery(query.id);

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

    if (data.startsWith('kw_del_')) {
        const keyword = decodeURIComponent(data.replace('kw_del_', ''));
        deleteKeyword(userId, keyword);

        await bot.answerCallbackQuery(query.id, {
            text: t(lang, 'keyword_deleted', { keyword }),
            show_alert: false
        });

        // Ro'yxatni yangilab ko'rsatish
        await handleKeywordsCommand(bot, { from: { id: userId } });
        return;
    }

    if (data === 'kw_clear_all') {
        clearKeywords(userId);
        await bot.answerCallbackQuery(query.id, {
            text: t(lang, 'keywords_cleared'),
            show_alert: true
        });
        await handleKeywordsCommand(bot, { from: { id: userId } });
        return;
    }

    // Stop-so'zlar callbacks
    if (data === 'sw_add') {
        setUserState(userId, 'AWAIT_STOPWORD_ADD', {});
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(userId, t(lang, 'prompt_add_stopword'), {
            parse_mode: 'HTML',
            reply_markup: { remove_keyboard: true }
        });
        return;
    }

    if (data === 'sw_del_menu') {
        const stopWords = getStopWords(userId);
        await bot.answerCallbackQuery(query.id);

        if (stopWords.length === 0) {
            await bot.sendMessage(userId, "<i>O'chirish uchun stop-so'zlar topilmadi.</i>", { parse_mode: 'HTML' });
            return;
        }

        const buttons = stopWords.map(w => ([
            { text: `🗑 ${w}`, callback_data: `sw_del_${encodeURIComponent(w)}` }
        ]));

        await bot.sendMessage(userId, "🗑 <b>O'chirmoqchi bo'lgan stop-so'zni tanlang:</b>", {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
        });
        return;
    }

    if (data.startsWith('sw_del_')) {
        const word = decodeURIComponent(data.replace('sw_del_', ''));
        deleteStopWord(userId, word);

        await bot.answerCallbackQuery(query.id, {
            text: t(lang, 'stopword_deleted', { word }),
            show_alert: false
        });

        await handleStopWordsCommand(bot, { from: { id: userId } });
        return;
    }
}

export async function processKeywordTextInput(bot, msg, userState) {
    const userId = msg.from.id;
    const text = msg.text ? msg.text.trim() : '';
    const user = getUser(userId);
    const lang = user?.language || 'uz';

    // Bekor qilish tekshiruvi
    if (text === '/cancel' || text.toLowerCase() === 'cancel' || text === t(lang, 'btn_cancel') || text.toLowerCase().includes('bekor')) {
        clearUserState(userId);
        await bot.sendMessage(userId, t(lang, 'action_cancelled'), {
            parse_mode: 'HTML'
        });
        return true;
    }

    if (userState.state === 'AWAIT_KEYWORD_ADD') {
        const rawWords = text.split(/[,;\n]+/).map(w => w.trim()).filter(w => w.length > 0);
        const added = [];
        const existing = [];

        for (const w of rawWords) {
            const ok = addKeyword(userId, w);
            if (ok) {
                added.push(w);
            } else {
                existing.push(w);
            }
        }

        clearUserState(userId);

        if (added.length > 0) {
            await bot.sendMessage(userId, t(lang, 'keyword_added', { keywords: added.join(', ') }), {
                parse_mode: 'HTML'
            });
        }
        if (existing.length > 0 && added.length === 0) {
            await bot.sendMessage(userId, t(lang, 'keyword_already_exists', { keyword: existing.join(', ') }), {
                parse_mode: 'HTML'
            });
        }

        await handleKeywordsCommand(bot, msg);
        return true;
    }

    if (userState.state === 'AWAIT_STOPWORD_ADD') {
        const rawWords = text.split(/[,;\n]+/).map(w => w.trim()).filter(w => w.length > 0);
        const added = [];

        for (const w of rawWords) {
            const ok = addStopWord(userId, w);
            if (ok) added.push(w);
        }

        clearUserState(userId);

        if (added.length > 0) {
            await bot.sendMessage(userId, t(lang, 'stopword_added', { word: added.join(', ') }), {
                parse_mode: 'HTML'
            });
        }
        await handleStopWordsCommand(bot, msg);
        return true;
    }

    return false;
}
