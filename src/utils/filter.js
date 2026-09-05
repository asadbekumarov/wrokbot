/**
 * Anti-CV va Stop-so'zlarni Regex orqali chuqur tekshirish moduli
 */

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matnni berilgan stop-so'zlar ro'yxatiga nisbatan tekshiradi.
 * Case-insensitive (/i), tinish belgilariga chidamli va hashtag/alohida so'zlarni qamrab oladi.
 * 
 * @param {string} text - Tekshiriluvchi xabar matni
 * @param {Array<string>} stopWords - Stop-so'zlar ro'yxati
 * @returns {string|null} - Agar stop-so'z topilsa o'sha so'z qaytariladi, aks holda null
 */
export function checkAntiCvStopWords(text, stopWords = []) {
    if (!text || typeof text !== 'string') return null;

    // 1. Matnni to'liq kichik harflarga (lowerCase) o'tkazamiz
    const lowerText = text.toLowerCase();

    for (const rawWord of stopWords) {
        if (!rawWord || typeof rawWord !== 'string') continue;
        const cleanWord = rawWord.trim().toLowerCase();
        if (!cleanWord) continue;

        let regex;

        // Hashtag bilan kiritilgan so'zlar (masalan: #xodim, #rezyume, #cv)
        // Ham hashtag bilan, ham alohida so'z sifatida tekshiriladi
        if (cleanWord.startsWith('#')) {
            const base = escapeRegex(cleanWord.slice(1));
            regex = new RegExp(`(?:#|\\b)${base}(?:\\b|[:\\s.,;!?()[\\]"']|$)`, 'i');
        } 
        // Qisqa so'z: "cv" (boshqa so'zlar ichida, masalan "opencv"da noto'g'ri ishlab ketmasligi uchun \b kerak)
        else if (cleanWord === 'cv') {
            regex = /(?:#|\b)cv(?:\b|[:\s.,;!?()[\\]"']|$)/i;
        } 
        // "rezyume" yoki "резюме" (yolg'iz, ikki nuqta bilan yoki hashtag bilan)
        else if (cleanWord === 'rezyume' || cleanWord === 'резюме') {
            regex = new RegExp(`(?:#|\\b)${escapeRegex(cleanWord)}(?:\\b|[:\\s.,;!?()[\\]"']|$)`, 'i');
        } 
        // Ko'p so'zli iboralar (masalan: "ish qidir", "tajribam bor", "ish joyi kerak", "loyiha qidir")
        else {
            const wordsPattern = cleanWord
                .split(/\s+/)
                .map(escapeRegex)
                .join('[\\s\\-_]+');
            regex = new RegExp(`(?:^|[\\s\\-_.,:;!?()[\\]"'])${wordsPattern}`, 'i');
        }

        if (regex.test(lowerText)) {
            return cleanWord;
        }
    }

    return null;
}
