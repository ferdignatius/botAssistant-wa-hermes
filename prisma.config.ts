import { defineConfig } from 'prisma/config';

// Prisma v7 config
export default defineConfig({
    schema: './prisma/schema.prisma',
    migrations: {
        path: './prisma/migrations',
        seed: './prisma/seed.ts',
        // Tidak perlu dataSource, karena akan dibaca dari env.DATABASE_URL
    }
});
