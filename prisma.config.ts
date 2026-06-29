import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma v7 config — DATABASE_URL dibaca di sini, bukan di schema.prisma
export default defineConfig({
    schema: './prisma/schema.prisma',
    datasource: {
        url: env('DATABASE_URL'),
    },
});
