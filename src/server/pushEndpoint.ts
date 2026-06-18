import express, { Express, Request, Response } from 'express';
import { Client } from 'whatsapp-web.js';
import { loadConfig } from '../config/env';

const config = loadConfig();

export function createPushServer(client: Client): Express {
    const app = express();
    app.use(express.json());

    app.post('/send', async (req: Request, res: Response) => {
        // Validasi secret
        const secret = req.headers['x-hermes-secret'];
        if (secret !== config.hermesSecret) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        // Validasi body
        const { chat_id, message } = req.body;
        if (!chat_id || !message) {
            return res.status(400).json({ success: false, error: 'Missing chat_id or message' });
        }

        // Kirim ke WA
        try {
            await client.sendMessage(chat_id, message);
            return res.status(200).json({ success: true });
        } catch (err: any) {
            console.error('[Push] Failed to send:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    });

    return app;
}
