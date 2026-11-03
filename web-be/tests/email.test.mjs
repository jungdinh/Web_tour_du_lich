import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { getSmtpConfig } = require('../dist/services/email.js');

test('uses STARTTLS defaults for Gmail port 587', () => {
  const config = getSmtpConfig({
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'sender@gmail.com',
    SMTP_PASS: 'app-password',
  });

  assert.equal(config.host, 'smtp.gmail.com');
  assert.equal(config.port, 587);
  assert.equal(config.secure, false);
  assert.equal(config.requireTLS, true);
  assert.deepEqual(config.auth, {
    user: 'sender@gmail.com',
    pass: 'app-password',
  });
});

test('uses implicit TLS defaults for port 465', () => {
  const config = getSmtpConfig({
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'sender@gmail.com',
    SMTP_PASS: 'app-password',
  });

  assert.equal(config.port, 465);
  assert.equal(config.secure, true);
  assert.equal(config.requireTLS, false);
});

test('rejects missing SMTP credentials', () => {
  assert.throws(
    () => getSmtpConfig({ SMTP_HOST: 'smtp.gmail.com' }),
    /SMTP_USER and SMTP_PASS are required/,
  );
});
