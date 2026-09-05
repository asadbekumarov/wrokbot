import 'dotenv/config';

const requiredKeys = ['API_ID', 'API_HASH', 'BOT_TOKEN'];

for (const key of requiredKeys) {
    if (!process.env[key]) {
        console.error(`\x1b[31m[CONFIG ERROR] Muhit o'zgaruvchisi topilmadi: ${key}\x1b[0m`);
        console.error(`Iltimos, .env faylida ${key} qiymatini to'ldiring (.env.example ga qarang).`);
        process.exit(1);
    }
}

// Shifrlash kaliti (agar bo'lmasa fallback default yoki xato)
let encryptionKey = process.env.ENCRYPTION_KEY;
if (!encryptionKey) {
    console.warn("\x1b[33m[CONFIG WARN] ENCRYPTION_KEY belgilanmagan! Avtomatik vaqtinchalik kalit ishlatiladi.\x1b[0m");
    encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}

export const env = Object.freeze({
    apiId: parseInt(process.env.API_ID, 10),
    apiHash: process.env.API_HASH.trim(),
    botToken: process.env.BOT_TOKEN.trim(),
    encryptionKey: encryptionKey.trim(),
    port: parseInt(process.env.PORT || '8080', 10),
    myChatId: process.env.MY_CHAT_ID ? process.env.MY_CHAT_ID.trim() : null
});
