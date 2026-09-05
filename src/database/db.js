import Database from 'better-sqlite3';
import path from 'node:path';
import { logger } from '../utils/logger.js';

const dbPath = path.resolve(process.cwd(), 'workbot.db');
let db = null;

export function initDatabase() {
    if (db) return db;

    try {
        db = new Database(dbPath, {
            // verbose: process.env.NODE_ENV === 'development' ? console.log : null
        });

        // AlwaysData RAM va I/O optimallashtirish (Low Memory Footprint)
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('temp_store = MEMORY');
        db.pragma('cache_size = -2000'); // ~2MB RAM kesh
        db.pragma('mmap_size = 10485760'); // 10MB mmap

        // 1. Foydalanuvchilar jadvali
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                telegram_id INTEGER PRIMARY KEY,
                phone TEXT,
                session_data TEXT,
                is_active INTEGER DEFAULT 1,
                language TEXT DEFAULT 'uz',
                created_at TEXT DEFAULT (datetime('now'))
            );
        `);

        // 2. Kalit so'zlar jadvali
        db.exec(`
            CREATE TABLE IF NOT EXISTS keywords (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                keyword TEXT NOT NULL,
                UNIQUE(user_id, keyword),
                FOREIGN KEY(user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_kw_user ON keywords(user_id);
        `);

        // 3. Stop-so'zlar (Anti-CV) jadvali
        db.exec(`
            CREATE TABLE IF NOT EXISTS stop_words (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                word TEXT NOT NULL,
                UNIQUE(user_id, word),
                FOREIGN KEY(user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_sw_user ON stop_words(user_id);
        `);

        // 4. Dublikat xabarlar xeshi (Anti-Duplicate)
        db.exec(`
            CREATE TABLE IF NOT EXISTS message_hashes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                hash TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_hashes_user_hash ON message_hashes(user_id, hash);
        `);

        // 5. Saqlangan vakansiyalar
        db.exec(`
            CREATE TABLE IF NOT EXISTS saved_vacancies (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                channel_name TEXT,
                text TEXT,
                link TEXT,
                channel_id TEXT,
                matched_keywords TEXT,
                contacts TEXT,
                saved_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_vacancies(user_id);
        `);

        // 6. Bot FSM (Finite State Machine) holatlari
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_states (
                user_id INTEGER PRIMARY KEY,
                state TEXT,
                data TEXT,
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
            );
        `);

        logger.info('DATABASE', 'SQLite (WAL) bazasi muvaffaqiyatli ishga tushirildi');
        migrateLegacyData();
        return db;
    } catch (err) {
        logger.error('DATABASE', 'Bazani initsializatsiya qilishda xato:', err);
        throw err;
    }
}

function migrateLegacyData() {
    try {
        const myChatId = process.env.MY_CHAT_ID ? parseInt(process.env.MY_CHAT_ID, 10) : null;
        const legacySession = process.env.SESSION;

        if (myChatId) {
            const existing = getUser(myChatId);
            if (!existing && legacySession) {
                // Dinamik tarzda shifrlash
                import('../utils/filter.js').then(({ encryptSession }) => {
                    const enc = encryptSession(legacySession);
                    upsertUser(myChatId, null, enc, 'uz');
                    logger.info('DATABASE', `Eski foydalanuvchi (${myChatId}) sessiyasi muvaffaqiyatli SQLite ga ko'chirildi.`);
                }).catch(() => {});
            }

            // data.json dan kalit so'zlarni ko'chirish
            import('node:fs').then(fs => {
                const dataJsonPath = path.resolve(process.cwd(), 'data.json');
                if (fs.existsSync(dataJsonPath)) {
                    const raw = fs.readFileSync(dataJsonPath, 'utf8');
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed.keywords)) {
                        let kwCount = 0;
                        for (const kw of parsed.keywords) {
                            if (addKeyword(myChatId, kw)) kwCount++;
                        }
                        if (kwCount > 0) {
                            logger.info('DATABASE', `${kwCount} ta kalit so'z data.json dan SQLite ga ko'chirildi.`);
                        }
                    }
                    if (Array.isArray(parsed.stopWords)) {
                        for (const sw of parsed.stopWords) {
                            addStopWord(myChatId, sw);
                        }
                    }
                }
            }).catch(() => {});
        }
    } catch (err) {
        logger.warn('DATABASE', `Migratsiya ogohlantirishi: ${err.message}`);
    }
}

export function getDb() {
    if (!db) return initDatabase();
    return db;
}

// -------------------------------------------------------------
// USER OPERATIONS
// -------------------------------------------------------------

export function getUser(telegramId) {
    const database = getDb();
    return database.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

export function upsertUser(telegramId, phone = null, sessionData = null, language = 'uz') {
    const database = getDb();
    const existing = getUser(telegramId);
    if (existing) {
        database.prepare(`
            UPDATE users 
            SET phone = COALESCE(?, phone), 
                session_data = COALESCE(?, session_data), 
                language = COALESCE(?, language),
                is_active = 1
            WHERE telegram_id = ?
        `).run(phone, sessionData, language, telegramId);
    } else {
        database.prepare(`
            INSERT INTO users (telegram_id, phone, session_data, is_active, language)
            VALUES (?, ?, ?, 1, ?)
        `).run(telegramId, phone, sessionData, language);
    }
    return getUser(telegramId);
}

export function updateUserLanguage(telegramId, language) {
    const database = getDb();
    database.prepare('UPDATE users SET language = ? WHERE telegram_id = ?').run(language, telegramId);
}

export function updateUserSession(telegramId, sessionData, phone = null) {
    const database = getDb();
    database.prepare(`
        UPDATE users 
        SET session_data = ?, phone = COALESCE(?, phone), is_active = 1 
        WHERE telegram_id = ?
    `).run(sessionData, phone, telegramId);
}

export function deleteUserSession(telegramId) {
    const database = getDb();
    database.prepare('UPDATE users SET session_data = NULL, is_active = 0 WHERE telegram_id = ?').run(telegramId);
}

export function setUserActive(telegramId, isActive) {
    const database = getDb();
    database.prepare('UPDATE users SET is_active = ? WHERE telegram_id = ?').run(isActive ? 1 : 0, telegramId);
}

export function getAllActiveUsers() {
    const database = getDb();
    return database.prepare("SELECT * FROM users WHERE is_active = 1 AND session_data IS NOT NULL AND session_data != ''").all();
}

// -------------------------------------------------------------
// KEYWORDS OPERATIONS
// -------------------------------------------------------------

export function getKeywords(userId) {
    const database = getDb();
    const rows = database.prepare('SELECT keyword FROM keywords WHERE user_id = ? ORDER BY keyword ASC').all(userId);
    return rows.map(r => r.keyword);
}

export function addKeyword(userId, keyword) {
    const database = getDb();
    const clean = keyword.trim().toLowerCase();
    if (!clean) return false;
    try {
        database.prepare('INSERT INTO keywords (user_id, keyword) VALUES (?, ?)').run(userId, clean);
        return true;
    } catch {
        return false; // UNIQUE constraint failed (allaqachon bor)
    }
}

export function deleteKeyword(userId, keyword) {
    const database = getDb();
    const clean = keyword.trim().toLowerCase();
    const info = database.prepare('DELETE FROM keywords WHERE user_id = ? AND keyword = ?').run(userId, clean);
    return info.changes > 0;
}

export function clearKeywords(userId) {
    const database = getDb();
    database.prepare('DELETE FROM keywords WHERE user_id = ?').run(userId);
}

// -------------------------------------------------------------
// STOP-WORDS OPERATIONS
// -------------------------------------------------------------

export function getStopWords(userId) {
    const database = getDb();
    const rows = database.prepare('SELECT word FROM stop_words WHERE user_id = ? ORDER BY word ASC').all(userId);
    return rows.map(r => r.word);
}

export function addStopWord(userId, word) {
    const database = getDb();
    const clean = word.trim().toLowerCase();
    if (!clean) return false;
    try {
        database.prepare('INSERT INTO stop_words (user_id, word) VALUES (?, ?)').run(userId, clean);
        return true;
    } catch {
        return false;
    }
}

export function deleteStopWord(userId, word) {
    const database = getDb();
    const clean = word.trim().toLowerCase();
    const info = database.prepare('DELETE FROM stop_words WHERE user_id = ? AND word = ?').run(userId, clean);
    return info.changes > 0;
}

// -------------------------------------------------------------
// ANTI-DUPLICATE OPERATIONS (SHA-256 HASH)
// -------------------------------------------------------------

export function isDuplicateHash(userId, hash) {
    const database = getDb();
    const row = database.prepare('SELECT 1 FROM message_hashes WHERE user_id = ? AND hash = ? LIMIT 1').get(userId, hash);
    return Boolean(row);
}

export function addMessageHash(userId, hash, maxKeep = 800) {
    const database = getDb();
    database.prepare('INSERT INTO message_hashes (user_id, hash) VALUES (?, ?)').run(userId, hash);

    // AlwaysData RAM va disk hajmini tejash: har 100 ta yozuvda eskilarni tozalash
    if (Math.random() < 0.05) {
        database.prepare(`
            DELETE FROM message_hashes 
            WHERE user_id = ? AND id NOT IN (
                SELECT id FROM message_hashes 
                WHERE user_id = ? 
                ORDER BY id DESC 
                LIMIT ?
            )
        `).run(userId, userId, maxKeep);
    }
}

// -------------------------------------------------------------
// SAVED VACANCIES OPERATIONS
// -------------------------------------------------------------

export function saveVacancy(userId, vacancy) {
    const database = getDb();
    try {
        database.prepare(`
            INSERT INTO saved_vacancies (id, user_id, channel_name, text, link, channel_id, matched_keywords, contacts, saved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
            vacancy.id,
            userId,
            vacancy.channelName || '',
            vacancy.text || '',
            vacancy.link || '',
            vacancy.channelIdentifier || '',
            JSON.stringify(vacancy.matchedKeywords || []),
            JSON.stringify(vacancy.contacts || {}),
        );
        return true;
    } catch {
        return false;
    }
}

export function isVacancySaved(userId, id) {
    const database = getDb();
    const row = database.prepare('SELECT 1 FROM saved_vacancies WHERE user_id = ? AND id = ? LIMIT 1').get(userId, id);
    return Boolean(row);
}

export function getSavedVacancies(userId, limit = 5, offset = 0) {
    const database = getDb();
    const rows = database.prepare(`
        SELECT * FROM saved_vacancies 
        WHERE user_id = ? 
        ORDER BY saved_at DESC 
        LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    return rows.map(r => ({
        ...r,
        matchedKeywords: JSON.parse(r.matched_keywords || '[]'),
        contacts: JSON.parse(r.contacts || '{}')
    }));
}

export function getSavedVacanciesCount(userId) {
    const database = getDb();
    const row = database.prepare('SELECT COUNT(*) as count FROM saved_vacancies WHERE user_id = ?').get(userId);
    return row?.count || 0;
}

export function deleteSavedVacancy(userId, id) {
    const database = getDb();
    const info = database.prepare('DELETE FROM saved_vacancies WHERE user_id = ? AND id = ?').run(userId, id);
    return info.changes > 0;
}

export function clearSavedVacancies(userId) {
    const database = getDb();
    database.prepare('DELETE FROM saved_vacancies WHERE user_id = ?').run(userId);
}

// -------------------------------------------------------------
// FSM USER STATE OPERATIONS
// -------------------------------------------------------------

export function setUserState(userId, state, data = {}) {
    const database = getDb();
    database.prepare(`
        INSERT INTO user_states (user_id, state, data, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
            state = excluded.state,
            data = excluded.data,
            updated_at = datetime('now')
    `).run(userId, state, JSON.stringify(data));
}

export function getUserState(userId) {
    const database = getDb();
    const row = database.prepare('SELECT state, data FROM user_states WHERE user_id = ?').get(userId);
    if (!row) return { state: null, data: {} };
    return {
        state: row.state,
        data: row.data ? JSON.parse(row.data) : {}
    };
}

export function clearUserState(userId) {
    const database = getDb();
    database.prepare('DELETE FROM user_states WHERE user_id = ?').run(userId);
}

// -------------------------------------------------------------
// CLOSE / CLEANUP
// -------------------------------------------------------------

export function closeDatabase() {
    if (db) {
        try {
            db.close();
            logger.info('DATABASE', 'SQLite ulanishi yopildi');
        } catch (err) {
            logger.error('DATABASE', 'Bazani yopishda xato:', err);
        }
        db = null;
    }
}
