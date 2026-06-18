import axios from "axios";
import { HermesPayload, HermesResponse } from "./types";
import { loadConfig } from "../config/env";
import { IncomingMessage } from "http";

const config = loadConfig();

export async function callHermes(payload: HermesPayload): Promise<HermesResponse> {
    try {
        // Transform HermesPayload → OpenAI Chat Completions format
        const systemMsg =
            `Kamu adalah asisten AI untuk WhatsApp.\n` +
            `Source: ${payload.source}\n` +
            `Sender: ${payload.sender_name || payload.sender}\n` +
            `Chat: ${payload.chat_name || payload.chat_id}\n` +
            `Role: ${payload.role}`;

        const openaiPayload = {
            model: 'hermes-agent',
            stream: true,
            messages: [
                { role: 'system', content: systemMsg },
                { role: 'user', content: payload.message },
            ],
        };

        const response = await axios.post(config.hermesApiUrl, openaiPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.hermesApiKey}`,
            },
            timeout: 120000,
            responseType: 'stream',
        });

        const reply = await parseStream(response.data);
        return { reply };

    } catch (err: any) {
        if (err.code === 'ECONNABORTED') {
            console.error(`[Hermes] Request Timeout`);
        } else if (err.response) {
            console.error(`[Hermes] HTTP ${err.response.status}:`, err.response.data);
        } else {
            console.error(`[Hermes] error:`, err.message);
        }
        throw err;
    }
}

/**
 * Parse OpenAI-compatible SSE stream.
 * Format: data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}
 * Collect all delta.content chunks until [DONE].
 */
async function parseStream(stream: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let textBuffer = '';
        let lineBuffer = '';

        stream.on('data', (chunk: Buffer) => {
            lineBuffer += chunk.toString();

            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;

                const jsonStr = line.slice(6).trim();
                if (jsonStr === '' || jsonStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(jsonStr);
                    const choice = data.choices?.[0];
                    const content = choice?.delta?.content || '';
                    textBuffer += content;
                } catch {
                    // JSON ga valid, skip
                }
            }
        });

        stream.on('end', () => resolve(textBuffer));
        stream.on('error', reject);
    });
}
