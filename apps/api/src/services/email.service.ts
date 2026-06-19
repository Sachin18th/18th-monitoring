/**
 * Email sender for transactional mail (currently: OTP login codes).
 *
 * Transport: SMTP via nodemailer, sending through an authenticated mailbox
 * (e.g. mail.18thdigitech.net). This matches the working reference project,
 * which delivers OTP to arbitrary recipients by relaying through its own
 * authenticated mail server rather than a provider whose domain isn't verified.
 *
 * Configuration (see apps/api/.env.example):
 *   - SMTP_HOST  : SMTP server host, e.g. mail.18thdigitech.net
 *   - SMTP_PORT  : SMTP port (465 = implicit TLS, otherwise STARTTLS)
 *   - SMTP_USER  : authentication username (full mailbox address)
 *   - SMTP_PASS  : authentication password
 *   - FROM_EMAIL : "from" header, e.g. "Gravity <itsupport@18thdigitech.net>"
 *                  (falls back to EMAIL_FROM, then SMTP_USER)
 *
 * Dev fallback: when SMTP is not configured and NODE_ENV is not "production",
 * the message is logged to the server console instead of being sent, so local
 * OTP flows remain testable. Credentials are read from the environment and are
 * never hardcoded.
 */

import nodemailer, { type Transporter } from 'nodemailer';

export interface SendEmailInput {
    to: string;
    subject: string;
    html: string;
}

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        return null;
    }

    if (!cachedTransporter) {
        const port = Number(SMTP_PORT) || 587;
        cachedTransporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port,
            secure: port === 465, // implicit TLS for 465, STARTTLS otherwise
            auth: { user: SMTP_USER, pass: SMTP_PASS }
        });
    }

    return cachedTransporter;
}

export class EmailService {
    static isConfigured(): boolean {
        return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    }

    static async send({ to, subject, html }: SendEmailInput): Promise<boolean> {
        const from = process.env.FROM_EMAIL || process.env.EMAIL_FROM || process.env.SMTP_USER;
        const transporter = getTransporter();

        if (!transporter || !from) {
            if (process.env.NODE_ENV !== 'production') {
                // Dev fallback: surface the email instead of sending it.
                console.log(`[EMAIL][dev] SMTP not configured — would send to ${to}: ${subject}`);
                return true;
            }
            console.error('[EMAIL] SMTP_HOST/SMTP_USER/SMTP_PASS not configured — cannot send email');
            return false;
        }

        try {
            const info = await transporter.sendMail({ from, to, subject, html });
            console.log(`[EMAIL] SMTP sent to ${to} (messageId=${info.messageId}, accepted=${JSON.stringify(info.accepted)})`);
            return true;
        } catch (err) {
            console.error('[EMAIL] SMTP send failed:', err);
            return false;
        }
    }
}