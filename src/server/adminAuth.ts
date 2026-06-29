import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Request type untuk menyimpan adminId setelah auth
export interface AdminRequest extends Request {
    adminId?: string;
}

/**
 * Middleware JWT untuk melindungi semua admin endpoints.
 * Expects: Authorization: Bearer <token>
 */
export function adminAuthMiddleware(
    req: AdminRequest,
    res: Response,
    next: NextFunction
): void {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Authorization header required' });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { adminId: string };
        req.adminId = decoded.adminId;
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}
