import { escapeHtml } from '../../utils/filter.js';
import {
    getUserProfile,
    getAnalyzedMessagesForDigest,
    getRecentAnalyzedMessages,
    getUnreadAnalyzedCount,
    markAnalyzedMessageAsRead,
    markAllAnalyzedAsRead,
    clearAnalyzedMessages,
    getUser,
    saveVacancy
} from '../../database/db.js';
import { env } from '../../config/env.js';
import { generateDigestBriefing } from '../../services/geminiService.js';

export async function handleDigestCommand(bot, msg) {
    const userId = msg.from.id;
    const user = getUser(userId);
    const lang = user?.language || 'uz';
    const profile = getUserProfile(userId);
    const apiKey = profile.gemini_api_key || env.geminiApiKey;

    if (!apiKey) {
        await bot.sendMessage(userId, `⚠️ <b>Gemini API kaliti topilmadi!</b>\n\nAI Brifing yaratish uchun avval Gemini API kalitini kiriting:\n1. /profile buyrug'iga kiring\n2. "🔑 Gemini API Kaliti" tugmasini bosing\nyoki .env faylida <code>GEMINI_API_KEY</code> ni to'ldiring.`, {
            parse_mode: 'HTML'
        });
        return;
    }

    const loadingMsg = await bot.sendMessage(userId, `⏳ <b>AI Brifing tayyorlanmoqda...</b>\n\nTelegram kanallari, guruhlar va shaxsiy chatlaringizdagi so'nggi muhim xabarlar Gemini yordamida umumlashtirilmoqda. Bir necha soniya kuting...`, {
        parse_mode: 'HTML'
    });

    try {
        const messages = getAnalyzedMessagesForDigest(userId, 25, 24);

        if (!messages || messages.length === 0) {
            await bot.editMessageText(`ℹ️ <b>Hozircha yangi muhim xabarlar yo'q!</b>\n\nSo'nggi 24 soat ichida profilingizga mos shoshilinch yoki yuqori balli xabarlar kelmadi.\n\nYangi xabarlar kelishi bilan bot sizni xabardor qiladi.`, {
                chat_id: userId,
                message_id: loadingMsg.message_id,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📥 Inbox (Barcha saralanganlar)", callback_data: "inbox_page_0" }]
                    ]
                }
            });
            return;
        }

        const briefing = await generateDigestBriefing({
            apiKey,
            userProfile: profile.profile_text,
            messages,
            language: lang
        });

        const header = `📋 <b>SHAXSIY TELEGRAM BRIFINGI (SMART DIGEST)</b>\n📅 <i>${new Date().toLocaleString()}</i>\n📊 <i>Tahlil qilingan: ${messages.length} ta muhim xabar</i>\n\n`;

        const fullText = header + (briefing || "Brifing yaratishda matn olinmadi.");

        await bot.editMessageText(fullText, {
            chat_id: userId,
            message_id: loadingMsg.message_id,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Hammasini o'qildi deb belgilash", callback_data: "digest_mark_all_read" }
                    ],
                    [
                        { text: "📥 Inbox (Barcha xabarlar)", callback_data: "inbox_page_0" },
                        { text: "🔄 Yangilash", callback_data: "digest_refresh" }
                    ]
                ]
            }
        });
    } catch (err) {
        await bot.editMessageText(`❌ <b>Brifing tayyorlashda xatolik yuz berdi:</b> ${escapeHtml(err.message)}`, {
            chat_id: userId,
            message_id: loadingMsg.message_id,
            parse_mode: 'HTML'
        });
    }
}

export async function handleInboxCommand(bot, msg) {
    const userId = msg.from.id;
    await showInboxMessages(bot, userId, 0);
}

export async function showInboxMessages(bot, userId, page = 0, editMessageId = null) {
    const pageSize = 3;
    const offset = page * pageSize;

    const messages = getRecentAnalyzedMessages(userId, pageSize, offset);
    const unreadCount = getUnreadAnalyzedCount(userId);

    if (!messages || messages.length === 0) {
        const emptyText = `📥 <b>Muhim xabarlar qutisi (Inbox) bo'sh!</b>\n\nAI tahlil qilgan muhim xabarlar bu yerda saqlanadi.`;
        if (editMessageId) {
            await bot.editMessageText(emptyText, {
                chat_id: userId,
                message_id: editMessageId,
                parse_mode: 'HTML'
            }).catch(() => {});
        } else {
            await bot.sendMessage(userId, emptyText, { parse_mode: 'HTML' });
        }
        return;
    }

    let text = `📥 <b>SARALANGAN MUHIM XABARLAR (Inbox):</b>\n🔴 O'qilmaganlar: <b>${unreadCount}</b> ta\nSahifa: <b>${page + 1}</b>\n\n`;

    const inline_keyboard = [];

    messages.forEach((m, idx) => {
        const num = offset + idx + 1;
        const typeBadge = m.source_type === 'dm' ? '👤 Shaxsiy' : (m.source_type === 'bot' ? '🤖 Bot' : (m.source_type === 'group' ? '👥 Guruh' : '📢 Kanal'));
        const urgencyBadge = m.is_urgent ? '🚨 [SHOSHILINCH]' : '';
        const statusBadge = m.is_read ? '✅' : '🆕';

        text += `<b>${num}. ${statusBadge} ${typeBadge} | ${escapeHtml(m.source_name || 'Chat')}</b> ${urgencyBadge}\n`;
        text += `🎯 <b>Ball:</b> ${m.importance_score}/10 | 🏷 <b>Tur:</b> ${escapeHtml(m.category || 'Muhim')}\n`;
        text += `💡 <b>Xulosa:</b> ${escapeHtml(m.ai_summary || '')}\n`;
        if (m.ai_reasoning) {
            text += `🧐 <b>Nega muhim:</b> ${escapeHtml(m.ai_reasoning)}\n`;
        }
        if (m.action_items) {
            text += `⚡️ <b>Tavsiya:</b> <code>${escapeHtml(m.action_items)}</code>\n`;
        }
        text += `📅 <i>${m.created_at}</i>\n\n`;

        const row = [];
        if (m.link && m.link.startsWith('http')) {
            row.push({ text: `🔗 #${num} Havola`, url: m.link });
        }
        if (!m.is_read) {
            row.push({ text: `✅ #${num} O'qildi`, callback_data: `inbox_read_${m.id}_${page}` });
        }
        inline_keyboard.push(row);
    });

    const navRow = [];
    if (page > 0) {
        navRow.push({ text: "⬅️ Oldingi", callback_data: `inbox_page_${page - 1}` });
    }
    // Agar to'liq sahifa bo'lsa, keyingi sahifa tugmasi
    if (messages.length === pageSize) {
        navRow.push({ text: "Keyingi ➡️", callback_data: `inbox_page_${page + 1}` });
    }
    if (navRow.length > 0) {
        inline_keyboard.push(navRow);
    }

    inline_keyboard.push([
        { text: "📋 AI Brifing (/digest)", callback_data: "digest_refresh" },
        { text: "🗑 Barchasini tozalash", callback_data: "inbox_clear_all" }
    ]);

    if (editMessageId) {
        await bot.editMessageText(text, {
            chat_id: userId,
            message_id: editMessageId,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard }
        }).catch(() => {});
    } else {
        await bot.sendMessage(userId, text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard }
        });
    }
}

export async function handleInboxCallback(bot, query) {
    const userId = query.from.id;
    const data = query.data;
    const messageId = query.message?.message_id;

    await bot.answerCallbackQuery(query.id).catch(() => {});

    // Dayjestni yangilash
    if (data === 'digest_refresh') {
        await handleDigestCommand(bot, { from: { id: userId } });
        return;
    }

    // Dayjestdagi barcha xabarlarni o'qilgan deb belgilash
    if (data === 'digest_mark_all_read') {
        const count = markAllAnalyzedAsRead(userId);
        await bot.sendMessage(userId, `✅ Barcha <b>${count}</b> ta xabar o'qildi deb belgilandi!`, { parse_mode: 'HTML' });
        return;
    }

    // Inbox sahifalash
    if (data.startsWith('inbox_page_')) {
        const page = parseInt(data.replace('inbox_page_', ''), 10) || 0;
        await showInboxMessages(bot, userId, page, messageId);
        return;
    }

    // Bitta xabarni o'qildi deb belgilash
    if (data.startsWith('inbox_read_')) {
        const parts = data.replace('inbox_read_', '').split('_');
        const msgId = parts[0];
        const page = parseInt(parts[1] || '0', 10);

        markAnalyzedMessageAsRead(userId, msgId);
        await showInboxMessages(bot, userId, page, messageId);
        return;
    }

    // Barcha inbox xabarlarini tozalash
    if (data === 'inbox_clear_all') {
        clearAnalyzedMessages(userId);
        await bot.editMessageText("🗑 <b>Barcha saralangan xabarlar tozalandi.</b>", {
            chat_id: userId,
            message_id: messageId,
            parse_mode: 'HTML'
        }).catch(() => {});
        return;
    }
}
