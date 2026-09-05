import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { storage } from '../utils/storage.js';
import { sendAlert } from '../bot/nativeBot.js';
import { checkAntiCvStopWords } from '../utils/filter.js';
import { deduplicator } from '../utils/deduplicator.js';

let globalClient = null;

export async function scanAndAddChannels(keywordsArray) {
    if (!globalClient) return 0;
    let addedCount = 0;
    try {
        const dialogs = await globalClient.getDialogs({});
        for (const dialog of dialogs) {
            if (dialog.isChannel || dialog.isGroup) {
                const title = (dialog.title || '').toLowerCase();
                const username = (dialog.entity?.username || '').toLowerCase();
                const matches = keywordsArray.some(kw => title.includes(kw) || username.includes(kw));
                
                if (matches) {
                    const channelIdentifier = dialog.entity?.username ? `@${dialog.entity.username}` : dialog.entity?.id?.toString();
                    if (channelIdentifier) {
                        const added = await storage.addChannel(channelIdentifier);
                        if (added) addedCount++;
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error scanning channels:", e);
    }
    return addedCount;
}

export async function deepScanAndAddChannels(keywordsArray) {
    if (!globalClient) return 0;
    let addedCount = 0;
    try {
        const dialogs = await globalClient.getDialogs({});
        for (const dialog of dialogs) {
            if (dialog.isChannel || dialog.isGroup) {
                let matches = false;
                
                // Oldingi usul (nomidan qidirish) - bu har doim tez ishlaydi
                const title = (dialog.title || '').toLowerCase();
                const username = (dialog.entity?.username || '').toLowerCase();
                matches = keywordsArray.some(kw => title.includes(kw) || username.includes(kw));

                // Agar nomidan topilmasa, chuqur analiz qilamiz (xabarlarni o'qiymiz)
                if (!matches) {
                    try {
                        const messages = await globalClient.getMessages(dialog.entity, { limit: 15 });
                        const storageData = await storage.read();
                        for (const msg of messages) {
                            const rawMsg = msg.message || msg.text || '';
                            if (!rawMsg) continue;
                            const isStopWord = checkAntiCvStopWords(rawMsg, storageData.stopWords || []);
                            const lowerMsg = rawMsg.toLowerCase();
                            if (!isStopWord && keywordsArray.some(kw => lowerMsg.includes(kw))) {
                                matches = true;
                                break;
                            }
                        }
                    } catch (err) {
                        // Ba'zi kanallarni o'qish imkonsiz bo'lishi mumkin
                    }
                }
                
                if (matches) {
                    const channelIdentifier = dialog.entity?.username ? `@${dialog.entity.username}` : dialog.entity?.id?.toString();
                    if (channelIdentifier) {
                        const added = await storage.addChannel(channelIdentifier);
                        if (added) addedCount++;
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error deep scanning channels:", e);
    }
    return addedCount;
}

export async function startUserBot() {
    const apiId = parseInt(process.env.API_ID);
    const apiHash = process.env.API_HASH;
    const sessionString = process.env.SESSION || "";

    const stringSession = new StringSession(sessionString);
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });
    globalClient = client;

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

            // Xususiy yozishmalarni (shaxsiy chatlarni) o'tkazib yuboramiz
            if (chat.className === 'User') return;

            const msgTextLower = msgText.toLowerCase();
            const data = await storage.read();
            
            // Xabarda biz izlayotgan kalit so'zlardan biri bormi?
            const foundKeyword = data.keywords.find(kw => msgTextLower.includes(kw));

            // Agar umuman kalit so'z topilmasa, to'xtaymiz
            if (!foundKeyword) return;

            // Anti-CV va Stop-so'zlar filtri (Regex, case-insensitive, tinish belgilariga chidamli)
            const matchedStopWord = checkAntiCvStopWords(msgText, data.stopWords || []);
            if (matchedStopWord) {
                console.log(`[UserBot] 🛑 Stop-so'z ('${matchedStopWord}') aniqlandi (CV/Rezyume). Xabar rad etildi.`);
                return;
            }

            let channelIdStr = chat.username ? `@${chat.username}` : chat.id.toString();
            
            // Kanal data.json ichida bormi tekshiramiz (Case Insensitive)
            const isTargetChannel = data.channels.some(c => {
                if (c.startsWith('@') && chat.username) {
                    return c.toLowerCase() === `@${chat.username.toLowerCase()}`;
                }
                return c === chat.id.toString();
            });

            // Avtomatik KASHFIYOT funksiyasi (Real-time auto discovery)
            // Agar kalit so'z topilgan bo'lsa va bu kanal hali bazamizda yo'q bo'lsa, uni qo'shamiz
            if (!isTargetChannel) {
                await storage.addChannel(channelIdStr);
                console.log(`[UserBot] 🧠 Yangi ish kanali avto-kashf etildi va qo'shildi: ${channelIdStr}`);
                
                // Egasi uchun kichik bildirishnoma yuborib qo'yamiz (optional, lekin yaxshi)
                await sendAlert("🤖 Avto-Kashfiyot", `Yangi kanal bazangizga avtomatik qo'shildi!\nEndi bu kanal doimiy kuzatuvda bo'ladi.`, `https://t.me/${chat.username || 'c/'+chat.id}`);
            }

            // Dublikat xabarlarni filtrlash (oxirgi 1000 ta xabar xeshi bo'yicha)
            if (deduplicator.isDuplicate(msgText)) {
                console.log(`[UserBot] 🔁 Dublikat xabar aniqlandi (yuborilmadi). Kanal: ${channelIdStr}`);
                return;
            }

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
        } catch (error) {
            console.error("[UserBot] Xabarni qayta ishlashda xato:", error.message);
        }
        
    }, new NewMessage({}));
}
