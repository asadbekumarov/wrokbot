import { escapeHtml } from '../../utils/filter.js';
import {
    getUserProfile,
    upsertUserProfile,
    updateUserScope,
    updateUserGeminiKey,
    getUserState,
    setUserState,
    clearUserState,
    getUser
} from '../../database/db.js';
import { env } from '../../config/env.js';
import { INTERVIEW_QUESTIONS, compileProfileFromInterview } from '../../services/geminiService.js';

export function getProfileInlineKeyboard(userId, lang = 'uz') {
    const profile = getUserProfile(userId);

    const chIcon = profile.scope_channels ? '✅' : '❌';
    const grIcon = profile.scope_groups ? '✅' : '❌';
    const dmIcon = profile.scope_dms ? '✅' : '❌';
    const botIcon = profile.scope_bots ? '✅' : '❌';

    return {
        inline_keyboard: [
            [
                { text: "✏️ Profilni yozish", callback_data: "prof_edit_text" },
                { text: "🤖 AI bilan intervyu", callback_data: "prof_start_interview" }
            ],
            [
                { text: `${chIcon} Kanallar`, callback_data: "scope_toggle_channels" },
                { text: `${grIcon} Guruhlar`, callback_data: "scope_toggle_groups" }
            ],
            [
                { text: `${dmIcon} Shaxsiy (User)`, callback_data: "scope_toggle_dms" },
                { text: `${botIcon} Botlar`, callback_data: "scope_toggle_bots" }
            ],
            [
                { text: "🔑 Gemini API Kaliti", callback_data: "prof_set_gemini_key" }
            ],
            [
                { text: "🏠 Bosh menyu", callback_data: "menu_status" }
            ]
        ]
    };
}

export async function handleProfileCommand(bot, msg) {
    const userId = msg.from.id;
    await showUserProfile(bot, userId);
}

export async function showUserProfile(bot, userId, editMessageId = null) {
    const profile = getUserProfile(userId);
    const activeKey = profile.gemini_api_key || env.geminiApiKey;
    const hasKey = Boolean(activeKey);

    let text = `🧠 <b>Shaxsiy Profil va Gemini AI Sozlamalari:</b>\n\n`;

    if (profile.profile_text && profile.profile_text.trim()) {
        text += `📝 <b>Siz haqingizda (AI yo'riqnomasi):</b>\n<i>"${escapeHtml(profile.profile_text)}"</i>\n\n`;
    } else {
        text += `📝 <b>Siz haqingizda:</b>\n<i>Profil hali kiritilmagan. Bot sizni yaxshiroq bilishi uchun <b>"✏️ Profilni yozish"</b> yoki <b>"🤖 AI bilan intervyu"</b> tugmasini bosing!</i>\n\n`;
    }

    text += `🤖 <b>Gemini API Kaliti:</b> ${hasKey ? '🟢 Ulangan' : '🔴 Kiritilmagan (.env yoki bot orqali)'}\n\n`;
    text += `📡 <b>Monitoring qamrovi (qaysi chatlar tahlil qilinadi):</b>\n`;
    text += `• Kanallar: ${profile.scope_channels ? '🟢 Yoqilgan' : '🔴 O\'chirilgan'}\n`;
    text += `• Guruhlar: ${profile.scope_groups ? '🟢 Yoqilgan' : '🔴 O\'chirilgan'}\n`;
    text += `• Shaxsiy (User): ${profile.scope_dms ? '🟢 Yoqilgan' : '🔴 O\'chirilgan'}\n`;
    text += `• Botlar: ${profile.scope_bots ? '🟢 Yoqilgan' : '🔴 O\'chirilgan'}\n\n`;
    text += `💡 <i>Tugmalar orqali sozlamalarni o'zgartirishingiz mumkin:</i>`;

    const user = getUser(userId);
    const lang = user?.language || 'uz';
    const reply_markup = getProfileInlineKeyboard(userId, lang);

    if (editMessageId) {
        await bot.editMessageText(text, {
            chat_id: userId,
            message_id: editMessageId,
            parse_mode: 'HTML',
            reply_markup
        }).catch(() => {});
    } else {
        await bot.sendMessage(userId, text, {
            parse_mode: 'HTML',
            reply_markup
        });
    }
}

export async function handleProfileCallback(bot, query) {
    const userId = query.from.id;
    const data = query.data;
    const messageId = query.message?.message_id;

    await bot.answerCallbackQuery(query.id).catch(() => {});

    // Profil matnini qo'lda kiritish
    if (data === 'prof_edit_text') {
        setUserState(userId, 'AWAIT_PROFILE_TEXT', {});
        await bot.sendMessage(userId, `✍️ <b>O'zingiz haqingizda yozing:</b>\n\nKasbingiz, qiziqishlaringiz, Telegramda aynan qanday xabarlar sizga muhimligini batafsilroq tasvirlang.\n\n<i>Misol:</i>\n<code>Men tajribali Python dasturchiman. Menga freelans loyihalar, yaxshi maoshli vakansiyalar va yangi startaplar haqidagi xabarlar muhim. Reklama va mayda gaplar kerak emas.</code>\n\nBekor qilish: /cancel`, {
            parse_mode: 'HTML'
        });
        return;
    }

    // AI bilan intervyu boshlash
    if (data === 'prof_start_interview') {
        const user = getUser(userId);
        const lang = user?.language || 'uz';
        const questions = INTERVIEW_QUESTIONS[lang] || INTERVIEW_QUESTIONS.uz;

        setUserState(userId, 'AWAIT_INTERVIEW_ANSWER', {
            step: 0,
            answers: []
        });

        await bot.sendMessage(userId, `🤖 <b>AI Intervyu boshlandi!</b>\n\nSizni chuqur o'rganish va faqat kerakli xabarlarni saralash uchun 3 ta qisqa savol beraman.\n\n${questions[0]}\n\nBekor qilish uchun: /cancel`, {
            parse_mode: 'HTML'
        });
        return;
    }

    // Monitoring qamrovini yoqish/o'chirish
    if (data.startsWith('scope_toggle_')) {
        const scope = data.replace('scope_toggle_', '');
        const profile = getUserProfile(userId);
        const colMap = {
            channels: 'scope_channels',
            groups: 'scope_groups',
            dms: 'scope_dms',
            bots: 'scope_bots'
        };
        const col = colMap[scope];
        if (col) {
            const currentVal = profile[col];
            updateUserScope(userId, col, currentVal ? 0 : 1);
            await showUserProfile(bot, userId, messageId);
        }
        return;
    }

    // Gemini API kalitini kiritish
    if (data === 'prof_set_gemini_key') {
        setUserState(userId, 'AWAIT_GEMINI_KEY', {});
        await bot.sendMessage(userId, `🔑 <b>Google Gemini API kalitingizni yuboring:</b>\n\nKalitni olish: <a href="https://aistudio.google.com/app/apikey">Google AI Studio</a> saytidan bepul olishingiz mumkin.\n\nKalitni yuboring yoki bekor qilish uchun /cancel deb yozing:`, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
        return;
    }
}

/**
 * Profil va intervyu matnli kirituvlarini boshqarish
 */
export async function processProfileTextInput(bot, msg, userState) {
    const userId = msg.from.id;
    const text = msg.text.trim();
    const user = getUser(userId);
    const lang = user?.language || 'uz';

    if (text === '/cancel' || text.toLowerCase() === 'bekor qilish') {
        clearUserState(userId);
        await bot.sendMessage(userId, "❌ Amal bekor qilindi.", { parse_mode: 'HTML' });
        await showUserProfile(bot, userId);
        return true;
    }

    // 1. Profil matnini qo'lda kiritish
    if (userState.state === 'AWAIT_PROFILE_TEXT') {
        upsertUserProfile(userId, { profile_text: text });
        clearUserState(userId);
        await bot.sendMessage(userId, `✅ <b>Profilingiz muvaffaqiyatli saqlandi!</b>\n\nEndi bot ushbu ko'rsatmalaringiz asosida xabarlarni tahlil qiladi.`, {
            parse_mode: 'HTML'
        });
        await showUserProfile(bot, userId);
        return true;
    }

    // 2. Gemini API kalitini kiritish
    if (userState.state === 'AWAIT_GEMINI_KEY') {
        if (text.length < 20 || text.includes(' ')) {
            await bot.sendMessage(userId, `⚠️ Noto'g'ri API kaliti formati. Iltimos, to'g'ri kalitni kiriting yoki /cancel deb yozing:`);
            return true;
        }

        updateUserGeminiKey(userId, text);
        clearUserState(userId);
        await bot.sendMessage(userId, `🎉 <b>Gemini API kaliti muvaffaqiyatli saqlandi va ulandi!</b>`, {
            parse_mode: 'HTML'
        });
        await showUserProfile(bot, userId);
        return true;
    }

    // 3. AI Intervyu bosqichlari
    if (userState.state === 'AWAIT_INTERVIEW_ANSWER') {
        const stateData = userState.data || {};
        const step = stateData.step || 0;
        const answers = stateData.answers || [];
        answers.push(text);

        const questions = INTERVIEW_QUESTIONS[lang] || INTERVIEW_QUESTIONS.uz;

        if (step + 1 < questions.length) {
            // Keyingi savolga o'tamiz
            const nextStep = step + 1;
            setUserState(userId, 'AWAIT_INTERVIEW_ANSWER', {
                step: nextStep,
                answers
            });
            await bot.sendMessage(userId, questions[nextStep], { parse_mode: 'HTML' });
            return true;
        } else {
            // Intervyu yakunlandi, Gemini orqali profil shakllantiramiz
            await bot.sendMessage(userId, `⏳ <b>Javoblaringiz qabul qilindi!</b>\nGemini sizning javoblaringiz asosida shaxsiy profilingizni shakllantirmoqda...`, {
                parse_mode: 'HTML'
            });

            const profile = getUserProfile(userId);
            const apiKey = profile.gemini_api_key || env.geminiApiKey;

            let compiledProfile = '';
            if (apiKey) {
                compiledProfile = await compileProfileFromInterview({
                    apiKey,
                    answers,
                    language: lang
                });
            } else {
                compiledProfile = `Kasbi/Faoliyati: ${answers[0]}\nMuhim mavzular: ${answers[1]}\nKeraksiz/Shovqin: ${answers[2]}`;
            }

            upsertUserProfile(userId, {
                profile_text: compiledProfile,
                interview_step: 3,
                interview_data: answers
            });
            clearUserState(userId);

            await bot.sendMessage(userId, `🎉 <b>AI Profilingiz tayyor bo'ldi!</b>\n\n<i>"${escapeHtml(compiledProfile)}"</i>\n\nEndi xabarlar aynan shu mezonlar asosida saralanadi!`, {
                parse_mode: 'HTML'
            });
            await showUserProfile(bot, userId);
            return true;
        }
    }

    return false;
}
