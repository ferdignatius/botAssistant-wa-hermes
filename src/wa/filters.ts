import { Message } from "whatsapp-web.js";

/**
 * DM filter — hanya drop kalau:
 * - Pesan dari bot sendiri (fromMe)
 * - Status broadcast
 * - Tipe data bukan string
 *
 * Role check (hanya owner yang diizinkan) dilakukan di index.ts via Prisma DB query.
 */
export function shouldProcessDM(message: Message): boolean {
    if (message.fromMe) return false;
    if (message.from === 'status@broadcast') return false;
    if (typeof message.body !== 'string') return false;
    return true;
}

/**
 * Group filter — proses hanya kalau ada #aii di pesan.
 * Anti-loop: drop jika fromMe.
 */
export function shouldProcessGroup(
    message: Message,
    _botId: string
): { process: boolean; cleanedBody: string } {
    // Anti bot-loop
    if (message.fromMe) return { process: false, cleanedBody: '' };

    // Proteksi tipe data body
    if (typeof message.body !== 'string') return { process: false, cleanedBody: '' };

    const hasHashtag = /#aii\b/i.test(message.body);
    if (!hasHashtag) return { process: false, cleanedBody: '' };

    // Hapus #aii dari body sebelum dikirim ke Hermes
    const cleanedBody = message.body.replace(/#aii\s*/gi, '').trim();
    return { process: true, cleanedBody };
}