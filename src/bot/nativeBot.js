import { storage } from '../utils/storage.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
const MY_CHAT_ID = process.env.MY_CHAT_ID;
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Native API Fetch Yordamchi Funksiyasi
async function request(method, payload = {}) {
    try {
        const res = await fetch(`${API_URL}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (err) {
        console.error(`[Bot Error] API call to ${method} failed:`, err.message);
        return { ok: false };
    }
}

// Telegram uchun HTML maxsus belgilarini tozalash (parse_error'ni oldini oladi)
function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Oxirgi topilgan vakansiyalar xotirasi (Inline tugmalar uchun)
export const recentVacancies = new Map();

// UserBot topgan vakansiyani egasiga jo'natish funksiyasi
export async function sendAlert(channelName, text, link, channelIdentifier = null) {
    const escapedText = escapeHtml(text.substring(0, 3000)); // Limit qo'yamiz (3000 harf)
    let msg = `🚨 <b>Yangi Vakansiya Topildi!</b>\n📌 <b>Kanal:</b> ${escapeHtml(channelName)}\n\n${escapedText}`;
    
    let reply_markup = undefined;

    // Agar bu vakansiya bo'lsa (channelIdentifier uzatilgan bo'lsa), Inline tugmalar ulaymiz
    if (channelIdentifier) {
        const vacancyId = 'v_' + Math.random().toString(36).substring(2, 9);
        recentVacancies.set(vacancyId, {
            id: vacancyId,
            channelName,
            text,
            link,
            channelIdentifier,
            saved: false,
            channelDeleted: false
        });

        // Xotira to'lib ketmasligi uchun 300 tadan oshganda eskisini o'chiramiz
        if (recentVacancies.size > 300) {
            const firstKey = recentVacancies.keys().next().value;
            recentVacancies.delete(firstKey);
        }

        const inline_keyboard = [
            [
                { text: "⭐ Saqlash", callback_data: `save_${vacancyId}` },
                { text: "🚫 Kanalni o'chirish", callback_data: `delch_${vacancyId}` }
            ]
        ];

        if (link && link.startsWith('http')) {
            inline_keyboard.push([
                { text: "🔗 Asl post", url: link }
            ]);
        }

        reply_markup = { inline_keyboard };
    } else {
        if (link) {
            msg += `\n\n👉 <a href="${link}">Xabarga o'tish</a>`;
        }
    }
    
    const payload = {
        chat_id: MY_CHAT_ID,
        text: msg,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };
    if (reply_markup) {
        payload.reply_markup = reply_markup;
    }

    await request('sendMessage', payload);
}

// Telegram botining Menu va Profilini sozlash
async function setupBotProfile() {
    await request('setMyCommands', {
        commands: [
            { command: 'start', description: 'Botni ishga tushirish' },
            { command: 'keywords', description: 'Sozlamalarni ko\'rish' },
            { command: 'saved', description: 'Saqlangan vakansiyalar' }
        ]
    });

    await request('setMyDescription', {
        description: "👋 Botga xush kelibsiz!\n\n🤖 Men sizning shaxsiy filtringizman.\n\nSiz kiritgan kanallarni tunu-kun kuzataman va faqat siz izlayotgan kalit so'zlarga mos ish o'rinlari/xabarlarni shu yerga yuboraman.\n\n👇 Boshlash uchun pastdagi tugmani bosing"
    });
}

// Long Polling Sikli
export async function startLongPolling() {
    console.log('[NativeBot] Long polling boshlandi...');
    await setupBotProfile();
    let offset = 0;

    while (true) {
        const data = await request('getUpdates', { offset, timeout: 30 });
        if (!data.ok) {
            console.log('[NativeBot] getUpdates failed:', data);
        }
        
        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                offset = update.update_id + 1; // Takrorlanishning oldini olish uchun ID ni suramiz
                
                // 1. Matnli xabarlar
                if (update.message && update.message.text) {
                    const chatId = update.message.chat.id.toString();
                    if (chatId !== MY_CHAT_ID) {
                        console.log(`[NativeBot] Ignoring message from unauthorized user: ${chatId}`);
                        continue; 
                    }
                    await handleCommand(update.message);
                }

                // 2. Inline tugmalar (Callback Query)
                if (update.callback_query) {
                    const callbackQuery = update.callback_query;
                    const fromId = callbackQuery.from ? callbackQuery.from.id.toString() : '';
                    if (fromId !== MY_CHAT_ID) {
                        console.log(`[NativeBot] Ignoring callback from unauthorized user: ${fromId}`);
                        continue;
                    }
                    await handleCallbackQuery(callbackQuery);
                }
            }
        }
        
        // API dan bloklanib qolmaslik uchun qisqa tanaffus
        await new Promise(r => setTimeout(r, 1000));
    }
}

// Global holat (faqat 1 ta foydalanuvchi bo'lgani uchun)
let userState = null;

const MAIN_KEYBOARD = {
    keyboard: [
        [{ text: "📊 Mening Sozlamalarim" }, { text: "⭐ Saqlanganlar" }],
        [{ text: "➕ So'z qo'shish" }, { text: "➖ So'z o'chirish" }],
        [{ text: "➕ Kanal qo'shish" }, { text: "➖ Kanal o'chirish" }],
        [{ text: "🛑 Stop-so'z qo'shish" }, { text: "🗑 Stop-so'z o'chirish" }],
        [{ text: "🔍 Yangi kanallarni qidirish" }]
    ],
    resize_keyboard: true
};

const CANCEL_KEYBOARD = {
    keyboard: [[{ text: "❌ Bekor qilish" }]],
    resize_keyboard: true
};

// Buyruqlarni boshqarish (Chiroyli UI bilan)
async function handleCommand(message) {
    const text = message.text;
    const firstName = message.from ? message.from.first_name : "Foydalanuvchi";
    
    const reply = async (msg, markup = MAIN_KEYBOARD) => request('sendMessage', { 
        chat_id: MY_CHAT_ID, 
        text: msg,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: markup
    });

    if (text === '/start' || text === '❌ Bekor qilish') {
        userState = null;
        await reply(`👋 Salom, <b>${escapeHtml(firstName)}</b>!\n\n🤖 <b>Xush kelibsiz!</b> Men sizning shaxsiy filtringizman.\n\nSiz kiritgan kanallarni tunu-kun kuzataman va faqat siz izlayotgan kalit so'zlarga mos ish o'rinlari/xabarlarni shu yerga yuboraman.\n\n👇 <i>Quyidagi tugmalardan foydalanib botni oson boshqaring:</i>`);
        return;
    }

    if (text === '📊 Mening Sozlamalarim' || text === '📊 Sozlamalar' || text === '/keywords') {
        userState = null;
        const data = await storage.read();
        const kwList = data.keywords.length > 0 ? data.keywords.map(k => `🔸 <code>${escapeHtml(k)}</code>`).join('\n') : "<i>Hozircha bo'sh</i>";
        const swList = (data.stopWords && data.stopWords.length > 0) ? data.stopWords.map(s => `🛑 <code>${escapeHtml(s)}</code>`).join('\n') : "<i>Hozircha bo'sh</i>";
        const chList = data.channels.length > 0 ? data.channels.map(c => `🔹 ${escapeHtml(c)}`).join('\n') : "<i>Hozircha bo'sh</i>";
        const savedCount = (data.savedVacancies && data.savedVacancies.length) || 0;
        await reply(`📊 <b>Sizning sozlamalaringiz:</b>\n\n🔑 <b>Kalit so'zlar (${data.keywords.length}):</b>\n${kwList}\n\n🛑 <b>Stop-so'zlar / Anti-CV (${data.stopWords ? data.stopWords.length : 0}):</b>\n${swList}\n\n📢 <b>Kuzatilayotgan Kanallar (${data.channels.length}):</b>\n${chList}\n\n⭐ <b>Saqlangan vakansiyalar soni:</b> ${savedCount} ta`);
        return;
    }

    if (text === '⭐ Saqlanganlar' || text === '⭐ Saqlangan Vakansiyalar' || text === '/saved') {
        userState = null;
        const saved = await storage.getSavedVacancies();
        if (saved.length === 0) {
            await reply("⭐ <b>Saqlangan vakansiyalar hozircha mavjud emas.</b>\n\nYangi vakansiya kelganda uning ostidagi <b>⭐ Saqlash</b> tugmasini bossangiz, shu yerda ro'yxatga tushadi.");
            return;
        }

        let msg = `⭐ <b>Saqlangan Vakansiyalar (${saved.length} ta):</b>\n\n`;
        saved.slice(0, 10).forEach((v, idx) => {
            const ch = escapeHtml(v.channelName || v.channelIdentifier || 'Kanal');
            const snippet = escapeHtml((v.text || '').substring(0, 120).replace(/\n+/g, ' '));
            const linkStr = v.link ? `👉 <a href="${v.link}">Asl postga o'tish</a>` : '';
            msg += `<b>${idx + 1}. 📌 ${ch}</b>\n<i>${snippet}...</i>\n${linkStr}\n📅 <i>${v.savedAt || ''}</i>\n\n`;
        });
        if (saved.length > 10) {
            msg += `<i>...va yana ${saved.length - 10} ta vakansiya mavjud.</i>`;
        }
        await reply(msg);
        return;
    }

    if (text === "➕ So'z qo'shish") {
        userState = 'ADD_KEYWORD';
        await reply("📝 <b>Qo'shmoqchi bo'lgan so'zingizni yozing:</b>", CANCEL_KEYBOARD);
        return;
    }

    if (text === "➖ So'z o'chirish") {
        userState = 'DEL_KEYWORD';
        await reply("🗑 <b>O'chirmoqchi bo'lgan so'zingizni yozing:</b>", CANCEL_KEYBOARD);
        return;
    }

    if (text === "➕ Kanal qo'shish") {
        userState = 'ADD_CHANNEL';
        await reply("📢 <b>Qo'shmoqchi bo'lgan kanal linkini yoki username'ni yozing:</b>\n<i>Misol: @kanal yoki t.me/kanal</i>", CANCEL_KEYBOARD);
        return;
    }

    if (text === "➖ Kanal o'chirish") {
        userState = 'DEL_CHANNEL';
        await reply("🗑 <b>O'chirmoqchi bo'lgan kanalni yozing:</b>", CANCEL_KEYBOARD);
        return;
    }

    if (text === "🛑 Stop-so'z qo'shish") {
        userState = 'ADD_STOPWORD';
        await reply("🛑 <b>Qo'shmoqchi bo'lgan stop-so'z yoki jumlani yozing:</b>\n<i>Misol: #rezyume yoki ish qidiryapti</i>", CANCEL_KEYBOARD);
        return;
    }

    if (text === "🗑 Stop-so'z o'chirish") {
        userState = 'DEL_STOPWORD';
        await reply("🗑 <b>O'chirmoqchi bo'lgan stop-so'zni yozing:</b>", CANCEL_KEYBOARD);
        return;
    }

    if (text === "🔍 Yangi kanallarni qidirish" || text === "🔍 Avto-Kanal Qidirish" || text === "🧠 Aqlli Analiz") {
        userState = 'DEEP_SCAN';
        await reply("🔍 <b>Kanal qidirish:</b>\n\nTelegramdan qaysi mavzudagi kanallarni topaylik? Bot siz izlagan so'zlar qatnashgan kanallarni izlab, avtomatik bazangizga qo'shadi.\n\n<i>Kerakli so'zlarni yozing:</i>\nMasalan: <code>ish vakansiya dasturchi</code>", CANCEL_KEYBOARD);
        return;
    }

    // Holat (State) asosida xabarlarni qayta ishlash
    if (userState === 'AUTO_CHANNEL') {
        const keywords = text.toLowerCase().split(' ').filter(k => k.trim());
        await reply(`⏳ <i>Kanallar qidirilmoqda...</i>`);
        try {
            const { scanAndAddChannels } = await import('../userbot/client.js');
            const addedCount = await scanAndAddChannels(keywords);
            await reply(`✅ <b>Qidiruv yakunlandi!</b>\n\nTopilgan va bazaga qo'shilgan kanallar soni: <b>${addedCount}</b> ta.`, MAIN_KEYBOARD);
        } catch (e) {
            console.error("Avto kanal qidirishda xato:", e);
            await reply(`❌ <b>Xatolik yuz berdi.</b>`, MAIN_KEYBOARD);
        }
        userState = null;
        return;
    }

    if (userState === 'DEEP_SCAN') {
        const keywords = text.toLowerCase().split(' ').filter(k => k.trim());
        await reply(`⏳ <i>Aqlli analiz boshlandi! Barcha kanallaringizning oxirgi xabarlari o'qilmoqda...\nBu biroz ko'proq vaqt oladi, iltimos kuting.</i>`);
        try {
            const { deepScanAndAddChannels } = await import('../userbot/client.js');
            const addedCount = await deepScanAndAddChannels(keywords);
            await reply(`✅ <b>Aqlli Analiz yakunlandi!</b>\n\nTopilgan va bazaga qo'shilgan kanallar soni: <b>${addedCount}</b> ta.`, MAIN_KEYBOARD);
        } catch (e) {
            console.error("Aqlli analizda xato:", e);
            await reply(`❌ <b>Xatolik yuz berdi.</b>`, MAIN_KEYBOARD);
        }
        userState = null;
        return;
    }

    if (userState === 'ADD_KEYWORD') {
        const kAdded = await storage.addKeyword(text);
        await reply(kAdded ? `✅ <b>Qo'shildi:</b> <code>${text}</code>` : `ℹ️ <b>Allaqachon mavjud:</b> <code>${text}</code>`, MAIN_KEYBOARD);
        userState = null;
        return;
    }
    
    if (userState === 'DEL_KEYWORD') {
        const kDel = await storage.delKeyword(text);
        await reply(kDel ? `🗑 <b>O'chirildi:</b> <code>${text}</code>` : `❌ <b>Topilmadi:</b> <code>${text}</code>`, MAIN_KEYBOARD);
        userState = null;
        return;
    }

    if (userState === 'ADD_CHANNEL') {
        const cAdded = await storage.addChannel(text);
        await reply(cAdded ? `✅ <b>Kanal qo'shildi:</b> ${text}` : `ℹ️ <b>Allaqachon mavjud:</b> ${text}`, MAIN_KEYBOARD);
        userState = null;
        return;
    }

    if (userState === 'DEL_CHANNEL') {
        const cDel = await storage.delChannel(text);
        await reply(cDel ? `🗑 <b>Kanal o'chirildi:</b> ${text}` : `❌ <b>Topilmadi:</b> ${text}`, MAIN_KEYBOARD);
        userState = null;
        return;
    }

    if (userState === 'ADD_STOPWORD') {
        const swAdded = await storage.addStopWord(text);
        await reply(swAdded ? `✅ <b>Stop-so'z qo'shildi:</b> <code>${escapeHtml(text)}</code>` : `ℹ️ <b>Allaqachon mavjud:</b> <code>${escapeHtml(text)}</code>`, MAIN_KEYBOARD);
        userState = null;
        return;
    }

    if (userState === 'DEL_STOPWORD') {
        const swDel = await storage.delStopWord(text);
        await reply(swDel ? `🗑 <b>Stop-so'z o'chirildi:</b> <code>${escapeHtml(text)}</code>` : `❌ <b>Topilmadi:</b> <code>${escapeHtml(text)}</code>`, MAIN_KEYBOARD);
        userState = null;
        return;
    }

    // Noma'lum buyruqlar
    await reply("❓ <b>Noma'lum buyruq yoki matn.</b>\nIltimos, pastdagi tugmalardan foydalaning.");
}

// Inline tugmalar (Callback Query) amallari
async function handleCallbackQuery(query) {
    const data = query.data;
    const queryId = query.id;
    const message = query.message;
    const messageId = message ? message.message_id : null;

    if (!data) return;

    // 1. ⭐ Saqlash
    if (data.startsWith('save_')) {
        const vacancyId = data.replace('save_', '');
        const vacancy = recentVacancies.get(vacancyId);

        if (vacancy) {
            if (vacancy.saved) {
                await request('answerCallbackQuery', {
                    callback_query_id: queryId,
                    text: "ℹ️ Bu vakansiya allaqachon saqlangan!",
                    show_alert: false
                });
                return;
            }

            await storage.addSavedVacancy(vacancy);
            vacancy.saved = true;

            await request('answerCallbackQuery', {
                callback_query_id: queryId,
                text: "⭐ Vakansiya saqlanganlar ro'yxatiga qo'shildi!",
                show_alert: false
            });

            // Tugmani yangilaymiz: "⭐ Saqlash" -> "✅ Saqlandi"
            if (message && message.reply_markup && message.reply_markup.inline_keyboard) {
                const newKeyboard = message.reply_markup.inline_keyboard.map(row => 
                    row.map(btn => {
                        if (btn.callback_data === data) {
                            return { text: "✅ Saqlandi", callback_data: `already_saved` };
                        }
                        return btn;
                    })
                );
                await request('editMessageReplyMarkup', {
                    chat_id: MY_CHAT_ID,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: newKeyboard }
                });
            }
        } else {
            await request('answerCallbackQuery', {
                callback_query_id: queryId,
                text: "⭐ Vakansiya saqlanganlar ro'yxatiga qo'shildi!",
                show_alert: false
            });
        }
        return;
    }

    if (data === 'already_saved') {
        await request('answerCallbackQuery', {
            callback_query_id: queryId,
            text: "✅ Ushbu vakansiya allaqachon saqlangan!",
            show_alert: false
        });
        return;
    }

    // 2. 🚫 Kanalni o'chirish
    if (data.startsWith('delch_')) {
        const vacancyId = data.replace('delch_', '');
        const vacancy = recentVacancies.get(vacancyId);

        if (vacancy) {
            const channelId = vacancy.channelIdentifier;
            const removed = await storage.delChannel(channelId);
            vacancy.channelDeleted = true;

            const alertText = removed
                ? `🚫 ${channelId} kanali kuzatuv ro'yxatidan o'chirildi!`
                : `ℹ️ ${channelId} allaqachon kuzatuv ro'yxatida yo'q.`;

            await request('answerCallbackQuery', {
                callback_query_id: queryId,
                text: alertText,
                show_alert: true
            });

            // Tugmani yangilaymiz: "🚫 Kanalni o'chirish" -> "❌ O'chirildi"
            if (message && message.reply_markup && message.reply_markup.inline_keyboard) {
                const newKeyboard = message.reply_markup.inline_keyboard.map(row => 
                    row.map(btn => {
                        if (btn.callback_data === data) {
                            return { text: "❌ O'chirildi", callback_data: `already_del` };
                        }
                        return btn;
                    })
                );
                await request('editMessageReplyMarkup', {
                    chat_id: MY_CHAT_ID,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: newKeyboard }
                });
            }
        } else {
            await request('answerCallbackQuery', {
                callback_query_id: queryId,
                text: "ℹ️ Kanal allaqachon o'chirilgan yoki topilmadi.",
                show_alert: true
            });
        }
        return;
    }

    if (data === 'already_del') {
        await request('answerCallbackQuery', {
            callback_query_id: queryId,
            text: "ℹ️ Bu kanal allaqachon kuzatuvdan o'chirilgan!",
            show_alert: false
        });
        return;
    }

    await request('answerCallbackQuery', { callback_query_id: queryId });
}

