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

        // 7. Shaxsiy profil va AI sozlamalari
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id INTEGER PRIMARY KEY,
                profile_text TEXT DEFAULT '',
                interview_step INTEGER DEFAULT 0,
                interview_data TEXT DEFAULT '{}',
                gemini_api_key TEXT DEFAULT NULL,
                scope_channels INTEGER DEFAULT 1,
                scope_groups INTEGER DEFAULT 1,
                scope_dms INTEGER DEFAULT 1,
                scope_bots INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
            );
        `);

        // 8. Gemini tomonidan tahlil qilingan saralangan xabarlar
        db.exec(`
            CREATE TABLE IF NOT EXISTS analyzed_messages (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                source_type TEXT NOT NULL,
                source_name TEXT,
                source_identifier TEXT,
                message_id TEXT,
                link TEXT,
                original_text TEXT,
                importance_score INTEGER DEFAULT 0,
                is_urgent INTEGER DEFAULT 0,
                category TEXT,
                ai_summary TEXT,
                ai_reasoning TEXT,
                action_items TEXT,
                is_read INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_analyzed_user ON analyzed_messages(user_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_analyzed_unread ON analyzed_messages(user_id, is_read);
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
// USER PROFILE & AI SETTINGS OPERATIONS
// -------------------------------------------------------------

export function getUserProfile(userId) {
    const database = getDb();
    let row = database.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
    if (!row) {
        // Standart profil yaratish
        database.prepare(`
            INSERT INTO user_profiles (user_id, profile_text, interview_step, interview_data, scope_channels, scope_groups, scope_dms, scope_bots)
            VALUES (?, '', 0, '{}', 1, 1, 1, 1)
        `).run(userId);
        row = database.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
    }
    return {
        ...row,
        interviewData: row.interview_data ? JSON.parse(row.interview_data) : {}
    };
}

export function upsertUserProfile(userId, fields = {}) {
    const database = getDb();
    const existing = getUserProfile(userId);
    
    const profileText = fields.profile_text !== undefined ? fields.profile_text : existing.profile_text;
    const interviewStep = fields.interview_step !== undefined ? fields.interview_step : existing.interview_step;
    const interviewData = fields.interview_data !== undefined ? (typeof fields.interview_data === 'string' ? fields.interview_data : JSON.stringify(fields.interview_data)) : JSON.stringify(existing.interviewData);
    const geminiApiKey = fields.gemini_api_key !== undefined ? fields.gemini_api_key : existing.gemini_api_key;
    const scopeChannels = fields.scope_channels !== undefined ? fields.scope_channels : existing.scope_channels;
    const scopeGroups = fields.scope_groups !== undefined ? fields.scope_groups : existing.scope_groups;
    const scopeDms = fields.scope_dms !== undefined ? fields.scope_dms : existing.scope_dms;
    const scopeBots = fields.scope_bots !== undefined ? fields.scope_bots : existing.scope_bots;

    database.prepare(`
        UPDATE user_profiles 
        SET profile_text = ?,
            interview_step = ?,
            interview_data = ?,
            gemini_api_key = ?,
            scope_channels = ?,
            scope_groups = ?,
            scope_dms = ?,
            scope_bots = ?,
            updated_at = datetime('now')
        WHERE user_id = ?
    `).run(profileText, interviewStep, interviewData, geminiApiKey, scopeChannels, scopeGroups, scopeDms, scopeBots, userId);

    return getUserProfile(userId);
}

export function updateUserGeminiKey(userId, apiKey) {
    const database = getDb();
    getUserProfile(userId); // ensure exists
    database.prepare(`
        UPDATE user_profiles 
        SET gemini_api_key = ?, updated_at = datetime('now')
        WHERE user_id = ?
    `).run(apiKey ? apiKey.trim() : null, userId);
}

export function updateUserScope(userId, scopeKey, value) {
    const allowed = ['scope_channels', 'scope_groups', 'scope_dms', 'scope_bots'];
    if (!allowed.includes(scopeKey)) return;
    const database = getDb();
    getUserProfile(userId);
    database.prepare(`
        UPDATE user_profiles
        SET ${scopeKey} = ?, updated_at = datetime('now')
        WHERE user_id = ?
    `).run(value ? 1 : 0, userId);
}

// -------------------------------------------------------------
// ANALYZED MESSAGES (GEMINI AI FEED)
// -------------------------------------------------------------

export function saveAnalyzedMessage(userId, msg) {
    const database = getDb();
    const id = msg.id || 'ai_' + Math.random().toString(36).substring(2, 10);
    try {
        database.prepare(`
            INSERT INTO analyzed_messages (
                id, user_id, source_type, source_name, source_identifier,
                message_id, link, original_text, importance_score, is_urgent,
                category, ai_summary, ai_reasoning, action_items, is_read, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
        `).run(
            id,
            userId,
            msg.source_type || 'channel',
            msg.source_name || '',
            msg.source_identifier || '',
            msg.message_id ? String(msg.message_id) : '',
            msg.link || '',
            msg.original_text || '',
            msg.importance_score || 0,
            msg.is_urgent ? 1 : 0,
            msg.category || 'general',
            msg.ai_summary || '',
            msg.ai_reasoning || '',
            msg.action_items || ''
        );
        return id;
    } catch (err) {
        logger.error('DB_ANALYZED', `Xabarni saqlashda xato: ${err.message}`);
        return null;
    }
}

export function getRecentAnalyzedMessages(userId, limit = 10, offset = 0, onlyUnread = false) {
    const database = getDb();
    let query = `
        SELECT * FROM analyzed_messages 
        WHERE user_id = ? 
    `;
    if (onlyUnread) {
        query += ` AND is_read = 0 `;
    }
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ? `;
    return database.prepare(query).all(userId, limit, offset);
}

export function getAnalyzedMessagesForDigest(userId, limit = 30, hours = 24) {
    const database = getDb();
    return database.prepare(`
        SELECT * FROM analyzed_messages
        WHERE user_id = ? 
          AND created_at >= datetime('now', '-' || ? || ' hours')
        ORDER BY importance_score DESC, created_at DESC
        LIMIT ?
    `).all(userId, hours, limit);
}

export function getAnalyzedMessageById(id) {
    const database = getDb();
    return database.prepare('SELECT * FROM analyzed_messages WHERE id = ?').get(id);
}

export function markAnalyzedMessageAsRead(userId, id) {
    const database = getDb();
    const info = database.prepare('UPDATE analyzed_messages SET is_read = 1 WHERE user_id = ? AND id = ?').run(userId, id);
    return info.changes > 0;
}

export function markAllAnalyzedAsRead(userId) {
    const database = getDb();
    const info = database.prepare('UPDATE analyzed_messages SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(userId);
    return info.changes;
}

export function getUnreadAnalyzedCount(userId) {
    const database = getDb();
    const row = database.prepare('SELECT COUNT(*) as count FROM analyzed_messages WHERE user_id = ? AND is_read = 0').get(userId);
    return row?.count || 0;
}

export function clearAnalyzedMessages(userId) {
    const database = getDb();
    database.prepare('DELETE FROM analyzed_messages WHERE user_id = ?').run(userId);
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
