/**
 * Vakansiya xabarlarini tozalash, formatlash va kontaktlarni ajratib olish moduli
 */

export function escapeHtml(text) {
    if (!text) return "";
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matn ichidagi kontaktlarni (Telegram username, telefon, email) aniqlash
 */
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

    // @username
    const atRegex = /(?:^|[\s,;:([<{/'"`])@([a-zA-Z0-9_]{4,32})\b/g;
    let match;
    while ((match = atRegex.exec(text)) !== null) {
        const raw = match[1].toLowerCase();
        if (!systemIgnore.has(raw) && (!cleanChannel || raw !== cleanChannel)) {
            tgUsernames.add(`@${match[1]}`);
        }
    }

    // t.me/username yoki telegram.me/username
    const linkRegex = /(?:https?:\/\/)?(?:t|telegram)\.me\/([a-zA-Z0-9_]{4,32})\b/gi;
    while ((match = linkRegex.exec(text)) !== null) {
        const handle = match[1];
        const raw = handle.toLowerCase();
        if (!systemIgnore.has(raw) && (!cleanChannel || raw !== cleanChannel) && !['c', 's'].includes(raw)) {
            tgUsernames.add(`@${handle}`);
        }
    }

    // 3. Telefon raqamlar (O'zbekiston standart formatlash + xalqaro)
    const phoneSet = new Set();
    const phoneDigitsSet = new Set();

    // O'zbekiston raqamlari (+998 yoki mahalliy 9 xonali)
    const uzRegex = /\b(?:\+?998)?[\s.-]?\(?(9[01345789]|33|88|71|77)\)?[\s.-]?(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})\b/g;
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

/**
 * Matndagi kalit so'zlarni ajratib ko'rsatish (HTML xavfsiz)
 */
export function highlightKeywords(text, keywords = []) {
    if (!text) return "";
    if (!keywords || keywords.length === 0) return escapeHtml(text);

    const sorted = [...keywords]
        .map(k => k.trim())
        .filter(k => k.length > 0)
        .sort((a, b) => b.length - a.length);

    if (sorted.length === 0) return escapeHtml(text);

    const combinedPattern = sorted.map(k => escapeRegex(k)).join('|');
    const regex = new RegExp(`(?<![a-zA-Z0-9_])(${combinedPattern})(?![a-zA-Z0-9_])`, 'gi');

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
 * E'lon xabarini tozalash va to'liq formatlash
 */
export function formatVacancyAlert({ channelName, text, link, keywords = [], channelIdentifier = null }) {
    // 1. Matnni ortiqcha bo'sh qatorlardan tozalash
    let cleanText = (text || '')
        .trim()
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n');

    // 2. Kontaktlarni ajratib olish
    const contacts = extractContacts(cleanText, channelIdentifier);

    // 3. Matn hajmini me'yorlash (Telegram 4096 cheklovini inobatga olib, matn uchun max 2800 belgi)
    let bodyText = cleanText;
    if (bodyText.length > 2800) {
        bodyText = bodyText.substring(0, 2800).trim() + '...\n<i>(Xabar uzun bo\'lgani uchun qisqartirildi)</i>';
    }

    // 4. Kalit so'zlarni ajratib ko'rsatish
    const highlightedBody = highlightKeywords(bodyText, keywords);

    // 5. Chiroyli va tartibli xabar shablonini yasash
    let msg = `🚨 <b>Yangi Vakansiya Topildi!</b>\n`;
    msg += `📌 <b>Kanal:</b> ${escapeHtml(channelName || channelIdentifier || 'Noma\'lum')}\n`;

    // Topilgan kalit so'zlar
    if (keywords && keywords.length > 0) {
        const kwBadges = keywords.map(k => `<code>${escapeHtml(k)}</code>`).join(' ');
        msg += `🎯 <b>Kalit so'zlar:</b> ${kwBadges}\n`;
    }

    // Alohida ajratilgan kontaktlar bloki
    const contactLines = [];
    if (contacts.telegram.length > 0) {
        contactLines.push(`• 👤 <b>Telegram:</b> ${contacts.telegram.join(', ')}`);
    }
    if (contacts.phones.length > 0) {
        contactLines.push(`• 📞 <b>Telefon:</b> ${contacts.phones.join(', ')}`);
    }
    if (contacts.emails.length > 0) {
        contactLines.push(`• ✉️ <b>Email:</b> ${contacts.emails.join(', ')}`);
    }

    if (contactLines.length > 0) {
        msg += `\n📞 <b>Kontaktlar:</b>\n${contactLines.join('\n')}\n`;
    }

    msg += `\n━━━━━━━━━━━━━━━━━━\n📝 <b>E'lon matni:</b>\n\n${highlightedBody}`;

    return {
        formattedText: msg,
        contacts,
        cleanText
    };
}
