// ============================================================
// /lib/claude-config.js
// Centralized Claude model configuration — env-driven.
// To swap a model: edit the env var in Vercel dashboard → redeploy.
// Never hardcode model strings in individual API files.
// ============================================================

export const MODEL_CONFIG = {
  // Default fallback — used if no per-tool override is set
  default:         process.env.CLAUDE_MODEL_DEFAULT     || 'claude-sonnet-4-6',

  // Per-tool overrides — set in Vercel env vars to override default
  validator:       process.env.CLAUDE_MODEL_VALIDATOR   || null,  // null → uses default
  essentials:      process.env.CLAUDE_MODEL_ESSENTIALS  || null,
  scorecard:       process.env.CLAUDE_MODEL_SCORECARD   || null,  // recommend haiku-4-5 here
  menuEngineer:    process.env.CLAUDE_MODEL_MENU        || null,
  financialBuilder:process.env.CLAUDE_MODEL_FINANCIAL   || null,
  businessPlanPro: process.env.CLAUDE_MODEL_BP_PRO      || null,  // recommend opus for Pro
  orchestrator:    process.env.CLAUDE_MODEL_ORCHESTRATOR|| null,  // recommend opus for orchestrator

  // Utility model — used for cheap extraction/classification tasks (JSON extraction etc.)
  utility:         process.env.CLAUDE_MODEL_UTILITY     || 'claude-haiku-4-5-20251001',
};

/**
 * Get the model to use for a given tool.
 * Falls back to default if no per-tool override is configured.
 *
 * @param {string} toolName - One of: validator, essentials, scorecard, menuEngineer,
 *                            financialBuilder, businessPlanPro, orchestrator, utility
 * @returns {string} Claude model identifier
 */
export function getModel(toolName) {
  return MODEL_CONFIG[toolName] || MODEL_CONFIG.default;
}

// ── REFERENCE: Current recommended models (May 2026) ────────
// Scorecard:            claude-haiku-4-5-20251001   (free tool, keep cost minimal)
// Validator:            claude-sonnet-4-6            (€199 product, quality/cost balance)
// Business Plan Essentials: claude-sonnet-4-6        (€599 product, quality/cost balance)
// Menu Engineer:        claude-sonnet-4-6
// Financial Builder:    claude-sonnet-4-6
// Business Plan Pro:    claude-opus-4-6              (€1499–1999, investor-grade, justifies cost)
// Orchestrator:         claude-opus-4-6              (multi-step reasoning)
// Utility (extraction): claude-haiku-4-5-20251001    (cheap, fast, structured extraction)
