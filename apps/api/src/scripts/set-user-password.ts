import path from 'path';
import dotenv from 'dotenv';

// Load apps/api/.env (same file the server loads) so DATABASE_URL is available
// when run standalone via tsx.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { prisma } from '@kpi-platform/db';
import { AuthService } from '../services/auth.service';

/**
 * Set a user's password from the command line.
 *
 * There is no change-password endpoint in the API — passwords are only ever set
 * at user creation — so this is the only way to rotate the credentials of the
 * accounts that already exist, including the bootstrapped super admin.
 *
 * Hashing goes through AuthService.hashPassword so the stored value matches
 * exactly what the login path expects (`<salt>:<scrypt-64>`); writing the column
 * by hand with a different scheme produces a user who can never log in.
 *
 *   npx tsx apps/api/src/scripts/set-user-password.ts <email> '<new-password>'
 *
 * Quote the password so the shell does not interpret ! or $.
 */
async function main(): Promise<void> {
    const [email, newPassword] = process.argv.slice(2);

    if (!email || !newPassword) {
        console.error("Usage: set-user-password.ts <email> '<new-password>'");
        process.exit(1);
    }

    if (newPassword.length < 12) {
        console.error('Refusing: use at least 12 characters.');
        process.exit(1);
    }

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, role: true, status: true },
    });

    if (!user) {
        console.error(`No user with email "${email}".`);
        console.error('Existing users:');
        const all = await prisma.user.findMany({ select: { email: true, role: true } });
        all.forEach((u) => console.error(`  ${u.email}  (${u.role})`));
        process.exit(1);
    }

    await prisma.user.update({
        where: { email },
        data: { passwordHash: await AuthService.hashPassword(newPassword) },
    });

    console.log(`Password updated for ${user.email} (${user.role}).`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
