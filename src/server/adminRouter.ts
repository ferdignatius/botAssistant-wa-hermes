import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { adminAuthMiddleware, AdminRequest } from './adminAuth';

const router = Router();

// ── POST /admin/auth/login ──────────────────────────────────────────────────
router.post('/auth/login', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Username dan password wajib diisi' });
        }

        const admin = await prisma.adminUser.findUnique({ where: { username } });
        if (!admin) {
            return res.status(401).json({ success: false, error: 'Username atau password salah' });
        }

        const isValid = await bcrypt.compare(password, admin.passwordHash);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Username atau password salah' });
        }

        const token = jwt.sign(
            { adminId: admin.id },
            process.env.JWT_SECRET!,
            { expiresIn: '7d' }
        );

        return res.json({ success: true, token, username: admin.username });
    } catch (err: any) {
        console.error('[Admin] Login error:', err.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ── Semua route di bawah ini wajib autentikasi ──────────────────────────────
router.use(adminAuthMiddleware as any);

// ── GET /admin/users ────────────────────────────────────────────────────────
router.get('/users', async (_req: AdminRequest, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return res.json({ success: true, data: users });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /admin/users ───────────────────────────────────────────────────────
router.post('/users', async (req: AdminRequest, res: Response) => {
    try {
        const { whatsappId, name, role } = req.body;

        if (!whatsappId || !name || !role) {
            return res.status(400).json({ success: false, error: 'whatsappId, name, dan role wajib diisi' });
        }

        if (!['owner', 'member'].includes(role)) {
            return res.status(400).json({ success: false, error: 'role harus "owner" atau "member"' });
        }

        // Sanitasi whatsappId (JID):
        let sanitizedId = whatsappId.trim();
        // Jika hanya angka (nomor telepon biasa), bersihkan dan tambahkan @c.us
        if (/^\+?\d+$/.test(sanitizedId.replace(/\+/g, ''))) {
            sanitizedId = sanitizedId.replace(/\D/g, ''); // bersihkan non-angka
            if (sanitizedId.startsWith('0')) {
                sanitizedId = '62' + sanitizedId.slice(1);
            }
            sanitizedId = sanitizedId + '@c.us';
        }

        const user = await prisma.user.create({ data: { whatsappId: sanitizedId, name, role } });
        return res.status(201).json({ success: true, data: user });
    } catch (err: any) {
        if (err.code === 'P2002') {
            return res.status(409).json({ success: false, error: 'WhatsApp ID sudah terdaftar' });
        }
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── PATCH /admin/users/:id ──────────────────────────────────────────────────
router.patch('/users/:id', async (req: AdminRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name, role } = req.body;

        if (role && !['owner', 'member'].includes(role)) {
            return res.status(400).json({ success: false, error: 'role harus "owner" atau "member"' });
        }

        const user = await prisma.user.update({
            where: { id: String(id) },
            data: {
                ...(name !== undefined && { name: name as string }),
                ...(role !== undefined && { role: role as Role }),
            },
        });

        return res.json({ success: true, data: user });
    } catch (err: any) {
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: 'User tidak ditemukan' });
        }
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── DELETE /admin/users/:id ─────────────────────────────────────────────────
router.delete('/users/:id', async (req: AdminRequest, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.user.delete({ where: { id: String(id) } });
        return res.json({ success: true });
    } catch (err: any) {
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: 'User tidak ditemukan' });
        }
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /admin/groups ───────────────────────────────────────────────────────
router.get('/groups', async (_req: AdminRequest, res: Response) => {
    try {
        const groups = await prisma.allowedGroup.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return res.json({ success: true, data: groups });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /admin/groups ──────────────────────────────────────────────────────
router.post('/groups', async (req: AdminRequest, res: Response) => {
    try {
        const { groupId, name } = req.body;

        if (!groupId || !name) {
            return res.status(400).json({ success: false, error: 'groupId dan name wajib diisi' });
        }

        let sanitizedGroupId = groupId.trim();
        // Jika hanya angka (ID grup mentah), tambahkan @g.us otomatis
        if (/^\d+$/.test(sanitizedGroupId)) {
            sanitizedGroupId = sanitizedGroupId + '@g.us';
        }

        const group = await prisma.allowedGroup.create({
            data: { groupId: sanitizedGroupId, name },
        });
        return res.status(201).json({ success: true, data: group });
    } catch (err: any) {
        if (err.code === 'P2002') {
            return res.status(409).json({ success: false, error: 'Group ID sudah terdaftar' });
        }
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── DELETE /admin/groups/:id ────────────────────────────────────────────────
router.delete('/groups/:id', async (req: AdminRequest, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.allowedGroup.delete({ where: { id: String(id) } });
        return res.json({ success: true });
    } catch (err: any) {
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: 'Grup tidak ditemukan' });
        }
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /admin/logs ─────────────────────────────────────────────────────────
router.get('/logs', async (req: AdminRequest, res: Response) => {
    try {
        const {
            sender,
            chatName,
            status,
            isGroup,
            page = '1',
            limit = '50',
        } = req.query;

        const senderStr = Array.isArray(sender) ? sender[0] : sender as string | undefined;
        const chatNameStr = Array.isArray(chatName) ? chatName[0] : chatName as string | undefined;
        const statusStr = Array.isArray(status) ? status[0] : status as string | undefined;
        const isGroupStr = Array.isArray(isGroup) ? isGroup[0] : isGroup as string | undefined;
        const pageStr = Array.isArray(page) ? page[0] : (page as string) ?? '1';
        const limitStr = Array.isArray(limit) ? limit[0] : (limit as string) ?? '50';

        const pageNum = parseInt(String(pageStr ?? '1'), 10);
        const limitNum = parseInt(String(limitStr ?? '50'), 10);
        const skip = (pageNum - 1) * limitNum;

        const where: any = {};
        if (senderStr) where.sender = { contains: senderStr };
        if (chatNameStr) where.chatName = { contains: chatNameStr, mode: 'insensitive' };
        if (statusStr) where.status = statusStr;
        if (isGroupStr !== undefined) where.isGroup = isGroupStr === 'true';

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                skip,
                take: limitNum,
            }),
            prisma.activityLog.count({ where }),
        ]);

        return res.json({
            success: true,
            data: logs,
            total,
            page: pageNum,
            limit: limitNum,
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /admin/status ───────────────────────────────────────────────────────
// Status WA client disimpan in-memory, di-update dari client.ts
let waStatus: 'connecting' | 'connected' | 'disconnected' | 'qr' = 'connecting';
export function setWaStatus(s: typeof waStatus) { waStatus = s; }

router.get('/status', async (_req: AdminRequest, res: Response) => {
    return res.json({ success: true, data: { waStatus } });
});

export default router;
