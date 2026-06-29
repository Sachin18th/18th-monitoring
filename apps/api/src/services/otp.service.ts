import { prisma } from '@kpi-platform/db';
import crypto from 'crypto';
import { AuthService } from './auth.service';
import { AuditService } from './audit.service';
import { EmailService } from './email.service';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes (matches the "expires in 10 minutes" copy)
const MAX_ATTEMPTS = 5;

function isActiveStatus(status: string | null | undefined): boolean {
    return String(status ?? '').toUpperCase() === 'ACTIVE';
}

function generateCode(): string {
    // 6-digit numeric, zero-padded.
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function buildOtpEmailHtml(code: string): string {
    return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #0f1724;">
      <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #2563eb; margin: 0 0 24px;">KPI Monitoring Platform</p>
      <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 16px;">Your One-Time Login Code</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px;">Use the code below to finish signing in. Do not share it with anyone.</p>
      <div style="font-size: 40px; font-weight: 800; letter-spacing: 0.3em; text-align: center; background: #f6f8fa; border: 1px solid rgba(15,23,42,0.06); border-radius: 12px; padding: 20px 0; margin: 0 0 24px;">${code}</div>
      <p style="font-size: 13px; color: #64748b; margin: 0;">This code will expire in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
    </div>`;
}

export class OtpService {
    /**
     * Issue an OTP for the given email. Account-enumeration safe: callers always
     * receive a generic success regardless of whether the email exists. Only a
     * real, existing user triggers an actual email.
     */
    static async requestOtp(email: string): Promise<void> {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, status: true, tenantId: true }
        });

        if (!user) {
            // Do not reveal whether the account exists; no email sent.
            return;
        }

        // Invalidate any previous unconsumed OTP for this user before issuing a new one.
        await prisma.otpCode.updateMany({
            where: { userId: user.id, consumedAt: null },
            data: { consumedAt: new Date() }
        });

        const code = generateCode();
        const codeHash = await AuthService.hashPassword(code);
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);

        await prisma.otpCode.create({
            data: {
                userId: user.id,
                email: user.email,
                codeHash,
                expiresAt
            }
        });

        await EmailService.send({
            to: user.email,
            subject: 'Your One-Time Login Code',
            html: buildOtpEmailHtml(code)
        });

        await AuditService.log({
            action: 'OTP_REQUESTED',
            actorId: email,
            tenantId: user.tenantId,
            status: 'SUCCESS'
        }).catch(() => undefined);
    }

    /**
     * Verify an OTP and, on success, issue a session via the shared
     * AuthService.createSession path (identical to password login).
     * Returns a discriminated result so the controller can map to HTTP codes.
     */
    static async verifyOtp(
        email: string,
        code: string
    ): Promise<
        | { ok: true; token: string; user: any }
        | { ok: false; reason: 'INVALID' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS' | 'INACTIVE' }
    > {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, name: true, role: true, status: true, tenantId: true }
        });

        if (!user) {
            return { ok: false, reason: 'INVALID' };
        }

        // Latest unconsumed code for this user.
        const otp = await prisma.otpCode.findFirst({
            where: { userId: user.id, consumedAt: null },
            orderBy: { createdAt: 'desc' }
        });

        if (!otp) {
            return { ok: false, reason: 'INVALID' };
        }

        if (otp.expiresAt.getTime() < Date.now()) {
            return { ok: false, reason: 'EXPIRED' };
        }

        if (otp.attemptCount >= MAX_ATTEMPTS) {
            return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };
        }

        const isMatch = await AuthService.comparePassword(code, otp.codeHash);
        if (!isMatch) {
            await prisma.otpCode.update({
                where: { id: otp.id },
                data: { attemptCount: { increment: 1 } }
            });
            await AuditService.log({
                action: 'OTP_VERIFY',
                actorId: email,
                tenantId: user.tenantId,
                status: 'FAILURE',
                metadata: { reason: 'Invalid code' }
            }).catch(() => undefined);
            return { ok: false, reason: 'INVALID' };
        }

        // Reject inactive accounts rather than silently logging them in.
        if (!isActiveStatus(user.status)) {
            return { ok: false, reason: 'INACTIVE' };
        }

        // Mark consumed (single-use).
        await prisma.otpCode.update({
            where: { id: otp.id },
            data: { consumedAt: new Date() }
        });

        // Mirror password login: stamp last login, then issue the same session.
        const now = new Date();
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: now },
            select: { id: true, email: true, name: true, role: true, tenantId: true, lastLoginAt: true }
        });

        const { token, user: responseUser } = await AuthService.createSession(updatedUser);

        await AuditService.log({
            action: 'LOGIN_SUCCESS',
            actorId: email,
            tenantId: user.tenantId,
            projectId: responseUser.assignedProjects[0] || undefined,
            actorRole: user.role,
            status: 'SUCCESS',
            metadata: { method: 'OTP' }
        }).catch(() => undefined);

        return { ok: true, token, user: responseUser };
    }
}