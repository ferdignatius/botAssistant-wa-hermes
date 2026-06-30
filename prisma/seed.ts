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
    const defaultUsername = process.env.ADMIN_SEED_USERNAME || 'admin';
    const defaultPassword = process.env.ADMIN_SEED_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    const admin = await prisma.adminUser.upsert({
        where: { username: defaultUsername },
        update: {
            passwordHash, // Pastikan jika password di .env diupdate, password hash di DB juga terupdate
        },
        create: {
            username: defaultUsername,
            passwordHash,
        },
    });

    console.log(`✅ Admin user created: ${admin.username}`);
    console.log(`⚠️  Default password: ${defaultPassword}`);
    console.log(`⚠️  Silakan login dengan kredensial di atas!`);
}

main()
    .catch((err) => {
        console.error('❌ Seed failed:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
