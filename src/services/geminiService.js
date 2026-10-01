import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { logger } from '../utils/logger.js';

const CANDIDATE_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash'
];

/**
 * Universal Gemini API chaqiruvi (Model fallback va xatoliklar bilan)
 */
async function callGeminiApi({ apiKey, prompt, systemInstruction = '', responseSchema = null }) {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY taqdim etilmagan!');
    }

    let lastError = null;

    for (const model of CANDIDATE_MODELS) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            const body = {
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }]
                    }
                ],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 2048
                }
            };

            if (systemInstruction) {
                body.systemInstruction = {
                    parts: [{ text: systemInstruction }]
                };
            }

            if (responseSchema) {
                body.generationConfig.responseMimeType = 'application/json';
                body.generationConfig.responseSchema = responseSchema;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errText = await response.text();
                logger.warn('GEMINI_API', `Model ${model} so'rovi muvaffaqiyatsiz bo'ldi (${response.status}): ${errText}`);
                lastError = new Error(`Gemini API xatosi (${response.status}): ${errText}`);
                continue; // Keyingi modelni sinab ko'ramiz
            }

            const data = await response.json();
            const parts = data.candidates?.[0]?.content?.parts || [];

            // Thinking modellari yoki ko'p partli javoblar uchun matn qismini topamiz
            const textPart = parts.find(p => typeof p.text === 'string' && p.text.trim().length > 0)?.text;
            if (!textPart) {
                throw new Error('Gemini javobida matn topilmadi');
            }

            return textPart.trim();
        } catch (err) {
            lastError = err;
            logger.warn('GEMINI_API', `Model ${model} bilan ishlashda xato: ${err.message}`);
        }
    }

    throw lastError || new Error('Barcha Gemini modellari bilan bog\'lanish muvaffaqiyatsiz tugadi.');
}

/**
 * Xabarni Gemini yordamida tahlil qilish va saralash
 */
export async function analyzeMessageWithGemini({
    apiKey,
    userProfile = '',
    text,
    sourceInfo = {},
    language = 'uz'
}) {
    if (!text || text.trim().length < 5) {
        return null;
    }

    const defaultProfile = "Men IT sohasidagi mutaxassisman. Menga jiddiy ish takliflari, freelance loyihalar, mijozlar buyurtmalari, dasturlash va texnologiyalarga oid eng muhim yangiliklar qiziq. Oddiy shovqin, reklama, umumiy tabriklar, spam xabarlar muhim emas.";
    const profileToUse = userProfile && userProfile.trim().length > 10 ? userProfile.trim() : defaultProfile;

    const systemInstruction = `Siz Asadbek Umarov (Frontend Engineer, Freelance Developer, Telegram Bot & TMA Creator, "IT Undefined" brendi)ning shaxsiy Telegram AI tahlilchisisiz.
Asadbek Telegramdagi yuzlab xabarlarni o'qishga vaqti yo'q. Sizning vazifangiz — xabarlarni chuqur saralab, Asadbekka "Bunga vaqtimni sarflashim shartmi?" degan savolga aniq javob berishdir.

Asadbek profili, steki va qiziqishlari:
"""
${profileToUse}
"""

Tahlil va Baholash Qoidalari:
1. Relevance darajalari:
   - CRITICAL: To'g'ridan-to'g'ri ish/mijoz imkoniyati, shoshilinch taklif, Asadbekning steki (React, Next.js, TypeScript, TMA, Telegram bot) bo'yicha to'g'ridan-to'g'ri so'rov (Score: 9-10).
   - HIGH: Kuchli mos keluvchi loyiha/vakansiya, muhim texnologik yangilik (Next.js/React yangiliklari, Telegram Bot API updates), potentsial hamkorlik (Score: 7-8).
   - MEDIUM: Foydali amaliy ta'limiy manba, dasturlash yoki AI yangiliklari (Score: 5-6).
   - LOW: Umumiy yoki yuzaki dasturlash xabari (Score: 3-4).
   - IGNORE: Shovqin, SMM, Dizayn, Savdo, Backend-only, memlar, quruq salom-alik, spam, reklama (Score: 1-2).

2. Agar relevance_level 'CRITICAL', 'HIGH' yoki foydali 'MEDIUM' bo'lsa -> 'is_important': true deb belgilang.
3. Agar relevance_level 'LOW' yoki 'IGNORE' bo'lsa -> 'is_important': false deb belgilang.
4. 'is_urgent': agar darhol chora ko'rish, tezda javob yozish yoki qat'iy muddat talab etilsa true, aks holda false.
5. Xabarda tilga olinmagan ma'lumotlarni (maosh, muddat, lokatsiya) ASLO o'zingizdan to'qimang. Mavjud bo'lmasa null qilib qoldiring.
6. Til: Tabiiy o'zbek tilida (lotin alifbosida).

Qat'iy ravishda FAQAT quyidagi JSON formatida javob bering, hech qanday ortiqcha so'zsiz:
{
  "is_important": true/false,
  "priority": "HIGH | MEDIUM | LOW | IGNORE",
  "kim": "Xabar yuboruvchi shaxs, tashkilot yoki kanal nomi",
  "nima_boldi": "Nima bo'ldi (2-3 jumlada qisqa va faktik mazmun)",
  "nima_uchun_muhim": "Nima uchun aynan Asadbek uchun muhimligi",
  "sizdan_kerak": "Asadbekdan nima talab qilinishi (harakat/javob) yoki null",
  "deadline": "Agar muddat aytilgan bo'lsa yoki null",
  "original_excerpt": "Asl matndan eng muhim qisqa parcha",
  "category": "Job | Client | Freelance | Tech | Startup | English | Other",
  "importance_score": 1-10,
  "is_urgent": true/false
}`;

    const prompt = `Xabar ma'lumotlari:
Manba turi: ${sourceInfo.type || 'Chat'} (${sourceInfo.name || 'Noma\'lum'})
Xabar matni:
"""
${text}
"""`;

    try {
        const rawJson = await callGeminiApi({
            apiKey,
            prompt,
            systemInstruction
        });

        const cleaned = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(cleaned);
        return parsed;
    } catch (err) {
        logger.error('GEMINI_ANALYZE', `Xabar tahlilida xato: ${err.message}`);
        return null;
    }
}

/**
 * Muhim xabarlar bo'yicha yig'ma Smart Dayjest (Brifing) tayyorlash
 */
export async function generateDigestBriefing({
    apiKey,
    userProfile = '',
    messages = [],
    language = 'uz'
}) {
    if (!messages || messages.length === 0) {
        return null;
    }

    const systemInstruction = `Siz shaxsiy ijrochi AI kotibsiz. Sizning vazifangiz — foydalanuvchiga Telegramdagi eng muhim xabarlardan iborat yuqori darajadagi, qisqa va lo'nda BRİFİNG (Smart Digest) tayyorlab berish.

Format:
- Telegram HTML formatida bo'lsin (<b>, <i>, <code>, <a> teglari).
- Boshida umumiy vaziyat qisqacha 1 jumlada.
- Bo'limlar:
  🚨 <b>Shoshilinch va O'ta Muhimlar:</b> (agar bor bo'lsa)
  💼 <b>Loyiha va Takliflar:</b>
  💡 <b>Foydali Ma'lumotlar:</b>
- Har bir bandda manba nomi, xulosa va havola (agar mavjud bo'lsa) ko'rsatilsin.
- Tili: ${language === 'ru' ? 'Rus tili' : (language === 'en' ? 'Ingliz tili' : 'O\'zbek tili')}.`;

    const formattedList = messages.map((m, idx) => {
        return `[#${idx + 1}] Manba: ${m.source_type} - ${m.source_name || m.source_identifier}
Vaqti: ${m.created_at}
Ball: ${m.importance_score}/10 | Shoshilinch: ${m.is_urgent ? 'HA' : 'YO\'Q'}
Kategoriya: ${m.category}
AI Xulosasi: ${m.ai_summary}
Asl matn: ${m.original_text ? m.original_text.substring(0, 150) : ''}
Havola: ${m.link || ''}
-------------------`;
    }).join('\n');

    const prompt = `Foydalanuvchi profili:
${userProfile || 'IT mutaxassisi, loyihalar va muhim xabarlar'}

Quyidagi saralangan ${messages.length} ta xabardan foydalanuvchi uchun ajoyib ixcham Brifing tayyorlang:
${formattedList}`;

    try {
        const briefing = await callGeminiApi({
            apiKey,
            prompt,
            systemInstruction
        });

        return briefing;
    } catch (err) {
        logger.error('GEMINI_DIGEST', `Brifing yaratishda xato: ${err.message}`);
        return null;
    }
}

/**
 * Intervyu orqali profil shakllantirish uchun Gemini bilan savol-javob
 */
export const INTERVIEW_QUESTIONS = {
    uz: [
        "1️⃣ <b>Sizning asosiy kasbingiz, sohangiz yoki faoliyat yo'nalishingiz nima?</b>\n<i>(Masalan: Node.js/React dasturchi, Dizayner, Tadbirkor, Marketing mutaxassisi...)</i>",
        "2️⃣ <b>Telegramda qanday mavzudagi xabarlar siz uchun eng muhim va shoshilinch hisoblanadi?</b>\n<i>(Masalan: Yangi mijozlar, freelancerlik buyurtmalari, jiddiy vakansiyalar, texnologik yangiliklar...)</i>",
        "3️⃣ <b>Qanday xabarlarni umuman ko'rishni xohlamaysiz (shovqin deb hisoblaysiz)?</b>\n<i>(Masalan: O'zaro gap-so'zlar, kurslar reklamasi, arzimas memlar, spam...)</i>"
    ],
    ru: [
        "1️⃣ <b>Какова ваша основная профессия или сфера деятельности?</b>\n<i>(Например: Разработчик Node.js, Дизайнер, Предприниматель...)</i>",
        "2️⃣ <b>Какие сообщения в Telegram для вас наиболее важны и срочны?</b>\n<i>(Например: Заказы от клиентов, вакансии, срочные вопросы...)</i>",
        "3️⃣ <b>Какие сообщения вы считаете шумом и не хотите видеть?</b>\n<i>(Например: Спам, реклама курсов, мемы, пустые разговоры...)</i>"
    ],
    en: [
        "1️⃣ <b>What is your primary profession or field of activity?</b>\n<i>(e.g., Backend Developer, Designer, Project Manager...)</i>",
        "2️⃣ <b>What types of messages in Telegram are critical and urgent for you?</b>\n<i>(e.g., Client inquiries, freelance gigs, job offers, critical alerts...)</i>",
        "3️⃣ <b>What types of messages do you consider noise and want to ignore?</b>\n<i>(e.g., Spam, generic marketing, casual chit-chat, memes...)</i>"
    ]
};

/**
 * Intervyu javoblarini bitta ixcham, sifatli profil matniga jamlash
 */
export async function compileProfileFromInterview({ apiKey, answers = [], language = 'uz' }) {
    if (!answers || answers.length === 0) {
        return '';
    }

    const prompt = `Foydalanuvchi Telegram AI yordamchisini o'ziga moslashtirish uchun quyidagi savollarga javob berdi:
1. Kasbi/Faoliyati: ${answers[0] || 'Kiritilmagan'}
2. Muhim deb biladigan mavzulari: ${answers[1] || 'Kiritilmagan'}
3. Shovqin/Keraksiz deb biladigan narsalari: ${answers[2] || 'Kiritilmagan'}

Vazifa: Ushbu javoblardan foydalanib, sun'iy intellekt xabarlarni saralashi uchun qisqa, aniq va tushunarli FOYDALANUVCHI PROFILI (System Persona) matnini tuzib bering.
Format: 3-5 ta lo'nda jumla. Til: ${language === 'ru' ? 'Ruscha' : (language === 'en' ? 'Inglizcha' : 'O\'zbekcha')}.`;

    try {
        const profile = await callGeminiApi({
            apiKey,
            prompt,
            systemInstruction: "Siz shaxsiy profillarni tahlil qiluvchi va optimallashtiruvchi mutaxassisiz."
        });

        return profile.trim();
    } catch (err) {
        logger.error('GEMINI_PROFILE', `Profilni umumlashtirishda xato: ${err.message}`);
        // Fallback: javoblarni oddiy matn sifatida birlashtirish
        return `Kasb: ${answers[0] || ''}\nMuhim: ${answers[1] || ''}\nKeraksiz: ${answers[2] || ''}`;
    }
}
