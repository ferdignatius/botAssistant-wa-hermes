import { loadConfig } from './config/env';
import { client, initClient } from './wa/client';
import { buildRoleConfig } from './auth/roles';
import { resolveRole, isAllowed } from './auth/permission';
import { shouldProcessDM, shouldProcessGroup } from './wa/filters';
import { enqueue } from './queue/messageQueue';
import { callHermes } from './hermes/adapter';
import { HermesPayload } from './hermes/types';
import { sendReply } from './wa/reply';
import { createPushServer } from './server/pushEndpoint';

async function main() {
    // 1. Load config
    const config = loadConfig();
    const roleConfig = buildRoleConfig(config);

    // 2. Init WA Client
    await initClient();

    // 3. Register message listener
    client.on('message_create', async (message) => {
        const chat = await message.getChat();
        const isGroup = chat.isGroup;
        const botId = client.info.wid._serialized;

        console.log(`[MSG] from=${message.from} isGroup=${isGroup} fromMe=${message.fromMe} body="${message.body.slice(0, 50)}"`);

        if (isGroup) {
            // === GROUP FLOW ===
            const result = shouldProcessGroup(message, botId);
            console.log(`[GROUP] process=${result.process} cleanedBody="${result.cleanedBody.slice(0, 50)}"`);
            if (!result.process) return;

            const senderNumber = message.author?.replace('@c.us', '') || '';
            const role = resolveRole(senderNumber, roleConfig);
            console.log(`[GROUP] sender=${senderNumber} role=${role} allowed=${isAllowed(role)}`);
            if (!isAllowed(role)) return;

            enqueue(chat.id._serialized, async () => {
                await chat.sendStateTyping();

                const contact = await message.getContact();
                const payload: HermesPayload = {
                    source: 'whatsapp',
                    chat_type: 'group',
                    chat_id: chat.id._serialized,
                    chat_name: chat.name,
                    sender: senderNumber,
                    sender_name: contact.pushname || contact.name || senderNumber,
                    role,
                    message: result.cleanedBody,
                };

                const response = await callHermes(payload);
                await sendReply(chat, message, response.reply, true);
            });

        } else {
            // === DM FLOW ===
            const dmAllowed = shouldProcessDM(message, roleConfig);
            console.log(`[DM] sender=${message.from} allowed=${dmAllowed}`);
            if (!dmAllowed) return;

            const senderNumber = message.from.replace('@c.us', '');

            enqueue(chat.id._serialized, async () => {
                await chat.sendStateTyping();

                const payload: HermesPayload = {
                    source: 'whatsapp',
                    chat_type: 'dm',
                    chat_id: chat.id._serialized,
                    sender: senderNumber,
                    role: 'owner',
                    message: message.body,
                };

                const response = await callHermes(payload);
                await sendReply(chat, null, response.reply, false);
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
