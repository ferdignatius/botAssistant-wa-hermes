import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
    hermesApiUrl: string;
    hermesApiKey: string;
    hermesSecret: string;
    expressPort: number;
    ownerNumbers: string[];
    memberNumbers: string[];
    allowedGroups: string[];
}

export function loadConfig(): AppConfig {
    const required = [
        'HERMES_API_URL',
        'HERMES_API_KEY',
        'HERMES_SECRET',
        'EXPRESS_PORT',
        'OWNER_NUMBERS',
    ];

    for (const key of required) {
        if (!process.env[key]) {
            throw new Error(`Missing required env variable: ${key}`);
        }
    }

    return {
        hermesApiUrl: process.env.HERMES_API_URL!,
        hermesApiKey: process.env.HERMES_API_KEY!,
        hermesSecret: process.env.HERMES_SECRET!,
        expressPort: parseInt(process.env.EXPRESS_PORT!, 10) || 3001,
        ownerNumbers: process.env.OWNER_NUMBERS!.split(',').map(n => n.trim()),
        memberNumbers: process.env.MEMBER_NUMBERS?.split(',').map(n => n.trim()) || [],
        allowedGroups: process.env.ALLOWED_GROUPS?.split(',').map(g => g.trim()) || [],
    };
}
