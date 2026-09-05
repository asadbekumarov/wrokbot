import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/**
 * Dublikat xabarlarni filtrlash klassi
 * - Xabar matnini tozalab (bo'shliqlar, tinish belgilarini olib tashlab) xeshini oladi
 * - Oxirgi 1000 ta xabarning xeshini saqlaydi (FIFO - First In, First Out)
 */
class MessageDeduplicator {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.hashes = new Set();
        this.queue = [];
        this.cacheFile = path.join(process.cwd(), 'hashes.json');
        this.loadCache();
    }

    /**
     * Matndan barcha bo'shliqlar, tinish belgilari va maxsus belgilarni olib tashlaydi
     */
    normalize(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .toLowerCase()
            // Barcha tinish belgilari (\p{P}), simvollar (\p{S}) va bo'shliqlarni (\s) olib tashlash
            .replace(/[\p{P}\p{S}\s]+/gu, '');
    }

    /**
     * Tozalangan matnning MD5 xeshini hisoblash
     */
    getHash(text) {
        const cleaned = this.normalize(text);
        if (!cleaned) return null;
        return crypto.createHash('md5').update(cleaned).digest('hex');
    }

    /**
     * Xabar dublikat ekanligini tekshirish
     * @param {string} text - Xabar matni
     * @returns {boolean} - true: agar allaqachon mavjud bo'lsa (dublikat), false: yangi bo'lsa
     */
    isDuplicate(text) {
        const hash = this.getHash(text);
        if (!hash) return false;

        // Agar xesh allaqachon mavjud bo'lsa -> Dublikat
        if (this.hashes.has(hash)) {
            return true;
        }

        // Yangi xeshni qo'shamiz
        this.hashes.add(hash);
        this.queue.push(hash);

        // 1000 tadan oshib ketganda eng eskisini o'chiramiz
        if (this.queue.length > this.maxSize) {
            const oldestHash = this.queue.shift();
            this.hashes.delete(oldestHash);
        }

        // Keshni xotiraga/faylga sinxronlashtirish (async, botni to'xtatmaydi)
        this.saveCache().catch(() => {});

        return false;
    }

    async loadCache() {
        try {
            const data = await fs.readFile(this.cacheFile, 'utf-8');
            const arr = JSON.parse(data);
            if (Array.isArray(arr)) {
                this.queue = arr.slice(-this.maxSize);
                this.hashes = new Set(this.queue);
            }
        } catch {
            // Fayl bo'lmasa yoki xato bo'lsa in-memory davom etaveradi
        }
    }

    async saveCache() {
        try {
            await fs.writeFile(this.cacheFile, JSON.stringify(this.queue), 'utf-8');
        } catch {
            // Xatolik bo'lsa e'tiborsiz qoldiramiz
        }
    }
}

export const deduplicator = new MessageDeduplicator(1000);
