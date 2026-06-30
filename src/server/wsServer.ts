import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';

// Set of connected admin WebSocket clients
const clients = new Set<WebSocket>();

/**
 * Buat WebSocket server yang menempel pada HTTP server yang sama dengan Express.
 * Koneksi hanya diterima jika token JWT valid (dikirim via ?token=JWT_TOKEN).
 */
export function createWsServer(httpServer: Server): void {
    const wss = new WebSocketServer({ server: httpServer });

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        try {
            // Validasi JWT dari query string
            const url = new URL(req.url || '/', `http://${req.headers.host}`);
            const token = url.searchParams.get('token');

            if (!token) throw new Error('No token provided');
            jwt.verify(token, process.env.JWT_SECRET!);

            clients.add(ws);
            console.log(`[WS] Client connected. Total: ${clients.size}`);

            ws.on('close', () => {
                clients.delete(ws);
                console.log(`[WS] Client disconnected. Total: ${clients.size}`);
            });

            ws.on('error', () => {
                clients.delete(ws);
            });

        } catch (err: any) {
            console.warn('[WS] Unauthorized connection rejected:', err.message);
            ws.close(1008, 'Unauthorized');
        }
    });

    console.log('[WS] WebSocket server attached to HTTP server');
}

/**
 * Broadcast event ke semua WebSocket client yang aktif.
 * Dipanggil dari client.ts saat QR/status WA berubah.
 */
export function broadcast(data: object): void {
    if (clients.size === 0) return;

    const message = JSON.stringify(data);
    for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    }
}
