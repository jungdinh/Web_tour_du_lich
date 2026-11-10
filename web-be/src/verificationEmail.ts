import nodemailer from 'nodemailer';
import { getSmtpConfig } from './services/email.js';

const escapeHtml = (value: string) => value.replace(
  /[&<>"']/g,
  (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] || character),
);

interface VerificationEmailInput { to: string; name: string; code: string }

export const sendVerificationEmail = async ({ to, name, code }: VerificationEmailInput) => {
  const provider = (process.env.EMAIL_PROVIDER || 'console').trim().toLowerCase();
  if (provider === 'console') {
    console.log(`[EmailVerification] Development code for ${to}: ${code}`);
    return;
  }
  if (provider !== 'smtp') throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);

  const smtpConfig = getSmtpConfig(process.env);
  const transporter = nodemailer.createTransport(smtpConfig);
  const fromAddress = process.env.SMTP_FROM?.trim() || smtpConfig.auth.user;
  const fromName = process.env.SMTP_FROM_NAME?.trim() || 'Vivu';
  const expirationMinutes = process.env.EMAIL_VERIFICATION_EXPIRES_MINUTES || '10';

  await transporter.sendMail({
    from: { name: fromName, address: fromAddress },
    to,
    subject: 'M\u00e3 x\u00e1c minh t\u00e0i kho\u1ea3n Vivu',
    text: `Xin ch\u00e0o ${name}, m\u00e3 x\u00e1c minh Vivu c\u1ee7a b\u1ea1n l\u00e0 ${code}. M\u00e3 c\u00f3 hi\u1ec7u l\u1ef1c trong ${expirationMinutes} ph\u00fat.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937"><h2>X\u00e1c minh t\u00e0i kho\u1ea3n Vivu</h2><p>Xin ch\u00e0o ${escapeHtml(name)},</p><p>M\u00e3 x\u00e1c minh c\u1ee7a b\u1ea1n l\u00e0:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#0f766e">${code}</p><p>M\u00e3 c\u00f3 hi\u1ec7u l\u1ef1c trong ${expirationMinutes} ph\u00fat.</p><p>N\u1ebfu b\u1ea1n kh\u00f4ng th\u1ef1c hi\u1ec7n \u0111\u0103ng k\u00fd, h\u00e3y b\u1ecf qua email n\u00e0y.</p></div>`,
  });
};
