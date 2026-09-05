import fs from 'fs/promises';
import path from 'path';

const dataFile = path.join(process.cwd(), 'data.json');

export const storage = {
    async read() {
        try {
            const data = await fs.readFile(dataFile, 'utf-8');
            const parsed = JSON.parse(data);
            if (!Array.isArray(parsed.keywords)) parsed.keywords = [];
            if (!Array.isArray(parsed.channels)) parsed.channels = [];
            if (!Array.isArray(parsed.stopWords)) parsed.stopWords = [];
            if (!Array.isArray(parsed.savedVacancies)) parsed.savedVacancies = [];
            return parsed;
        } catch (err) {
            if (err.code === 'ENOENT') {
                const defaultData = { 
                    keywords: [], 
                    channels: [], 
                    stopWords: [
                        "#xodim",
                        "#rezyume",
                        "#cv",
                        "rezyume",
                        "cv",
                        "резюме",
                        "ish joyi kerak",
                        "ish qidir",
                        "ish qidiryapti",
                        "ish qidirmoqdaman",
                        "ish qidiryapman",
                        "loyiha qidir",
                        "tajribaga egaman",
                        "tajribam bor",
                        "xodim:",
                        "ищу работу"
                    ]
 
                };
                await this.write(defaultData);
                return defaultData;
            }
            throw err;
        }
    },

    async write(data) {
        await fs.writeFile(dataFile, JSON.stringify(data, null, 2), 'utf-8');
    },

    async addKeyword(keyword) {
        const data = await this.read();
        const kw = keyword.toLowerCase();
        if (!data.keywords.includes(kw)) {
            data.keywords.push(kw);
            await this.write(data);
            return true;
        }
        return false;
    },

    async delKeyword(keyword) {
        const data = await this.read();
        const kw = keyword.toLowerCase();
        const initialLen = data.keywords.length;
        data.keywords = data.keywords.filter(k => k !== kw);
        if (data.keywords.length !== initialLen) {
            await this.write(data);
            return true;
        }
        return false;
    },

    async addChannel(channel) {
        let norm = channel.trim();
        if (norm.includes('t.me/')) {
            let parts = norm.split('t.me/')[1].split('?')[0].split('/');
            if (parts[0] === 'c' && parts[1]) {
                norm = '-100' + parts[1];
            } else {
                norm = '@' + parts[0];
            }
        } else if (!norm.startsWith('@') && isNaN(norm) && !norm.startsWith('-')) {
            norm = '@' + norm;
        }
        if (norm.startsWith('@')) norm = norm.toLowerCase();

        const data = await this.read();
        if (!data.channels.find(c => c.toLowerCase() === norm.toLowerCase())) {
            data.channels.push(norm);
            await this.write(data);
            return true;
        }
        return false;
    },

    async delChannel(channel) {
        let norm = channel.trim();
        if (norm.includes('t.me/')) {
            let parts = norm.split('t.me/')[1].split('?')[0].split('/');
            if (parts[0] === 'c' && parts[1]) {
                norm = '-100' + parts[1];
            } else {
                norm = '@' + parts[0];
            }
        } else if (!norm.startsWith('@') && isNaN(norm) && !norm.startsWith('-')) {
            norm = '@' + norm;
        }
        if (norm.startsWith('@')) norm = norm.toLowerCase();

        const data = await this.read();
        const initialLen = data.channels.length;
        data.channels = data.channels.filter(c => c.toLowerCase() !== norm.toLowerCase());
        if (data.channels.length !== initialLen) {
            await this.write(data);
            return true;
        }
        return false;
    },

    async addStopWord(word) {
        const data = await this.read();
        const sw = word.trim().toLowerCase();
        if (!sw) return false;
        if (!data.stopWords.includes(sw)) {
            data.stopWords.push(sw);
            await this.write(data);
            return true;
        }
        return false;
    },

    async delStopWord(word) {
        const data = await this.read();
        const sw = word.trim().toLowerCase();
        const initialLen = data.stopWords.length;
        data.stopWords = data.stopWords.filter(s => s.toLowerCase() !== sw);
        if (data.stopWords.length !== initialLen) {
            await this.write(data);
            return true;
        }
        return false;
    },

    async addSavedVacancy(vacancy) {
        const data = await this.read();
        data.savedVacancies = data.savedVacancies || [];
        const exists = data.savedVacancies.find(v => (vacancy.id && v.id === vacancy.id) || (vacancy.link && v.link === vacancy.link));
        if (!exists) {
            data.savedVacancies.unshift({
                id: vacancy.id,
                channelName: vacancy.channelName,
                text: vacancy.text,
                link: vacancy.link,
                channelIdentifier: vacancy.channelIdentifier,
                matchedKeywords: vacancy.matchedKeywords || [],
                contacts: vacancy.contacts || null,
                savedAt: new Date().toLocaleString('uz-UZ')
            });
            if (data.savedVacancies.length > 200) {
                data.savedVacancies = data.savedVacancies.slice(0, 200);
            }
            await this.write(data);
            return true;
        }
        return false;
    },

    async getSavedVacancies() {
        const data = await this.read();
        return data.savedVacancies || [];
    },

    async removeSavedVacancy(id) {
        const data = await this.read();
        data.savedVacancies = data.savedVacancies || [];
        const initialLen = data.savedVacancies.length;
        data.savedVacancies = data.savedVacancies.filter(v => v.id !== id);
        if (data.savedVacancies.length !== initialLen) {
            await this.write(data);
            return true;
        }
        return false;
    }
};

