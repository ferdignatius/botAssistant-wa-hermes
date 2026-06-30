import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { Client } from 'whatsapp-web.js';
import { loadConfig } from '../config/env';
import adminRouter from './adminRouter';

const config = loadConfig();

/**
 * Buat Express app dengan:
 * - CORS yang dibatasi ke ALLOWED_ORIGIN
 * - POST /send — Hermes push endpoint (outbound WA)
 * - /admin/* — Admin REST API (CRUD users, logs, status)
 */
export function createExpressApp(client: Client): Express {
    const app = express();

    // CORS — hanya izinkan origin dari Admin Panel
    const allowedOrigins = config.allowedOrigin.split(',').map(o => o.trim());

    app.use(cors({
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true);
            }

            const isAllowed = allowedOrigins.some(allowedOpt => {
                if (allowedOpt === '*') return true;
                try {
                    const allowedUrl = allowedOpt.startsWith('http://') || allowedOpt.startsWith('https://')
                        ? new URL(allowedOpt)
                        : null;

                    const requestUrl = new URL(origin);

                    if (allowedUrl) {
                        return requestUrl.origin === allowedUrl.origin;
                    } else {
                        return requestUrl.hostname === allowedOpt || requestUrl.host === allowedOpt;
                    }
                } catch {
                    return origin.includes(allowedOpt);
                }
            });

            if (isAllowed) {
                callback(null, true);
            } else {
                callback(null, false);
            }
        },
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-hermes-secret'],
        credentials: true,
    }));

    app.use(express.json());

    // ── Health check ──────────────────────────────────────────────
    app.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // ── Hermes Push Endpoint (Outbound: Hermes → WA) ─────────────
    app.post('/send', async (req: Request, res: Response) => {
        const secret = req.headers['x-hermes-secret'];
        if (secret !== config.hermesSecret) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { chat_id, message } = req.body;
        if (!chat_id || !message) {
            return res.status(400).json({ success: false, error: 'Missing chat_id or message' });
        }

        try {
            await client.sendMessage(chat_id, message);
            return res.status(200).json({ success: true });
        } catch (err: any) {
            console.error('[Push] Failed to send:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    });

    // ── Admin API ─────────────────────────────────────────────────
    app.use('/admin', adminRouter);

    return app;
}
