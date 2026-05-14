// ============================================================
// /lib/currency.js
// Shared currency utility — imported by all tools.
// Single source of truth for currency detection, formatting,
// Stripe price ID resolution, and display prices.
// ============================================================

// ── CURRENCY METADATA ───────────────────────────────────────
export const CURRENCIES = {
  EUR: {
    symbol:   '€',
    code:     'EUR',
    locale:   'fr-FR',
    stripe:   'eur',
    format:   (n) => `€${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0 })}`,
  },
  MAD: {
    symbol:   'MAD',
    code:     'MAD',
    locale:   'fr-MA',
    stripe:   'mad',
    format:   (n) => `MAD ${Number(n).toLocaleString('fr-MA', { minimumFractionDigits: 0 })}`,
  },
  USD: {
    symbol:   '$',
    code:     'USD',
    locale:   'en-US',
    stripe:   'usd',
    format:   (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 })}`,
  },
};

// ── DISPLAY PRICES (human-readable, for UI) ─────────────────
export const DISPLAY_PRICES = {
  validator: {
    EUR: '€199',
    MAD: 'MAD 1 990',
    USD: '$219',
  },
  essentials: {
    EUR: '€599',
    MAD: 'MAD 5 990',
    USD: '$649',
  },
  bundle: {
    EUR: '€699',
    MAD: 'MAD 6 990',
    USD: '$749',
  },
};

// ── STRIPE PRICE IDS ─────────────────────────────────────────
// Set these in Vercel environment variables.
// One per product × currency combination.
export const STRIPE_PRICES = {
  validator: {
    EUR: process.env.STRIPE_PRICE_VALIDATOR_EUR,
    MAD: process.env.STRIPE_PRICE_VALIDATOR_MAD,
    USD: process.env.STRIPE_PRICE_VALIDATOR_USD,
  },
  essentials: {
    EUR: process.env.STRIPE_PRICE_ESSENTIALS_EUR,  // ← create in Stripe, add to Vercel env
    MAD: process.env.STRIPE_PRICE_ESSENTIALS_MAD,  // ← create in Stripe, add to Vercel env
    USD: process.env.STRIPE_PRICE_ESSENTIALS_USD,  // ← create in Stripe, add to Vercel env
  },
  bundle: {
    EUR: process.env.STRIPE_PRICE_BUNDLE_EUR,       // ← create in Stripe, add to Vercel env
    MAD: process.env.STRIPE_PRICE_BUNDLE_MAD,       // ← create in Stripe, add to Vercel env
    USD: process.env.STRIPE_PRICE_BUNDLE_USD,       // ← create in Stripe, add to Vercel env
  },
};

// ── HELPERS ──────────────────────────────────────────────────

/**
 * Get the Stripe price ID for a product + currency.
 * Falls back to EUR if the requested currency price is not set.
 */
export function getPriceId(product, currency) {
  const prices = STRIPE_PRICES[product];
  if (!prices) throw new Error(`Unknown product: ${product}`);
  return prices[currency] || prices['EUR'];
}

/**
 * Format a numeric amount in the given currency.
 * e.g. formatAmount(1990, 'MAD') → 'MAD 1 990'
 */
export function formatAmount(amount, currency) {
  const c = CURRENCIES[currency] || CURRENCIES['EUR'];
  return c.format(amount);
}

/**
 * Get the human-readable display price for a product + currency.
 * e.g. getDisplayPrice('essentials', 'MAD') → 'MAD 5 990'
 */
export function getDisplayPrice(product, currency) {
  return DISPLAY_PRICES[product]?.[currency] || DISPLAY_PRICES[product]?.['EUR'] || '';
}

/**
 * Validate a currency code. Returns 'EUR' if invalid.
 */
export function normalizeCurrency(currency) {
  return ['EUR', 'MAD', 'USD'].includes(currency) ? currency : 'EUR';
}
