import { OtpService } from '../services/otp.service';
import { successResponse, errorResponse } from '../utils/response';

/**
 * POST /api/v1/auth/otp/request
 * Always returns a generic success (account-enumeration safe).
 */
export const requestOtp = async (req: any, reply: any) => {
    const email = String(req.body?.email || '').trim();

    if (!email) {
        return reply.code(400).send(errorResponse('Email is required', 'VALIDATION_ERROR'));
    }

    try {
        await OtpService.requestOtp(email);
    } catch (err) {
        // Do not leak internal errors in a way that reveals account state.
        console.error('[OTP] requestOtp error:', err);
    }

    return reply.code(200).send(
        successResponse({ message: 'If an account exists for that email, a code has been sent.' })
    );
};

/**
 * POST /api/v1/auth/otp/verify
 * On success issues the same session shape as password login.
 */
export const verifyOtp = async (req: any, reply: any) => {
    const email = String(req.body?.email || '').trim();
    const code = String(req.body?.code || '').trim();

    if (!email || !code) {
        return reply.code(400).send(errorResponse('Email and code are required', 'VALIDATION_ERROR'));
    }

    const result = await OtpService.verifyOtp(email, code);

    if (!result.ok) {
        switch (result.reason) {
            case 'EXPIRED':
                return reply.code(401).send(errorResponse('Code has expired. Request a new one.', 'OTP_EXPIRED'));
            case 'TOO_MANY_ATTEMPTS':
                return reply
                    .code(429)
                    .send(errorResponse('Too many attempts. Request a new code.', 'OTP_TOO_MANY_ATTEMPTS'));
            case 'INACTIVE':
                return reply
                    .code(403)
                    .send(errorResponse('Your account is not active. Contact your administrator.', 'ACCOUNT_INACTIVE'));
            case 'INVALID':
            default:
                return reply.code(401).send(errorResponse('Invalid or expired code', 'OTP_INVALID'));
        }
    }

    return reply.code(200).send(successResponse({ token: result.token, user: result.user }));
};