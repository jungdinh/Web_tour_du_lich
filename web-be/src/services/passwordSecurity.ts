import crypto from 'node:crypto';

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 24;
const PWNED_PASSWORDS_URL = 'https://api.pwnedpasswords.com/range';

export class PasswordSecurityError extends Error {
  constructor(
    message: string,
    public readonly code: 'WEAK_PASSWORD' | 'PASSWORD_COMPROMISED' | 'PASSWORD_CHECK_UNAVAILABLE',
    public readonly status: number,
  ) {
    super(message);
    this.name = 'PasswordSecurityError';
  }
}

const validatePasswordFormat = (password: string) => {
  const isStrong = password.length >= MIN_PASSWORD_LENGTH
    && password.length <= MAX_PASSWORD_LENGTH
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);

  if (isStrong) return;

  throw new PasswordSecurityError(
    'Mật khẩu phải dài 12-24 ký tự và có chữ hoa, số, ký tự đặc biệt.',
    'WEAK_PASSWORD',
    400,
  );
};

const getPwnedPasswordCount = async (password: string) => {
  const hash = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  let response: Response;
  try {
    response = await fetch(`${PWNED_PASSWORDS_URL}/${prefix}`, {
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'TourAI-Password-Security/1.0',
      },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new PasswordSecurityError(
      'Chưa thể kiểm tra độ an toàn của mật khẩu. Vui lòng thử lại sau.',
      'PASSWORD_CHECK_UNAVAILABLE',
      503,
    );
  }

  if (!response.ok) {
    throw new PasswordSecurityError(
      'Chưa thể kiểm tra độ an toàn của mật khẩu. Vui lòng thử lại sau.',
      'PASSWORD_CHECK_UNAVAILABLE',
      503,
    );
  }

  const match = (await response.text())
    .split(/\r?\n/)
    .map((line) => line.split(':'))
    .find(([candidateSuffix]) => candidateSuffix === suffix);

  return match ? Number(match[1]) || 0 : 0;
};

export const assertStrongPassword = async (password: string) => {
  validatePasswordFormat(password);
  const pwnedCount = await getPwnedPasswordCount(password);

  if (pwnedCount > 0) {
    throw new PasswordSecurityError(
      'Mật khẩu này đã xuất hiện trong dữ liệu rò rỉ. Vui lòng chọn mật khẩu khác.',
      'PASSWORD_COMPROMISED',
      400,
    );
  }
};
