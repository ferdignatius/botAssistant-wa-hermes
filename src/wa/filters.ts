import { Message } from "whatsapp-web.js"
import { RoleConfig } from "../auth/roles";

/**
 * DM filter — drop kalau:
 * - bot sendiri
 * - status broadcast
 * - bukan owner DAN bukan member (guest = drop)
 */
export function shouldProcessDM(message: Message, roleConfig: RoleConfig) {
    if (message.fromMe) return false;
    if (message.from === 'status@broadcast') return false;
    
    const senderNumber = message.from.replace(/@(c\.us|lid)$/, '');
    // Allow owner dan member, drop guest
    if (roleConfig.owners.has(senderNumber)) return true;
    if (roleConfig.members.has(senderNumber)) return true;
    return false;
}

export function isBotLoop(message: Message) {
    return message.fromMe;
}

/**
 * Hapus #aii tag dari body pesan
 */
export function stripTag(body: string): string {
    return body.replace(/#aii\s*/gi, '').trim();
}

// group — proses hanya kalau ada #aii di pesan
export function shouldProcessGroup(message: Message, botId: string) : {process: boolean, cleanedBody: string} {
    const hasHashtag = /#aii\b/i.test(message.body);

    if (!hasHashtag) {
        return { process: false, cleanedBody: '' };
    }

    if (isBotLoop(message)) {
        return { process: false, cleanedBody: '' };
    }

    const cleanedBody = stripTag(message.body);
    return { process: true, cleanedBody };
}