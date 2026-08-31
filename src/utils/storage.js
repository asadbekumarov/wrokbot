import fs from 'fs/promises';
import path from 'path';

const dataFile = path.join(process.cwd(), 'data.json');

export const storage = {
    async read() {
        try {
            const data = await fs.readFile(dataFile, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            if (err.code === 'ENOENT') {
                const defaultData = { keywords: [], channels: [] };
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
    }
};
