// DEPRECATED — Tidak digunakan lagi.
// Role resolution sekarang dilakukan via Prisma query di src/index.ts:
//   const user = await prisma.user.findUnique({ where: { phone: senderNumber } });
//   if (!user) return; // bukan owner/member, drop
