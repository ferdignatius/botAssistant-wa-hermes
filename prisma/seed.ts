import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('🌱 Starting database seed...');

    // Buat admin user default
    const defaultPassword = process.env.ADMIN_SEED_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    const admin = await prisma.adminUser.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            passwordHash,
        },
    });

    console.log(`✅ Admin user created: ${admin.username}`);
    console.log(`⚠️  Default password: ${defaultPassword}`);
    console.log(`⚠️  SEGERA ganti password setelah login pertama!`);
}

main()
    .catch((err) => {
        console.error('❌ Seed failed:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
