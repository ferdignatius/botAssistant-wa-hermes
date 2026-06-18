import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from 'qrcode-terminal';

const client = new Client({
    authStrategy: new LocalAuth()
});

export async function initClient(): Promise<void> {
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

    await client.initialize();
}

export { client };
