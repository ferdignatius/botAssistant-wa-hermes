// Role type untuk WA Gateway — hanya owner dan member.
// Guest tidak ada — nomor yang tidak terdaftar di DB langsung diabaikan.
// Data role disimpan di PostgreSQL via Prisma (model User).
export type Role = 'owner' | 'member';
