import uz from './uz.js';
import ru from './ru.js';
import en from './en.js';

const locales = {
    uz,
    ru,
    en
};

export const SUPPORTED_LANGUAGES = ['uz', 'ru', 'en'];
export const DEFAULT_LANGUAGE = 'uz';

/**
 * Berilgan til va kalit bo'yicha matnni oladi va parametrlarni almashtiradi
 * @param {string} lang - 'uz', 'ru', 'en'
 * @param {string} key - Matn kaliti
 * @param {object} params - { name: 'Ali', count: 5 }
 * @returns {string}
 */
export function t(lang = DEFAULT_LANGUAGE, key, params = {}) {
    const selectedLang = locales[lang] ? lang : DEFAULT_LANGUAGE;
    let template = locales[selectedLang]?.[key] || locales[DEFAULT_LANGUAGE]?.[key] || key;

    for (const [placeholder, value] of Object.entries(params)) {
        template = template.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), String(value));
    }

    return template;
}

/**
 * Butun til lug'atini olish
 */
export function getLocale(lang = DEFAULT_LANGUAGE) {
    return locales[lang] || locales[DEFAULT_LANGUAGE];
}
