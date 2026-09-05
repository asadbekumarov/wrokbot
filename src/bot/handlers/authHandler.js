import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { t } from '../../locales/i18n.js';
import {
    getUser,
    upsertUser,
    updateUserSession,
    deleteUserSession,
    setUserState,
    getUserState,
    clearUserState
} from '../../database/db.js';
import { encryptSession } from '../../utils/filter.js';
import { startUserSession, stopUserSession } from '../../userbot/sessionManager.js';

// Login jarayonida vaqtinchalik TelegramClient obyektlari
// userId -> { client, stringSession, phone, phoneCodeHash, timeout }
const pendingLogins = new Map();

export function cleanupPendingLogin(userId) {
    if (pendingLogins.has(userId)) {
        const item = pendingLogins.get(userId);
        if (item.timeout) clearTimeout(item.timeout);
        if (item.client) {
            try {
                item.client.disconnect();
            } catch {}
        }
        pendingLogins.delete(userId);
    }
}

export async function handleLoginCommand(bot, msg) {
    const userId = msg.from.id;
    const user = getUser(userId);
    const lang = user?.language || 'uz';

    if (user && user.session_data && user.is_active) {
        await bot.sendMessage(userId, t(lang, 'logged_in_status', { phone: user.phone || '—' }), {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: t(lang, 'logout_btn'), callback_data: 'auth_logout_confirm' }]
                ]
            }
        });
        return;
    }

    cleanupPendingLogin(userId);
    setUserState(userId, 'AWAIT_PHONE', {});

    await bot.sendMessage(userId, t(lang, 'login_prompt_phone'), {
        parse_mode: 'HTML',
        reply_markup: { remove_keyboard: true }
    });
}

export async function handleLogoutCommand(bot, msg) {
    const userId = msg.from.id;
    const user = getUser(userId);
    const lang = user?.language || 'uz';

    await bot.sendMessage(userId, t(lang, 'logout_confirm'), {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: t(lang, 'logout_yes'), callback_data: 'auth_logout_exec' },
                    { text: t(lang, 'logout_no'), callback_data: 'auth_logout_cancel' }
                ]
            ]
        }
    });
}

export async function handleAuthCallback(bot, query) {
    const userId = query.from.id;
    const data = query.data;
    const user = getUser(userId);
    const lang = user?.language || 'uz';

    if (data === 'auth_login') {
        await bot.answerCallbackQuery(query.id);
        await handleLoginCommand(bot, { from: { id: userId } });
        return;
    }

    if (data === 'auth_logout_confirm') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(userId, t(lang, 'logout_confirm'), {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: t(lang, 'logout_yes'), callback_data: 'auth_logout_exec' },
                        { text: t(lang, 'logout_no'), callback_data: 'auth_logout_cancel' }
                    ]
                ]
            }
        });
        return;
    }

    if (data === 'auth_logout_cancel') {
        await bot.answerCallbackQuery(query.id);
        await bot.deleteMessage(userId, query.message.message_id).catch(() => {});
        return;
    }

    if (data === 'auth_logout_exec') {
        await bot.answerCallbackQuery(query.id);
        cleanupPendingLogin(userId);
        clearUserState(userId);
        await stopUserSession(userId);
        deleteUserSession(userId);

        await bot.sendMessage(userId, t(lang, 'logout_success'), {
            parse_mode: 'HTML'
        });
        return;
    }
}

export async function processAuthTextInput(bot, msg, userState) {
    const userId = msg.from.id;
    const text = msg.text ? msg.text.trim() : '';
    const user = getUser(userId);
    const lang = user?.language || 'uz';

    // 1. Bekor qilish
    if (text === '/cancel' || text.toLowerCase() === 'cancel' || text === t(lang, 'btn_cancel') || text.toLowerCase().includes('bekor')) {
        cleanupPendingLogin(userId);
        clearUserState(userId);
        await bot.sendMessage(userId, t(lang, 'login_cancelled'), {
            parse_mode: 'HTML',
            reply_markup: { remove_keyboard: true }
        });
        return true;
    }

    // 2. Telefon raqam kiritildi
    if (userState.state === 'AWAIT_PHONE') {
        const phone = text.replace(/[^0-9+]/g, '');
        if (phone.length < 9) {
            await bot.sendMessage(userId, t(lang, 'login_invalid_phone'), { parse_mode: 'HTML' });
            return true;
        }

        await bot.sendMessage(userId, "⏳ <i>Kodni so'rash yuborilmoqda, kuting...</i>", { parse_mode: 'HTML' });

        try {
            cleanupPendingLogin(userId);

            const stringSession = new StringSession('');
            const client = new TelegramClient(stringSession, env.apiId, env.apiHash, {
                connectionRetries: 3,
                deviceModel: 'AlwaysData WorkBot',
                appVersion: '1.0.0',
                systemVersion: 'Linux'
            });

            await client.connect();

            const { phoneCodeHash } = await client.sendCode(
                { apiId: env.apiId, apiHash: env.apiHash },
                phone
            );

            // 5 daqiqa ichida kod kiritilmasa xotiradan tozalash
            const timeout = setTimeout(() => {
                cleanupPendingLogin(userId);
                clearUserState(userId);
            }, 5 * 60 * 1000);

            pendingLogins.set(userId, {
                client,
                stringSession,
                phone,
                phoneCodeHash,
                timeout
            });

            setUserState(userId, 'AWAIT_CODE', { phone, phoneCodeHash });

            await bot.sendMessage(userId, t(lang, 'login_code_sent'), {
                parse_mode: 'HTML',
                reply_markup: { remove_keyboard: true }
            });
        } catch (err) {
            logger.error('AUTH', `User ${userId} sendCode error: ${err.message}`);
            cleanupPendingLogin(userId);
            clearUserState(userId);
            await bot.sendMessage(userId, t(lang, 'login_error', { error: err.errorMessage || err.message }), { parse_mode: 'HTML' });
        }
        return true;
    }

    // 3. SMS / Telegram tasdiqlash kodi kiritildi
    if (userState.state === 'AWAIT_CODE') {
        const code = text.replace(/\s+/g, '');
        const pending = pendingLogins.get(userId);

        if (!pending || !pending.client) {
            clearUserState(userId);
            await bot.sendMessage(userId, "⚠️ Seans vaqti tugagan. Qaytadan urinib ko'ring: /login", { parse_mode: 'HTML' });
            return true;
        }

        await bot.sendMessage(userId, "⏳ <i>Tekshirilmoqda...</i>", { parse_mode: 'HTML' });

        try {
            await pending.client.invoke(new Api.auth.SignIn({
                phoneNumber: pending.phone,
                phoneCodeHash: pending.phoneCodeHash,
                phoneCode: code
            }));

            // Muvaffaqiyatli kirdi!
            await finalizeLoginSuccess(bot, userId, pending, lang);
        } catch (err) {
            const errMsg = err.errorMessage || err.message || '';
            if (errMsg.includes('SESSION_PASSWORD_NEEDED') || errMsg.includes('2FA')) {
                // 2FA talab etiladi
                setUserState(userId, 'AWAIT_2FA', { phone: pending.phone });
                await bot.sendMessage(userId, t(lang, 'login_2fa_prompt'), {
                    parse_mode: 'HTML',
                    reply_markup: { remove_keyboard: true }
                });
            } else {
                logger.error('AUTH', `User ${userId} signIn error: ${errMsg}`);
                let friendlyErr = errMsg;
                if (errMsg === 'PHONE_CODE_INVALID') friendlyErr = "Kod noto'g'ri kiritildi";
                if (errMsg === 'PHONE_CODE_EXPIRED') friendlyErr = "Kod muddati o'tib ketgan";
                await bot.sendMessage(userId, t(lang, 'login_error', { error: friendlyErr }), { parse_mode: 'HTML' });
            }
        }
        return true;
    }

    // 4. 2FA bulutli paroli kiritildi
    if (userState.state === 'AWAIT_2FA') {
        const password = text;
        const pending = pendingLogins.get(userId);

        if (!pending || !pending.client) {
            clearUserState(userId);
            await bot.sendMessage(userId, "⚠️ Seans vaqti tugagan. Qaytadan urinib ko'ring: /login", { parse_mode: 'HTML' });
            return true;
        }

        await bot.sendMessage(userId, "⏳ <i>2FA paroli tekshirilmoqda...</i>", { parse_mode: 'HTML' });

        try {
            await pending.client.signInWithPassword(
                { apiId: env.apiId, apiHash: env.apiHash },
                {
                    password: async () => password,
                    onError: (err) => { throw err; }
                }
            );

            await finalizeLoginSuccess(bot, userId, pending, lang);
        } catch (err) {
            const errMsg = err.errorMessage || err.message || '';
            logger.error('AUTH', `User ${userId} 2FA error: ${errMsg}`);
            let friendlyErr = errMsg;
            if (errMsg === 'PASSWORD_HASH_INVALID') friendlyErr = "2FA paroli noto'g'ri";
            await bot.sendMessage(userId, t(lang, 'login_error', { error: friendlyErr }), { parse_mode: 'HTML' });
        }
        return true;
    }

    return false;
}

async function finalizeLoginSuccess(bot, userId, pending, lang) {
    const rawSessionStr = pending.client.session.save();
    const encrypted = encryptSession(rawSessionStr);

    upsertUser(userId, pending.phone, encrypted, lang);
    clearUserState(userId);
    cleanupPendingLogin(userId);

    // Monitoringni ishga tushirish
    await startUserSession(userId);

    await bot.sendMessage(userId, t(lang, 'login_success'), {
        parse_mode: 'HTML',
        reply_markup: { remove_keyboard: true }
    });
}
