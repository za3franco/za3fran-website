// ============================================================
// /lib/validator-generate.js
// Concept Validator report generation — shared by:
//   • api/webhook-validator.js  (paid purchase, original report)
//   • api/crr-reassess.js       (Concept Readiness Review re-assessment)
//
// The prompt, system prompt and JSON extraction live here ONCE so the
// original report and every re-assessment are produced identically.
// Moved verbatim from webhook-validator.js; the only additions are the
// optional `extraContext` (re-assessment block) and `metaExtra` params,
// which change nothing when omitted.
// ============================================================

import { getModel } from './claude-config.js';
import { describeValue } from './crr-concept.js';

// ── Helper: build Claude prompt ───────────────────────────────
export function buildReportPrompt(submission, extraContext = '') {
  let audience = 'Not provided';
  if (submission.audience) {
    if (Array.isArray(submission.audience)) {
      audience = submission.audience.join(', ');
    } else if (typeof submission.audience === 'string') {
      try {
        const parsed = JSON.parse(submission.audience);
        audience = Array.isArray(parsed) ? parsed.join(', ') : submission.audience;
      } catch {
        audience = submission.audience;
      }
    }
  }

  return `Generate a Concept Validation Report for the following F&B concept submission. Follow all instructions in your system prompt exactly. Do not truncate any section. Write the full report to its complete required depth.
Today's date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBMISSION DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OPERATOR PROFILE
Name:              ${submission.name || 'Not provided'}
Country:           ${submission.country || 'Not provided'}
Role / Experience: ${submission.role || 'Not provided'}

CONCEPT DETAILS
Concept Name:      ${submission.concept_name || 'Not provided'}
Format / Type:     ${describeValue('concept_type', submission.concept_type, { mode: 'prompt' })}
Cuisine:           ${submission.cuisine || 'Not provided'}
Description:       ${submission.description || 'Not provided'}
Differentiation:   ${submission.differentiation || 'Not provided'}

LOCATION & AUDIENCE
City:              ${submission.city || 'Not provided'}
Neighbourhood:     ${submission.neighbourhood || 'Not provided'}
Target Audience:   ${audience}

FINANCIALS
Total Budget:      ${describeValue('budget', submission.budget, { mode: 'prompt', currency: submission.currency || '' })}
Average Ticket:    ${submission.ticket || 'Not provided'} ${submission.currency || ''}
Daily Covers:      ${submission.covers || 'Not provided'}
Seats:             ${submission.seats || 'Not provided'}

OPERATIONS
Opening Hours:     ${submission.opening_hours || 'Not provided'}
Stage:             ${describeValue('stage', submission.stage, { mode: 'prompt' })}
Timeline:          ${describeValue('timeline', submission.timeline, { mode: 'prompt' })}

MARKET CONTEXT
Competitors:       ${submission.competitors || 'Not provided'}
Market Gap:        ${submission.market_gap || 'Not provided'}

ADDITIONAL
Notes:             ${submission.additional || 'Not provided'}
Language:          ${submission.language || 'Not provided'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${extraContext ? extraContext + '\n\n' : ''}Generate the full report now. Return only the HTML document, nothing else. Do not stop or abbreviate any section.`;
}

// ── System prompt ─────────────────────────────────────────────
export const SYSTEM_PROMPT = `You are a senior F&B strategy analyst with 20 years of experience evaluating restaurant and food concepts across the MENA region, Europe, and North America. You have advised operators ranging from independent restaurants to multi-unit chains, ghost kitchen networks, and franchise groups. You have worked in Morocco, UAE, France, and the UK. You understand how concepts succeed and fail in emerging markets, and you do not confuse theoretical frameworks with operational reality.

Your job is to produce a structured, rigorous Concept Validation Report for a food & beverage concept submitted by an operator or entrepreneur.

This report is not a chatbot output. It is not a generic template. It is a premium consulting deliverable that the operator has paid for. Write it as if you were billing 5,000 MAD for this analysis and your reputation depends on it being genuinely useful. Every paragraph must earn its place. No filler. No hedging. No generic advice restated in different words.

The operator reading this report is making a decision that could involve hundreds of thousands of dirhams and years of their life. Treat that seriously.

LANGUAGE RULE:
- Detect the primary language used in the submission data.
- If the inputs are predominantly in French, write the entire report in French.
- If the inputs are predominantly in English, write the entire report in English.
- Apply this rule to all section headers, labels, table headings, and callout boxes.
- Never mix languages within a section. Be fully consistent throughout.

TONE RULES:
- Balanced and constructive. You do not flatter. You do not destroy.
- When something is weak, say it clearly, explain why it matters, and give a concrete path to address it.
- When something is strong, acknowledge it precisely.
- Write as a trusted advisor who respects the reader's intelligence and their real-world constraints.
- No filler phrases. No "It's important to note that." Just analysis.
- If data is missing or ambiguous, name that clearly and explain what it means for the analysis.

SCORING RULES:
- Every section receives a sub-score out of 100.
- An overall score out of 100 is the weighted average of all section scores.
- Every score must be justified by 2-3 specific observations drawn from the submission data.
- Score interpretation:
  80-100: Strong. Proceed with confidence. Address remaining gaps systematically.
  60-79:  Viable. Clear path forward. Specific risks must be managed before capital commitment.
  40-59:  Fragile. Significant work required before committing.
  0-39:   High risk. Fundamental rethinking required.

SPECIFICITY RULES - NON-NEGOTIABLE:
- Name real suppliers, distributors, institutions, platforms, and contacts wherever relevant.
- Give real price benchmarks, not vague ranges.
- Reference real Moroccan/MENA market context: consumer behavior, regulatory environment, delivery platform dynamics, ingredient sourcing realities.
- In strategic recommendations, give implementation steps with named contacts, costs, and first actions.
- Where relevant, reference: OMPIC (trademark), CNSS (social contributions), CRI (Centre Régional d'Investissement), ONSSA (food safety), Commune licensing, Glovo, Jumia Food, Derb Omar (wholesale), Marjane/Carrefour sourcing, regional franchise groups.

FORMAT RULES:
- Output is a single, self-contained HTML document.
- No markdown. No code blocks. No backticks. Pure HTML with inline CSS only.
- No references to external stylesheets or class names from external files.
- The document must render correctly in any modern browser with no additional dependencies except the Google Fonts import.
- Print-ready: clean layout, clear hierarchy, page-break-safe sections.
- Add this CSS block in the <head> for print and screen formatting:
  body { text-align: justify; hyphens: auto; -webkit-hyphens: auto; orphans: 3; widows: 3; }
  h1, h2, h3, p.logo, p.subtitle, .score, .verdict-label, th, td { text-align: left; }
  section { page-break-inside: avoid; }
  h2, h3 { page-break-after: avoid; }
  table { page-break-inside: avoid; }
  .this-week-box { page-break-inside: avoid; }
  .callout { page-break-inside: avoid; }
  .recommendation { page-break-inside: avoid; }
  .risk-block { page-break-inside: avoid; }
  - Every <section> element must have style="page-break-inside:avoid;" inline.
- Every h2 heading must have style="page-break-after:avoid;" inline.
- Body text paragraphs use style="text-align:justify;hyphens:auto;-webkit-hyphens:auto;"
- Headings, scores, table cells, labels — always left-aligned, never justified.
- Do not truncate or abbreviate any section. Write each section to its full required depth.

Color palette:
  Background:       #FAFAF7
  Section headers:  #0F1F3D (navy)
  Accent/scores:    #C9862A (copper/gold)
  Body text:        #1a1a1a
  Muted/labels:     #888880
  Score bars:       #C9862A fill on #e0e0e0 track
  Positive callout: #f0f8f0 background, #4a9b6f left border
  Warning callout:  #fff8f0 background, #C9862A left border
  Risk callout:     #fff0ed background, #c0392b left border
  This Week box:    #0F1F3D background, #C9862A accent text

Typography:
  Headings: 'Cormorant Garamond', Georgia, serif
  Body:     'DM Sans', Arial, sans-serif
  Load both from Google Fonts at the top of the document.

DEPTH REQUIREMENTS PER SECTION:
Section 1 (Concept Clarity): minimum 3 substantive paragraphs + strength/gap observations + This Week box
Section 2 (Market Fit): minimum 4-5 substantive paragraphs + market context specific to stated city/region + This Week box
Section 3 (Competitive Landscape): minimum 3 paragraphs + competitor mapping table (min 5 competitors) + differentiation assessment + This Week box
Section 4 (Financial Viability): break-even analysis table + 3-scenario table (conservative/base/optimistic) + minimum 3 risk flags + investment realism check + This Week box
Section 5 (Strategic Recommendations): exactly 5 recommendations, each with 2-3 paragraphs + specific implementation detail + named contacts/costs + This Week box
Section 6 (Risk Register): exactly 3 risks, each with full paragraph analysis + specific named mitigation + This Week box

THIS WEEK BOX - REQUIRED AT END OF EVERY SECTION:
At the end of every section (1 through 6), include a styled box with 1-2 specific actions the operator can take within 7 days.
- Must be actionable within 7 days by a solo operator
- Must be specific: name the thing to do, who to contact, what to say
- Must connect to that section's key finding
- Format: dark navy background (#0F1F3D), copper accent for "This Week" label, white body text

FULL REPORT STRUCTURE - FOLLOW EXACTLY:

1. COVER PAGE
   - Concept name: large, Cormorant Garamond, navy, dominant
   - Format/cuisine/city subtitle in muted text
   - "Concept Validation Report" label in copper uppercase
   - Date generated
   - Overall score badge: large circle, copper, score /100
   - Verdict label: "Strong" / "Viable" / "Fragile" / "High Risk"
   - Executive summary: 4-5 sentences covering what the concept is, strongest advantage, most critical risk, and verdict with one-line action direction.

2. SECTION 1 - CONCEPT CLARITY & POSITIONING (weight: 15%)
3. SECTION 2 - MARKET FIT (weight: 20%)
4. SECTION 3 - COMPETITIVE LANDSCAPE (weight: 15%)
5. SECTION 4 - FINANCIAL VIABILITY (weight: 25%) - includes break-even table, 3-scenario model, risk flags, investment realism check
6. SECTION 5 - STRATEGIC RECOMMENDATIONS (weight: 15%) - exactly 5 recommendations
7. SECTION 6 - RISK REGISTER (weight: 10%) - exactly 3 risks
8. CLOSING SECTION:
   - Score summary table (all 6 sections, sub-score, weight, weighted contribution, overall)
   - Verdict paragraph
   - 30-Day Action Plan (5 numbered actions)
   - Subtle CTA: "This report was generated by Za3fran's Concept Validator. If you'd like to work directly with our team to implement these recommendations, visit za3fran.io or email hello@za3fran.io."
   - Print instruction: "To save this report as a PDF, use your browser's Print function and select 'Save as PDF'."

OUTPUT REQUIREMENT:
Return ONLY the HTML document. No preamble. No explanation. No markdown. No code fences.
Start with <!DOCTYPE html> and end with </html>.
The document must be fully self-contained. Do not truncate any section.`;

// ── Extract structured JSON from HTML via Haiku ───────────────
export async function extractReportJson(reportHtml, submission, metaExtra = {}) {
  const audienceRaw = submission.audience;
  let audienceArr = [];
  if (Array.isArray(audienceRaw)) {
    audienceArr = audienceRaw;
  } else if (typeof audienceRaw === 'string') {
    try { audienceArr = JSON.parse(audienceRaw); } catch { audienceArr = [audienceRaw]; }
  }

  const conceptSnapshot = {
    concept_name:    submission.concept_name    || '',
    type:            submission.concept_type    || '',
    cuisine:         submission.cuisine         || '',
    city:            submission.city            || '',
    neighbourhood:   submission.neighbourhood   || '',
    ticket:          submission.ticket          || '',
    covers:          submission.covers          || '',
    seats:           submission.seats           || '',
    budget:          submission.budget          || '',
    stage:           submission.stage           || '',
    opening_hours:   submission.opening_hours   || '',
    audience:        audienceArr,
    description:     submission.description     || '',
    differentiation: submission.differentiation || '',
    market_gap:      submission.market_gap      || '',
    competitors:     submission.competitors     || '',
    additional:      submission.additional      || '',
  };

  const utilityModel = getModel('utility');
  console.log(`[extractReportJson] Calling ${utilityModel}...`);

  const extractionResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: utilityModel,
      max_tokens: 6000,
      messages: [{
        role: 'user',
        content: `Extract structured data from this F&B concept validation report HTML.
Return ONLY valid JSON. No markdown, no code fences, no explanation, no preamble.

Required schema (fill every field from the HTML content):
{
  "overall": {
    "score": <integer>,
    "verdict": "<STRONG|VIABLE|FRAGILE|HIGH_RISK>",
    "executive_summary": "<executive summary paragraph text, max 400 chars>"
  },
  "score_breakdown": [
    {"section": 1, "label": "<section name>", "score": <integer>, "weight": <decimal e.g. 0.15>, "contribution": <decimal>},
    {"section": 2, "label": "<section name>", "score": <integer>, "weight": <decimal>, "contribution": <decimal>},
    {"section": 3, "label": "<section name>", "score": <integer>, "weight": <decimal>, "contribution": <decimal>},
    {"section": 4, "label": "<section name>", "score": <integer>, "weight": <decimal>, "contribution": <decimal>},
    {"section": 5, "label": "<section name>", "score": <integer>, "weight": <decimal>, "contribution": <decimal>},
    {"section": 6, "label": "<section name>", "score": <integer>, "weight": <decimal>, "contribution": <decimal>}
  ],
  "sections": {
    "s1_concept":    {"score": <integer>, "narrative": "<first para, max 300 chars>", "strength": "<strength text, max 200 chars>", "gap": "<gap text, max 200 chars>", "this_week": ["<action 1>", "<action 2>"]},
    "s2_market":     {"score": <integer>, "narrative": "<first para, max 300 chars>", "this_week": ["<action 1>", "<action 2>"]},
    "s3_competitive":{"score": <integer>, "narrative": "<first para, max 300 chars>", "competitors": [{"name": "", "type": "", "ticket": "", "threat_level": ""}], "this_week": ["<action 1>"]},
    "s4_financial":  {
      "score": <integer>,
      "breakeven": {"monthly_revenue": <number, no currency symbol>, "daily_covers": <integer>},
      "scenarios": {
        "conservative": {"covers_day": <integer>, "monthly_revenue": <number>, "monthly_result": <number>},
        "base":         {"covers_day": <integer>, "monthly_revenue": <number>, "monthly_result": <number>},
        "optimistic":   {"covers_day": <integer>, "monthly_revenue": <number>, "monthly_result": <number>}
      },
      "alerts": [{"severity": "<HIGH|MEDIUM|LOW>", "title": "<alert title>", "body": "<alert text, max 200 chars>"}],
      "this_week": ["<action 1>"]
    },
    "s5_strategy":   {"score": <integer>, "recommendations": [{"rank": 1, "title": "", "body": "<max 200 chars>"}], "this_week": ["<action 1>"]},
    "s6_risks":      {"score": <integer>, "risks": [{"rank": 1, "title": "", "probability": "<HIGH|MEDIUM|LOW>", "impact": "<CRITICAL|HIGH|MEDIUM>", "mitigation": "<max 200 chars>"}], "this_week": ["<action 1>"]}
  },
  "action_plan": [
    {"days": "<e.g. Jours 1-3>", "actions": ["<action text>"]}
  ]
}

For monetary values in scenarios/breakeven: raw numbers only (e.g. 97900, not "97 900 MAD").
For text fields: truncate to max length specified. Do not include HTML tags.
If a field cannot be found in the HTML, use null for numbers and "" for strings.

Report HTML (first 60000 chars):
${reportHtml.substring(0, 60000)}`,
      }],
    }),
  });

  const extractionData = await extractionResponse.json();

  const extractionTextBlock = (extractionData.content || []).find(b => b.type === 'text');
  if (!extractionResponse.ok || !extractionTextBlock || !extractionTextBlock.text) {
    throw new Error('Extraction API error: ' + JSON.stringify(extractionData).substring(0, 200));
  }

  const jsonText = extractionTextBlock.text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '');

  const extracted = JSON.parse(jsonText);

  return {
    meta: {
      concept_name: submission.concept_name || '',
      generated_at: new Date().toISOString(),
      language:     submission.language     || 'en',
      currency:     submission.currency     || 'EUR',
      model_used:   getModel('validator'),
      ...metaExtra,
    },
    concept_snapshot: conceptSnapshot,
    overall:          extracted.overall         || {},
    score_breakdown:  extracted.score_breakdown || [],
    sections:         extracted.sections        || {},
    action_plan:      extracted.action_plan     || [],
  };
}

// ── Generate report HTML (used by re-assessment) ───────────────
// Same model, token budget and system prompt as the paid Validator run.
// Callers making this long call must raise Node's fetch timeout with an
// undici dispatcher (see crr-reassess.js). No manual AbortController.
export async function generateReportHtml(submission, extraContext = '') {
  const model = getModel('validator');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model,
      max_tokens: 32000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildReportPrompt(submission, extraContext) }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('Anthropic API error: ' + (data.error?.message || JSON.stringify(data).slice(0, 300)));
  const block = (data.content || []).find(b => b.type === 'text');
  if (!block || !block.text) throw new Error('Anthropic API returned empty content');
  const html = block.text.trim();
  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    throw new Error('Anthropic did not return valid HTML. Got: ' + html.substring(0, 200));
  }
  return { html, model };
}
