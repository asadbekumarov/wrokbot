import crypto from 'node:crypto';
import { env } from '../config/env.js';

// -------------------------------------------------------------
// 1. XAVFSIZLIK: AES-256-GCM Shifrlash va Deshifrlash
// -------------------------------------------------------------

function getKeyBuffer(secret) {
    // Har qanday uzunlikdagi sirli kalitdan 32-baytlik qat'iy kalit yaratish
    return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Matnni (masalan, GramJS sessiya satrini) AES-256-GCM bilan shifrlaydi.
 * @param {string} text - Ochiq matn
 * @returns {string} - "iv:authTag:ciphertext" formatidagi string
 */
export function encryptSession(text) {
    if (!text) return '';
    const key = getKeyBuffer(env.encryptionKey);
    const iv = crypto.randomBytes(12); // GCM standarti 12 bayt
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Shifrlangan sessiya satrini ochadi.
 * @param {string} encryptedData - "iv:authTag:ciphertext"
 * @returns {string} - Asl matn
 */
export function decryptSession(encryptedData) {
    if (!encryptedData) return '';
    try {
        const parts = encryptedData.split(':');
        if (parts.length !== 3) return '';

        const [ivHex, authTagHex, cipherHex] = parts;
        const key = getKeyBuffer(env.encryptionKey);
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('[Crypto Error] Sessiyani deshifrlashda xato:', err.message);
        return '';
    }
}

// -------------------------------------------------------------
// 2. ANTI-DUPLICATE: SHA-256 Normalizatsiya va Xesh
// -------------------------------------------------------------

/**
 * Matndan barcha probellar, tinish belgilari va formatlashni olib tashlaydi
 */
export function normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .replace(/[\p{P}\p{S}\s]+/gu, '') // Unicode tinish belgilari va bo'shliqlar
        .trim();
}

/**
 * Matnning SHA-256 xeshini qaytaradi
 */
export function hashMessage(text) {
    const clean = normalizeText(text);
    if (!clean) return null;
    return crypto.createHash('sha256').update(clean).digest('hex');
}

// -------------------------------------------------------------
// 3. ANTI-CV & STOP-SO'ZLAR: 3 Tilda (UZ / RU / EN)
// -------------------------------------------------------------

export const DEFAULT_STOP_WORDS = [
    // UZBEK - Hashtaglar va Ish qidiruvchi iboralar
    "#rezyume", "#cv", "#xodim", "#ishkerak", "#ishqidiryapman",
    "ish qidiryapman", "ish qidirmoqdaman", "ish qidiryapti", "ish izlayapman", "ish izlayman",
    "ish joyi kerak", "ish kerak", "tajribam bor", "tajribaga egaman", "loyiha qidir",
    "xodim:", "rezyume:", "cv:",
    
    // RUSSIAN - Хэштеги и фразы соискателей
    "#резюме", "#ищуработу", "#соискатель", "#ищу_работу",
    "ищу работу", "ищет работу", "поиск работы", "готов к работе", "соискатель",
    "обо мне:", "мои навыки:", "опыт работы:", "ищу удаленку", "рассматриваю предложения",
    "резюме:",
    
    // ENGLISH - Hashtags and Job seeker phrases
    "#resume", "#cv", "#lookingforjob", "#opentowork", "#hireme",
    "looking for a job", "looking for work", "looking for position", "seeking a job",
    "seeking position", "hire me", "open to work", "my skills:", "about me:", "my resume:",
    "resume:"
];

// Ish beruvchi / Vakansiya e'lonlari iboralari (agar shu iboralar bo'lsa, xabar vakansiya hisoblanadi)
export const EMPLOYER_INDICATORS = [
    "rezyume yubor", "rezume yubor", "rezyumelarni yubor", "rezyume jo'nat", "rezyumengizni yubor",
    "cv yubor", "cv jo'nat", "ishga taklif", "vakansiya", "qidirmoqdamiz", "ishga olamiz", "jamoamizga",
    "talablar:", "vazifalar:", "shartlar:", "maosh:", "oylik:", "ish tartibi:", "taklif qilamiz",
    "резюме отправлять", "резюме присылать", "отправляйте резюме", "присылайте резюме",
    "отправить резюме", "ждём резюме", "требуется", "ищем", "вакансия", "в команду",
    "требования:", "обязанности:", "условия:", "зарплата:", "оплата:",
    "send resume", "send your resume", "send cv", "submit resume", "we are hiring", "hiring",
    "vacancy", "job opening", "requirements:", "responsibilities:", "salary:", "we offer:"
];

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matndan kalit so'zlarni aniq chegaralar bilan topadi (Lotin, Kirill, maxsus belgilar c++, c#, .net)
 * @param {string} text - Xabar matni
 * @param {Array<string>} keywords - Qidirilayotgan kalit so'zlar
 * @returns {Array<string>} - Mos kelgan kalit so'zlar ro'yxati
 */
export function findMatchedKeywords(text, keywords = []) {
    if (!text || typeof text !== 'string' || !Array.isArray(keywords) || keywords.length === 0) {
        return [];
    }

    const matched = [];
    for (const rawKw of keywords) {
        if (!rawKw || typeof rawKw !== 'string') continue;
        const clean = rawKw.trim();
        if (!clean) continue;

        try {
            const escaped = escapeRegex(clean).replace(/\s+/g, '[\\s\\-_]+');
            const regex = new RegExp(`(?<=^|[^\\p{L}\\p{N}#+])${escaped}(?=$|[^\\p{L}\\p{N}#+])`, 'iu');
            if (regex.test(text)) {
                matched.push(clean);
            }
        } catch {
            // Unicode property fallback
            const lowerText = text.toLowerCase();
            const lowerKw = clean.toLowerCase();
            const simpleRegex = new RegExp(`(?:^|[^a-zA-Z0-9\u0400-\u04FF#+])${escapeRegex(lowerKw)}(?:$|[^a-zA-Z0-9\u0400-\u04FF#+])`, 'i');
            if (simpleRegex.test(lowerText) || lowerText.includes(lowerKw)) {
                matched.push(clean);
            }
        }
    }

    return matched;
}

/**
 * Matnda rezyume yoki stop-so'z borligini tekshiradi
 * Agar xabar haqiqiy vakansiya e'loni bo'lsa (ish beruvchi "rezyume yuboring" deb yozgan bo'lsa), uni o'tkazadi
 * @param {string} text - Xabar matni
 * @param {Array<string>} userCustomStopWords - Foydalanuvchining shaxsiy stop-so'zlari
 * @returns {string|null} - Agar stop-so'z topilsa, o'sha so'z; aks holda null
 */
export function checkAntiCvStopWords(text, userCustomStopWords = []) {
    if (!text || typeof text !== 'string') return null;

    const lowerText = text.toLowerCase();

    // 1. Foydalanuvchining shaxsiy stop-so'zlari har doim qat'iy tekshiriladi
    if (Array.isArray(userCustomStopWords) && userCustomStopWords.length > 0) {
        for (const rawWord of userCustomStopWords) {
            if (!rawWord || typeof rawWord !== 'string') continue;
            const clean = rawWord.trim().toLowerCase();
            if (!clean) continue;

            const wordsPattern = clean.split(/\s+/).map(escapeRegex).join('[\\s\\-_]+');
            const regex = new RegExp(`(?:^|[^\\p{L}\\p{N}#+])${wordsPattern}(?:$|[^\\p{L}\\p{N}#+])`, 'iu');
            if (regex.test(lowerText) || lowerText.includes(clean)) {
                return clean;
            }
        }
    }

    // 2. Agar xabarda aniq ish beruvchi / vakansiya iboralari bo'lsa, standart rezyume filtri o'tkazib yuboradi
    const isEmployerPost = EMPLOYER_INDICATORS.some(ind => lowerText.includes(ind));

    // 3. Standart Anti-CV stop-so'zlarini tekshirish
    for (const rawWord of DEFAULT_STOP_WORDS) {
        if (!rawWord || typeof rawWord !== 'string') continue;
        const clean = rawWord.trim().toLowerCase();
        if (!clean) continue;

        // Agar ish beruvchi e'loni bo'lsa va stop-so'z hashtag bo'lmasa, uni to'xtatmaymiz
        if (isEmployerPost && !clean.startsWith('#') && !clean.includes('qidir') && !clean.includes('ищу')) {
            continue;
        }

        let regex;
        if (clean.startsWith('#')) {
            const base = escapeRegex(clean.slice(1));
            regex = new RegExp(`#${base}(?:$|[^\\p{L}\\p{N}])`, 'iu');
        } else if (clean === 'cv' || clean === 'cv:') {
            regex = /(?:^|[\s.,;!?()[\]"'])cv:(?:$|[\s.,;!?()[\]"'])/i;
        } else {
            const wordsPattern = clean.split(/\s+/).map(escapeRegex).join('[\\s\\-_]+');
            regex = new RegExp(`(?:^|[^\\p{L}\\p{N}#+])${wordsPattern}(?:$|[^\\p{L}\\p{N}#+])`, 'iu');
        }

        if (regex.test(lowerText)) {
            return clean;
        }
    }

    return null;
}

// -------------------------------------------------------------
// 4. KONTAKTLARNI AJRATISH: Telegram, Telefon, Email
// -------------------------------------------------------------

export function extractContacts(text, currentChannelId = null) {
    if (!text || typeof text !== 'string') {
        return { telegram: [], phones: [], emails: [] };
    }

    const cleanChannel = currentChannelId ? currentChannelId.replace(/^@/, '').toLowerCase() : null;

    // 1. Email manzillar
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const rawEmails = text.match(emailRegex) || [];
    const emails = [...new Set(rawEmails.map(e => e.toLowerCase().trim()))];

    // 2. Telegram username / linklar
    const tgUsernames = new Set();
    const systemIgnore = new Set([
        'joinchat', 'share', 'channel', 'bot', 'admin', 'addstickers',
        'addtheme', 'setlanguage', 'here', 'public', 'telegram'
    ]);

    const atRegex = /(?:^|[\s,;:([<{/'"`])@([a-zA-Z0-9_]{4,32})\b/g;
    let match;
    while ((match = atRegex.exec(text)) !== null) {
        const raw = match[1].toLowerCase();
        if (!systemIgnore.has(raw) && (!cleanChannel || raw !== cleanChannel)) {
            tgUsernames.add(`@${match[1]}`);
        }
    }

    const linkRegex = /(?:https?:\/\/)?(?:t|telegram)\.me\/([a-zA-Z0-9_]{4,32})\b/gi;
    while ((match = linkRegex.exec(text)) !== null) {
        const handle = match[1];
        const raw = handle.toLowerCase();
        if (!systemIgnore.has(raw) && (!cleanChannel || raw !== cleanChannel) && !['c', 's'].includes(raw)) {
            tgUsernames.add(`@${handle}`);
        }
    }

    // 3. Telefon raqamlari (barcha O'zbekiston prefikslari: 90-99, 33, 88, 71, 77, 78, 50, 55, 20)
    const phoneSet = new Set();
    const phoneDigitsSet = new Set();

    const uzRegex = /\b(?:\+?998)?[\s.-]?\(?(9[01345789]|33|88|71|77|78|50|55|20)\)?[\s.-]?(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})\b/g;
    while ((match = uzRegex.exec(text)) !== null) {
        const digits = `998${match[1]}${match[2]}${match[3]}${match[4]}`;
        if (!phoneDigitsSet.has(digits)) {
            phoneDigitsSet.add(digits);
            phoneSet.add(`+998 (${match[1]}) ${match[2]}-${match[3]}-${match[4]}`);
        }
    }

    // Boshqa xalqaro raqamlar
    const intlRegex = /\+(?!998)\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{0,4}/g;
    const intlMatches = text.match(intlRegex) || [];
    for (const p of intlMatches) {
        const digits = p.replace(/\D/g, '');
        if (digits.length >= 8 && digits.length <= 15 && !phoneDigitsSet.has(digits)) {
            phoneDigitsSet.add(digits);
            phoneSet.add(p.trim());
        }
    }

    return {
        telegram: Array.from(tgUsernames),
        emails,
        phones: Array.from(phoneSet)
    };
}

// -------------------------------------------------------------
// 5. HTML FORMATLASH VA KALIT SO'ZLARNI AJRATIB KO'RSATISH
// -------------------------------------------------------------

export function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function highlightKeywords(text, keywords = []) {
    if (!text) return '';
    if (!keywords || keywords.length === 0) return escapeHtml(text);

    const sorted = [...keywords]
        .map(k => k.trim())
        .filter(k => k.length > 0)
        .sort((a, b) => b.length - a.length);

    if (sorted.length === 0) return escapeHtml(text);

    const combinedPattern = sorted.map(k => escapeRegex(k).replace(/\s+/g, '[\\s\\-_]+')).join('|');
    const regex = new RegExp(`(?<=^|[^\\p{L}\\p{N}#+])(${combinedPattern})(?=$|[^\\p{L}\\p{N}#+])`, 'giu');

    let lastIndex = 0;
    let result = '';
    let match;

    while ((match = regex.exec(text)) !== null) {
        result += escapeHtml(text.substring(lastIndex, match.index));
        result += `<b><u>${escapeHtml(match[0])}</u></b>`;
        lastIndex = regex.lastIndex;
    }
    result += escapeHtml(text.substring(lastIndex));
    return result;
}

/**
 * Vakansiya xabarini Telegram HTML xabariga formatlaydi
 */
export function formatVacancyAlert({ channelName, text, link, keywords = [], channelIdentifier = null, langStrings }) {
    let cleanText = (text || '')
        .trim()
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n');

    const contacts = extractContacts(cleanText, channelIdentifier);

    // Telegram matn cheklovi (4096 belgi), 2500 belgigacha qisqartirish
    let bodyText = cleanText;
    if (bodyText.length > 2500) {
        bodyText = bodyText.substring(0, 2500).trim() + `...\n<i>(${langStrings?.text_truncated || 'Xabar qisqartirildi'})</i>`;
    }

    const highlightedBody = highlightKeywords(bodyText, keywords);

    let msg = `🚨 <b>${langStrings?.alert_title || 'Yangi Vakansiya Topildi!'}</b>\n`;
    msg += `📌 <b>${langStrings?.channel_label || 'Kanal'}:</b> ${escapeHtml(channelName || channelIdentifier || 'Noma\'lum')}\n`;

    if (keywords && keywords.length > 0) {
        const kwBadges = keywords.map(k => `<code>${escapeHtml(k)}</code>`).join(' ');
        msg += `🎯 <b>${langStrings?.keywords_label || 'Kalit so\'zlar'}:</b> ${kwBadges}\n`;
    }

    const contactLines = [];
    if (contacts.telegram.length > 0) {
        contactLines.push(`• 👤 <b>Telegram:</b> ${contacts.telegram.join(', ')}`);
    }
    if (contacts.phones.length > 0) {
        contactLines.push(`• 📞 <b>${langStrings?.phone_label || 'Telefon'}:</b> ${contacts.phones.join(', ')}`);
    }
    if (contacts.emails.length > 0) {
        contactLines.push(`• ✉️ <b>Email:</b> ${contacts.emails.join(', ')}`);
    }

    if (contactLines.length > 0) {
        msg += `\n📞 <b>${langStrings?.contacts_label || 'Kontaktlar'}:</b>\n${contactLines.join('\n')}\n`;
    }

    msg += `\n━━━━━━━━━━━━━━━━━━\n📝 <b>${langStrings?.body_label || 'E\'lon matni'}:</b>\n\n${highlightedBody}`;

    return {
        formattedText: msg,
        contacts,
        cleanText
    };
}
