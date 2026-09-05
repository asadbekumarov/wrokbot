import { t } from '../../locales/i18n.js';
import { updateUserLanguage, getUser } from '../../database/db.js';
import { getMainInlineKeyboard } from '../nativeBot.js';

export function getLanguageKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: "🇺🇿 O'zbekcha", callback_data: "lang_uz" },
                { text: "🇷🇺 Русский", callback_data: "lang_ru" },
                { text: "🇺🇸 English", callback_data: "lang_en" }
            ]
        ]
    };
}

export async function handleLanguageCommand(bot, msg) {
    const userId = msg.from.id;
    const user = getUser(userId);
    const lang = user?.language || 'uz';

    await bot.sendMessage(userId, t(lang, 'language_title'), {
        parse_mode: 'HTML',
        reply_markup: getLanguageKeyboard()
    });
}

export async function handleLanguageCallback(bot, query) {
    const userId = query.from.id;
    const data = query.data; // "lang_uz", "lang_ru", "lang_en"
    const newLang = data.replace('lang_', '');

    updateUserLanguage(userId, newLang);

    await bot.answerCallbackQuery(query.id, {
        text: "OK ✅",
        show_alert: false
    });

    const confirmationMsg = t(newLang, 'language_changed');
    const user = getUser(userId);
    const isLoggedIn = Boolean(user && user.session_data && user.is_active);

    if (isLoggedIn) {
        await bot.sendMessage(userId, `${confirmationMsg}\n\n${t(newLang, 'menu_panel_title')}`, {
            parse_mode: 'HTML',
            reply_markup: getMainInlineKeyboard(newLang)
        });
    } else {
        await bot.sendMessage(userId, confirmationMsg, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: t(newLang, 'login_btn'), callback_data: 'auth_login' }]
                ]
            }
        });
    }
}

