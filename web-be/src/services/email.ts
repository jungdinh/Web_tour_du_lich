const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));

interface VerificationEmailInput {
  to: string;
  name: string;
  code: string;
}

export const sendVerificationEmail = async ({ to, name, code }: VerificationEmailInput) => {
  const provider = (process.env.EMAIL_PROVIDER || 'console').trim().toLowerCase();
  if (provider === 'console') {
    console.log(`[EmailVerification] Development code for ${to}: ${code}`);
    return;
  }

  if (provider !== 'resend') {
    throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error('RESEND_API_KEY and MAIL_FROM are required.');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Mã xác minh tài khoản TourAI',
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937"><h2>Xác minh tài khoản TourAI</h2><p>Xin chào ${escapeHtml(name)},</p><p>Mã xác minh của bạn là:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#0f766e">${code}</p><p>Mã có hiệu lực trong ${process.env.EMAIL_VERIFICATION_EXPIRES_MINUTES || 10} phút.</p><p>Nếu bạn không thực hiện đăng ký, hãy bỏ qua email này.</p></div>`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email provider failed (${response.status}): ${detail.slice(0, 300)}`);
  }
};