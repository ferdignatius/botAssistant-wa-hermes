import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from 'qrcode-terminal';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
    },
});

export async function initClient(maxRetries: number = 3): Promise<void> {
    client.on('qr', (qr) => {
        console.log('Scan QR code:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('WA Client ready!');
    });

    client.on('auth_failure', (err) => {
        console.error('Auth failure:', err);
        process.exit(1);
    });

    client.on('disconnected', (reason) => {
        console.error('WA Client disconnected:', reason);
        console.log('Reconnecting in 5s...');
        setTimeout(() => {
            client.initialize().catch(e => {
                console.error('Reconnect failed:', e.message);
            });
        }, 5000);
    });

    // Retry initialize — WA Web sering reload page saat startup
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await client.initialize();
            return; // success
        } catch (err: any) {
            const isNavigationError =
                err.message?.includes('Execution context was destroyed') ||
                err.message?.includes('Protocol error');

            const isBrowserRunning =
                err.message?.includes('browser is already running');

            if (isBrowserRunning) {
                // Kill orphan chrome processes sebelum retry
                console.warn(`[WA] Browser still running, destroying and retrying in 5s...`);
                try { await client.destroy(); } catch { /* ignore */ }
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else if (isNavigationError && attempt < maxRetries) {
                console.warn(`[WA] Init attempt ${attempt} failed (page navigation), retrying in 5s...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                throw err;
            }
        }
    }
}

// Catch unhandled puppeteer/navigation errors supaya app ga crash di runtime
process.on('unhandledRejection', (reason: any) => {
    if (reason?.message?.includes('Execution context was destroyed') ||
        reason?.message?.includes('Protocol error') ||
        reason?.message?.includes('navigation')) {
        console.warn('[WA] Page navigated, ignoring error');
    } else {
        console.error('Unhandled rejection:', reason);
    }
});

export { client };
