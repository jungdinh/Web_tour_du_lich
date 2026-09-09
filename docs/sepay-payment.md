# SePay payment integration

The booking flow supports two payment modes:

- `qr`: generates the existing direct VietQR image from the configured bank account.
- `gateway`: uses the official `sepay-pg-node` SDK to create a signed SePay hosted checkout. The checkout is restricted to `BANK_TRANSFER`, so the customer pays by QR/bank transfer.

The backend dependency is installed with:

```powershell
cd web-be
npm install sepay-pg-node
```

## Environment

Keep these values only in `web-be/.env` or Railway variables. Do not commit them.

```dotenv
SEPAY_PAYMENT_MODE=gateway
SEPAY_ENV=sandbox
SEPAY_MERCHANT_ID=your-merchant-id
SEPAY_SECRET_KEY=your-merchant-secret-key
SEPAY_IPN_SECRET_KEY=your-ipn-secret-key
FRONTEND_URL=https://your-frontend.example
```

`SEPAY_IPN_SECRET_KEY` can be omitted when SePay uses the same merchant secret for IPN authentication. Set it explicitly when the SePay dashboard gives you a separate IPN secret.

The merchant ID and keys come from the SePay merchant dashboard. They must never be placed in frontend variables such as `VITE_*`.

## SePay dashboard

Configure the Payment Gateway IPN endpoint as:

```text
https://your-backend.example/api/payments/sepay/ipn
```

Use the secret-key authentication mode and configure the corresponding value in `SEPAY_IPN_SECRET_KEY`.

The legacy account webhook remains available at:

```text
https://your-backend.example/api/payments/sepay/webhook
```

It uses `SEPAY_WEBHOOK_API_KEY` and is independent of the Payment Gateway IPN.

## Request flow

1. The backend validates the booking and calculates the total from the database price.
2. The backend creates a pending booking and signs a checkout form with the SDK.
3. The frontend submits the signed form to SePay without exposing the secret key.
4. SePay redirects the browser to `/payment-result` after the hosted checkout.
5. SePay sends an authenticated IPN to the backend.
6. The backend validates the invoice number, currency, exact amount, payment method, status, expiry, and transaction ID before setting the booking to `paid`.

The browser redirect is never treated as proof of payment. The booking status changes only after a valid IPN.

## Local testing

Use `SEPAY_PAYMENT_MODE=qr` for the existing local demo flow. A real Payment Gateway IPN cannot reach `localhost`; use a public Railway backend or a secure tunnel when testing the sandbox gateway.

After changing backend variables, restart the backend so `dotenv` loads the new values.
