import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { storage } from '../utils/storage.js';
import { sendAlert } from '../bot/nativeBot.js';

export async function startUserBot() {
    const apiId = parseInt(process.env.API_ID);
    const apiHash = process.env.API_HASH;
    const sessionString = process.env.SESSION || "";

    const stringSession = new StringSession(sessionString);
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    const rl = readline.createInterface({ input, output });

    // Avtorizatsiya jarayoni (faqat birinchi marta kiritiladi)
    await client.start({
        phoneNumber: async () => await rl.question("Telefon raqamingiz (masalan, +998901234567): "),
        password: async () => await rl.question("2FA parolingiz (agar bo'lsa): "),
        phoneCode: async () => await rl.question("Telegramdan kelgan kodni kiriting: "),
        onError: (err) => console.log(err),
    });

    rl.close();
    console.log("[UserBot] Tizimga ulandi!");
    
    // Agar sessiya bo'sh bo'lgan bo'lsa, konsolga chiqarib beramiz
    if (!sessionString) {
        console.log("==========================================");
        console.log("Diqqat! Quyidagi SESSION kodini .env fayliga saqlab qo'ying:");
        console.log(client.session.save());
        console.log("==========================================");
    }

    client.addEventHandler(async (event) => {
        const message = event.message;
        const msgText = message.message || message.text;
        if (!message || !msgText) return;

        try {
            const chat = await message.getChat();
            if (!chat) return;

            let channelIdStr = chat.username ? `@${chat.username}` : chat.id.toString();

            const data = await storage.read();
            
            // Kanal data.json ichida bormi tekshiramiz (Case Insensitive)
            const isTargetChannel = data.channels.some(c => {
                if (c.startsWith('@') && chat.username) {
                    return c.toLowerCase() === `@${chat.username.toLowerCase()}`;
                }
                return c === chat.id.toString();
            });

            if (!isTargetChannel) return;

            const msgTextLower = msgText.toLowerCase();
            
            // Kalit so'z borligini tekshiramiz
            const foundKeyword = data.keywords.find(kw => msgTextLower.includes(kw));

            if (foundKeyword) {
                console.log(`[UserBot] Keyword '${foundKeyword}' topildi. Kanal: ${channelIdStr}`);
                
                // Havolani (linkni) yig'amiz
                let link = "";
                if (chat.username) {
                    link = `https://t.me/${chat.username}/${message.id}`;
                } else {
                    // Yopiq kanallar uchun (-100 dan boshlanadigan ID qismini olib tashlaymiz)
                    const realId = chat.id.toString().replace('-100', '');
                    link = `https://t.me/c/${realId}/${message.id}`;
                }
                
                const channelName = chat.title || channelIdStr;
                await sendAlert(channelName, msgText, link);
            }
        } catch (error) {
            console.error("[UserBot] Xabarni qayta ishlashda xato:", error.message);
        }
        
    }, new NewMessage({}));
}
