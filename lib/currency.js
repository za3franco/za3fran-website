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
  // Returning Validator customer buying BP standalone — loyalty price
  essentials_returning: {
    EUR: '€499',
    MAD: 'MAD 4 990',
    USD: '$549',
  },
  // New user buying Validator + BP together — bundle price
  bundle: {
    EUR: '€699',
    MAD: 'MAD 6 990',
    USD: '$749',
  },
  // List price anchor shown in UI copy (crossed out) — no Stripe price needed
  essentials_list: {
    EUR: '€599',
    MAD: 'MAD 5 990',
    USD: '$649',
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
  // Returning Validator customer — loyalty price €499
  essentials_returning: {
    EUR: process.env.STRIPE_PRICE_ESSENTIALS_EUR,   // ← €499 price IDs
    MAD: process.env.STRIPE_PRICE_ESSENTIALS_MAD,   // ← MAD 4,990 price IDs
    USD: process.env.STRIPE_PRICE_ESSENTIALS_USD,   // ← $549 price IDs
  },
  // New user bundle — Validator + BP Essentials €699
  bundle: {
    EUR: process.env.STRIPE_PRICE_BUNDLE_EUR,
    MAD: process.env.STRIPE_PRICE_BUNDLE_MAD,
    USD: process.env.STRIPE_PRICE_BUNDLE_USD,
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
 * e.g. getDisplayPrice('bundle', 'MAD') → 'MAD 6 990'
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
