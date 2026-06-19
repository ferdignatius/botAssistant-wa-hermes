import { Chat, Message } from "whatsapp-web.js";

/**
 * Start typing loop — refresh typing indicator tiap 20 detik.
 * Return function buat stop loop.
 */
export function startTypingLoop(chat: Chat): () => void {
    let active = true;

    const loop = async () => {
        while (active) {
            try {
                await chat.sendStateTyping();
            } catch {
                // ignore typing errors
            }
            // WA typing expires ~25s, refresh tiap 20s
            await new Promise(resolve => setTimeout(resolve, 20000));
        }
    };

    loop();
    return () => { active = false; };
}

export function splitMessage(text: string, maxLength: number = 2000): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break
        }

        let splitIndex = remaining.lastIndexOf('\n', maxLength);

        if (splitIndex === -1 || splitIndex == 0) {
            splitIndex = maxLength;
        }

        chunks.push(remaining.slice(0, splitIndex));
        remaining = remaining.slice(splitIndex).replace(/^\n/, '');
    }
    return chunks;
}

export async function sendReply( chat: Chat, message: Message | null, text: string, quoted: boolean = false ): Promise<void> {
    const chunks = splitMessage(text);

    // delay for avoid ban
    const delay = 1500 + Math.random() * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));

    for (const chunk of chunks) {
        if (quoted && message) {
            await message.reply(chunk);
        } else {
            await chat.sendMessage(chunk);
        }
    }
}