# YouCan Pay — payments in MAD (live since 11 Nov 2026)

Why: Stripe cannot charge most Moroccan domestic cards in dirhams. Visitors located in
Morocco (api/currency.js: MAD_COUNTRIES = ['MA']) see MAD prices and pay on YouCan Pay's
page; everyone else pays in EUR or USD on Stripe. Algeria, Tunisia, Libya, Egypt and
Mauritania pay in EUR on Stripe (decided by Arnaud, 10 Nov 2026).

Code: lib/youcanpay.js (ycp-1.0.0), lib/payments.js (pay-1.1.0), lib/payment-fulfil.js
(pf-1.0.0), api/webhook-youcanpay.js; table `payments` (migration 20261110_payments_youcanpay.sql,
RLS on, no policies). Tests: tests/youcanpay.test.js.

Confirmation: two paths, both re-read the transaction from YouCan's API and claim the row
atomically (pending → paid), so an order is fulfilled once:
- return page: success.html?pay=<id>&transaction_id=… → /api/checkout-status (YouCan adds transaction_id);
- webhook: POST /api/webhook-youcanpay, X-YOUCANPAY-SIGNATURE = HMAC-SHA256(raw body, private key).
Validator failure after payment: e-mail to hello@za3fran.io with /api/webhook-youcanpay?recover=<payment id>.

Vercel env (production): YOUCANPAY_PRIVATE_KEY (live), YOUCANPAY_SANDBOX=false,
MAD_PAYMENT_PROVIDER=youcanpay (any other value → MAD back on Stripe),
YOUCANPAY_TEST_EMAIL + YOUCANPAY_TEST_AMOUNT_MAD (live test price for that e-mail only; 0 = off).

YouCan Pay account (Za3fran Consulting SARL, verified 11 Nov 2026), live mode:
- Paramètres → Paramètres de paiement: success URL https://www.za3fran.io/success.html,
  error URL https://www.za3fran.io/validator, allowed hosts za3fran.io / www.za3fran.io
  (without them the payment page says "Please update your account success URL or error URL").
- Développeurs → Webhooks: https://www.za3fran.io/api/webhook-youcanpay (both modes).
- Fees: 3.9 % + 2 MAD (Moroccan cards), 4.9 % + 2 MAD (foreign cards); 30 % held 28 days;
  daily limit 5,000 MAD by default — raise requested (packs at 5,990 and 8,490 MAD exceed it).

Tests: sandbox 10 Nov 2026 (1,990 MAD, card 4242…, report delivered); live 11 Nov 2026
(10 MAD test price, Moroccan card, return + signed webhook both received, single delivery).
