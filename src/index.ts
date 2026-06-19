import { loadConfig } from './config/env';
import { client, initClient } from './wa/client';
import { buildRoleConfig } from './auth/roles';
import { resolveRole, isAllowed } from './auth/permission';
import { shouldProcessDM, shouldProcessGroup } from './wa/filters';
import { enqueue } from './queue/messageQueue';
import { callHermes } from './hermes/adapter';
import { HermesPayload } from './hermes/types';
import { sendReply, startTypingLoop } from './wa/reply';
import { createPushServer } from './server/pushEndpoint';

async function main() {
    // 1. Load config
    const config = loadConfig();
    const roleConfig = buildRoleConfig(config);

    // 2. Init WA Client
    await initClient();

    // 3. Register message listener
    // Allowed groups set buat whitelist
    const allowedGroups = new Set(config.allowedGroups);

    client.on('message_create', async (message) => {
        const chat = await message.getChat();
        const isGroup = chat.isGroup;
        const botId = client.info.wid._serialized;

        console.log(`[MSG] from=${message.from} isGroup=${isGroup} groupId=${isGroup ? chat.id._serialized : '-'} fromMe=${message.fromMe} body="${message.body.slice(0, 50)}"`);

        if (isGroup) {
            // === GROUP FLOW ===
            // Cek apakah grup ini diizinkan
            if (allowedGroups.size > 0 && !allowedGroups.has(chat.id._serialized)) {
                console.log(`[GROUP] DROPPED — group ${chat.id._serialized} (${chat.name}) not in allowed list`);
                return;
            }

            const result = shouldProcessGroup(message, botId);
            console.log(`[GROUP] id=${chat.id._serialized} name="${chat.name}" process=${result.process}`);
            if (!result.process) return;

            const senderNumber = message.author?.replace(/@(c\.us|lid)$/, '') || '';
            const role = resolveRole(senderNumber, roleConfig);
            console.log(`[GROUP] sender=${senderNumber} role=${role} allowed=${isAllowed(role)}`);
            if (!isAllowed(role)) return;

            enqueue(chat.id._serialized, async () => {
                const stopTyping = startTypingLoop(chat);

                try {
                    const contact = await message.getContact();

                    // Ambil quoted message kalau ada (pesan yang di-reply)
                    let messageText = result.cleanedBody;
                    if (message.hasQuotedMsg) {
                        const quoted = await message.getQuotedMessage();
                        const quotedContact = await quoted.getContact();
                        const quotedName = quotedContact.pushname || quotedContact.name || 'Unknown';
                        messageText = `[Replying to ${quotedName}: "${quoted.body.slice(0, 500)}"]\n\n${messageText}`;
                    }

                    const payload: HermesPayload = {
                        source: 'whatsapp',
                        chat_type: 'group',
                        chat_id: chat.id._serialized,
                        chat_name: chat.name,
                        sender: senderNumber,
                        sender_name: contact.pushname || contact.name || senderNumber,
                        role,
                        message: messageText,
                    };

                    const response = await callHermes(payload);
                    stopTyping();
                    await sendReply(chat, message, response.reply, true);
                } catch (err: any) {
                    stopTyping();
                    const errorMsg = err.code === 'ECONNABORTED'
                        ? '⏳ Maaf, request timeout. Coba lagi nanti.'
                        : '❌ Terjadi kesalahan saat memproses pesan.';
                    await message.reply(errorMsg);
                }
            });

        } else {
            // === DM FLOW ===
            const dmAllowed = shouldProcessDM(message, roleConfig);
            console.log(`[DM] sender=${message.from} allowed=${dmAllowed}`);
            if (!dmAllowed) return;

            const senderNumber = message.from.replace(/@(c\.us|lid)$/, '');
            const role = resolveRole(senderNumber, roleConfig);

            enqueue(chat.id._serialized, async () => {
                const stopTyping = startTypingLoop(chat);

                try {
                    // Ambil quoted message kalau ada
                    let messageText = message.body;
                    if (message.hasQuotedMsg) {
                        const quoted = await message.getQuotedMessage();
                        messageText = `[Replying to: "${quoted.body.slice(0, 500)}"]\n\n${messageText}`;
                    }

                    const payload: HermesPayload = {
                        source: 'whatsapp',
                        chat_type: 'dm',
                        chat_id: chat.id._serialized,
                        sender: senderNumber,
                        role,
                        message: messageText,
                    };

                    const response = await callHermes(payload);
                    stopTyping();
                    await sendReply(chat, null, response.reply, false);
                } catch (err: any) {
                    stopTyping();
                    const errorMsg = err.code === 'ECONNABORTED'
                        ? '⏳ Maaf, request timeout. Coba lagi nanti.'
                        : '❌ Terjadi kesalahan saat memproses pesan.';
                    await chat.sendMessage(errorMsg);
                }
            });
        }
    });

    // 4. Start Push Endpoint
    const pushServer = createPushServer(client);
    pushServer.listen(config.expressPort, () => {
        console.log(`[Push] Server running on port ${config.expressPort}`);
    });

    // 5. Graceful shutdown
    const shutdown = () => {
        console.log('Shutting down...');
        client.destroy();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
