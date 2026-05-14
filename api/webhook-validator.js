// =============================================================
// /api/webhook-validator.js
// Za3fran Concept Validator — Stripe Webhook Handler
//
// Flow:
// 1. Receive checkout.session.completed from Stripe
// 2. Verify Stripe signature
// 3. Look up submission in Supabase by email
// 4. Generate report HTML via Claude API (unchanged)
// 5. Extract report_json via Haiku (new — Phase 4)
// 6. Store report HTML + report_json in validator_reports
// 7. Create/upsert za3fran_user + za3fran_project records (new — Phase 4)
// 8. Update submission: status → 'paid', set report_id
// 9. Send delivery email via Brevo
// =============================================================

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { getModel } from '../lib/claude-config.js';  // ← PHASE 4 ADDITION

// ── Clients ──────────────────────────────────────────────────
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Vercel config: disable body parsing (required for Stripe sig verification) ──
export const config = {
  api: {
    bodyParser: false,
  },
};

// ── Helper: read raw body ─────────────────────────────────────
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Helper: generate access code ─────────────────────────────
function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code; // e.g. "K7XMQR4N"
}

// ── Helper: build Claude prompt ───────────────────────────────
function buildReportPrompt(submission) {
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
Format / Type:     ${submission.concept_type || 'Not provided'}
Cuisine:           ${submission.cuisine || 'Not provided'}
Description:       ${submission.description || 'Not provided'}
Differentiation:   ${submission.differentiation || 'Not provided'}

LOCATION & AUDIENCE
City:              ${submission.city || 'Not provided'}
Neighbourhood:     ${submission.neighbourhood || 'Not provided'}
Target Audience:   ${audience}

FINANCIALS
Total Budget:      ${submission.budget || 'Not provided'} ${submission.currency || ''}
Average Ticket:    ${submission.ticket || 'Not provided'} ${submission.currency || ''}
Daily Covers:      ${submission.covers || 'Not provided'}
Seats:             ${submission.seats || 'Not provided'}

OPERATIONS
Opening Hours:     ${submission.opening_hours || 'Not provided'}
Stage:             ${submission.stage || 'Not provided'}
Timeline:          ${submission.timeline || 'Not provided'}

MARKET CONTEXT
Competitors:       ${submission.competitors || 'Not provided'}
Market Gap:        ${submission.market_gap || 'Not provided'}

ADDITIONAL
Notes:             ${submission.additional || 'Not provided'}
Language:          ${submission.language || 'Not provided'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate the full report now. Return only the HTML document, nothing else. Do not stop or abbreviate any section.`;
}

// ── System prompt (imported inline for self-contained file) ───
const SYSTEM_PROMPT = `You are a senior F&B strategy analyst with 20 years of experience evaluating restaurant and food concepts across the MENA region, Europe, and North America. You have advised operators ranging from independent restaurants to multi-unit chains, ghost kitchen networks, and franchise groups. You have worked in Morocco, UAE, France, and the UK. You understand how concepts succeed and fail in emerging markets, and you do not confuse theoretical frameworks with operational reality.

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

// ── Main handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('Failed to read raw body:', err);
    return res.status(400).json({ error: 'Could not read request body' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET_VALIDATOR
    );
  } catch (err) {
    console.error('Stripe signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const session = event.data.object;
  const customerEmail = session.customer_details?.email || session.customer_email;

  if (!customerEmail) {
    console.error('No email found in Stripe session:', session.id);
    return res.status(200).json({ received: true, error: 'No email in session' });
  }

  console.log(`Payment confirmed for: ${customerEmail}, session: ${session.id}`);

  waitUntil(processReport(customerEmail, session.id));
  return res.status(200).json({ received: true });
}

// ── Async report processing ───────────────────────────────────
async function processReport(customerEmail, sessionId) {
  console.log(`[processReport] Starting for: ${customerEmail}, session: ${sessionId}`);

  // ── Step 3: Look up submission ───────────────────────────────
  const { data: submissions, error: fetchError } = await supabase
    .from('validator_submissions')
    .select('*')
    .eq('email', customerEmail)
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1);

  if (fetchError || !submissions || submissions.length === 0) {
    console.error('No matching submission found for:', customerEmail, fetchError);
    return;
  }

  const submission = submissions[0];
  console.log(`Found submission: ${submission.id} for concept: ${submission.concept_name}`);

  // ── Step 4: Generate report HTML via Claude ──────────────────
  let reportHtml;
  const validatorModel = getModel('validator');  // ← PHASE 4: env-driven model

  try {
    console.log(`Calling Claude (${validatorModel}) for report generation...`);
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: validatorModel,
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildReportPrompt(submission),
          },
        ],
      }),
    });

    const anthropicData = await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      throw new Error(`Anthropic API error: ${anthropicData.error?.message || JSON.stringify(anthropicData)}`);
    }

    if (!anthropicData.content || !anthropicData.content[0] || !anthropicData.content[0].text) {
      throw new Error('Anthropic API returned empty content');
    }

    reportHtml = anthropicData.content[0].text.trim();

    if (!reportHtml.startsWith('<!DOCTYPE') && !reportHtml.startsWith('<html')) {
      throw new Error('Anthropic did not return valid HTML. Got: ' + reportHtml.substring(0, 200));
    }

    console.log(`Report HTML generated. Length: ${reportHtml.length} chars`);
  } catch (err) {
    console.error('Claude API report generation failed:', err);
    await supabase
      .from('validator_submissions')
      .update({ status: 'report_error' })
      .eq('id', submission.id);
    return;
  }

  // ── Step 4b: Extract report_json via Haiku (PHASE 4 ADDITION) ─
  // Runs a lean extraction call on the generated HTML.
  // Failure is non-fatal — we save null and continue.
  let reportJson = null;
  try {
    reportJson = await extractReportJson(reportHtml, submission);
    console.log(`report_json extracted successfully.`);
  } catch (err) {
    console.error('[Phase 4] report_json extraction failed (non-fatal):', err.message);
    // Report still saves and delivers — JSON can be backfilled later
  }

  // ── Step 5: Generate access code and store report ────────────
  const accessCode = generateAccessCode();
  const reportId = `rpt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const { error: insertError } = await supabase
    .from('validator_reports')
    .insert({
      id: reportId,
      submission_id: submission.id,
      report_html: reportHtml,
      report_json: reportJson,        // ← PHASE 4: null if extraction failed, populated if successful
      access_code: accessCode,
      created_at: new Date().toISOString(),
    });

  if (insertError) {
    console.error('Failed to store report in Supabase:', insertError);
    return;
  }

  console.log(`Report stored. ID: ${reportId}, Access code: ${accessCode}`);

  // ── Step 5b: Create user + project records (PHASE 4 ADDITION) ─
  // Non-fatal — doesn't affect report delivery if it fails.
  try {
    // Upsert user record (email is unique key)
    let userId = null;
    const { data: existingUser } = await supabase
      .from('za3fran_users')
      .select('id')
      .eq('email', customerEmail)
      .single();

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: newUser } = await supabase
        .from('za3fran_users')
        .insert({
          email: customerEmail,
          name: submission.name || '',
          default_currency: submission.currency || 'EUR',
          default_language: submission.language || 'en',
        })
        .select('id')
        .single();
      userId = newUser?.id || null;
    }

    // Create project record (one per submission)
    if (userId) {
      const { data: existingProject } = await supabase
        .from('za3fran_projects')
        .select('id')
        .eq('validator_submission_id', submission.id)
        .single();

      if (!existingProject) {
        await supabase
          .from('za3fran_projects')
          .insert({
            user_id: userId,
            concept_name: submission.concept_name || 'Untitled',
            validator_submission_id: submission.id,
            currency: submission.currency || 'EUR',
            language: submission.language || 'en',
          });
      }
    }

    console.log(`[Phase 4] User + project records created/verified for ${customerEmail}`);
  } catch (err) {
    console.error('[Phase 4] User/project creation failed (non-fatal):', err.message);
  }

  // ── Step 6: Update submission record ─────────────────────────
  const { error: updateError } = await supabase
    .from('validator_submissions')
    .update({
      status: 'paid',
      report_id: reportId,
    })
    .eq('id', submission.id);

  if (updateError) {
    console.error('Failed to update submission status:', updateError);
  }

  // ── Step 7: Send delivery email via Brevo ────────────────────
  const reportUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/report/${reportId}`;
  const conceptName = submission.concept_name || 'your concept';
  const firstName = submission.name ? submission.name.split(' ')[0] : 'there';

  const isfrench = submission.language === 'fr' ||
    (submission.description && /[àâäéèêëîïôöùûüçœæ]/i.test(submission.description));

  const emailSubject = isfrench
    ? `Votre rapport Za3fran est prêt — ${conceptName}`
    : `Your Za3fran report is ready — ${conceptName}`;

  const emailHtml = isfrench ? `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#FAFAF7;border-radius:4px;overflow:hidden;">

    <div style="background:#0F1F3D;padding:40px;text-align:center;">
      <p style="font-family:Georgia,serif;font-size:28px;color:#C9862A;margin:0;letter-spacing:2px;">ZA3FRAN</p>
      <p style="color:#888880;font-size:12px;margin:8px 0 0;letter-spacing:1px;text-transform:uppercase;">Concept Validator</p>
    </div>

    <div style="padding:48px 40px;">
      <p style="font-family:Georgia,serif;font-size:22px;color:#0F1F3D;margin:0 0 20px;">Bonjour ${firstName},</p>
      <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Votre rapport de validation pour <strong>${conceptName}</strong> est prêt.</p>
      <p style="color:#1a1a1a;line-height:1.75;margin:0 0 32px;">Pour accéder à votre rapport, cliquez sur le bouton ci-dessous et entrez votre code d'accès.</p>

      <div style="text-align:center;margin:0 0 32px;">
        <a href="${reportUrl}" style="display:inline-block;background:#C9862A;color:#FAFAF7;text-decoration:none;padding:16px 40px;font-size:15px;font-weight:600;border-radius:2px;letter-spacing:0.5px;">Accéder à mon rapport →</a>
      </div>

      <div style="background:#f0f0ee;border-radius:4px;padding:24px;text-align:center;margin:0 0 32px;">
        <p style="font-size:12px;color:#888880;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Votre code d'accès</p>
        <p style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:#0F1F3D;margin:0;letter-spacing:4px;">${accessCode}</p>
      </div>

      <p style="color:#888880;font-size:13px;line-height:1.7;margin:0 0 8px;">Conservez ce code — vous en aurez besoin chaque fois que vous ouvrirez votre rapport.</p>
      <p style="color:#888880;font-size:13px;line-height:1.7;margin:0 0 32px;">Lien direct : <a href="${reportUrl}" style="color:#C9862A;">${reportUrl}</a></p>

      <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 32px;">

      <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;"><strong>Prochaine étape :</strong> Votre Business Plan Essentials transforme ce rapport en plan d'affaires complet avec projections financières. <a href="${process.env.NEXT_PUBLIC_BASE_URL}/business-plan?code=${accessCode}" style="color:#C9862A;">Découvrir le Business Plan Essentials →</a></p>

      <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 32px;">

      <p style="color:#1a1a1a;line-height:1.75;margin:0 0 8px;">Pour enregistrer votre rapport en PDF, ouvrez-le dans votre navigateur et utilisez la fonction Imprimer → Enregistrer en PDF.</p>
      <p style="color:#888880;font-size:13px;margin:0;">Des questions ? Écrivez-nous à <a href="mailto:hello@za3fran.io" style="color:#C9862A;">hello@za3fran.io</a></p>
    </div>

    <div style="background:#0F1F3D;padding:24px 40px;text-align:center;">
      <p style="color:#888880;font-size:12px;margin:0;">© Za3fran Consulting · <a href="https://za3fran.io" style="color:#C9862A;text-decoration:none;">za3fran.io</a></p>
    </div>
  </div>
</body>
</html>` : `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#FAFAF7;border-radius:4px;overflow:hidden;">

    <div style="background:#0F1F3D;padding:40px;text-align:center;">
      <p style="font-family:Georgia,serif;font-size:28px;color:#C9862A;margin:0;letter-spacing:2px;">ZA3FRAN</p>
      <p style="color:#888880;font-size:12px;margin:8px 0 0;letter-spacing:1px;text-transform:uppercase;">Concept Validator</p>
    </div>

    <div style="padding:48px 40px;">
      <p style="font-family:Georgia,serif;font-size:22px;color:#0F1F3D;margin:0 0 20px;">Hi ${firstName},</p>
      <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Your validation report for <strong>${conceptName}</strong> is ready.</p>
      <p style="color:#1a1a1a;line-height:1.75;margin:0 0 32px;">Click the button below to access your report. You'll need your access code to open it.</p>

      <div style="text-align:center;margin:0 0 32px;">
        <a href="${reportUrl}" style="display:inline-block;background:#C9862A;color:#FAFAF7;text-decoration:none;padding:16px 40px;font-size:15px;font-weight:600;border-radius:2px;letter-spacing:0.5px;">View my report →</a>
      </div>

      <div style="background:#f0f0ee;border-radius:4px;padding:24px;text-align:center;margin:0 0 32px;">
        <p style="font-size:12px;color:#888880;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Your access code</p>
        <p style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:#0F1F3D;margin:0;letter-spacing:4px;">${accessCode}</p>
      </div>

      <p style="color:#888880;font-size:13px;line-height:1.7;margin:0 0 8px;">Keep this code — you'll need it every time you open your report.</p>
      <p style="color:#888880;font-size:13px;line-height:1.7;margin:0 0 32px;">Direct link: <a href="${reportUrl}" style="color:#C9862A;">${reportUrl}</a></p>

      <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 32px;">

      <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;"><strong>Next step:</strong> Your Business Plan Essentials turns this report into a complete business plan with financial projections. <a href="${process.env.NEXT_PUBLIC_BASE_URL}/business-plan?code=${accessCode}" style="color:#C9862A;">Discover Business Plan Essentials →</a></p>

      <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 32px;">

      <p style="color:#1a1a1a;line-height:1.75;margin:0 0 8px;">To save your report as a PDF, open it in your browser and use Print → Save as PDF.</p>
      <p style="color:#888880;font-size:13px;margin:0;">Questions? Email us at <a href="mailto:hello@za3fran.io" style="color:#C9862A;">hello@za3fran.io</a></p>
    </div>

    <div style="background:#0F1F3D;padding:24px 40px;text-align:center;">
      <p style="color:#888880;font-size:12px;margin:0;">© Za3fran Consulting · <a href="https://za3fran.io" style="color:#C9862A;text-decoration:none;">za3fran.io</a></p>
    </div>
  </div>
</body>
</html>`;

  try {
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: 'Za3fran',
          email: 'hello@za3fran.io',
        },
        to: [{ email: customerEmail, name: submission.name || customerEmail }],
        subject: emailSubject,
        htmlContent: emailHtml,
      }),
    });

    if (!brevoResponse.ok) {
      const brevoError = await brevoResponse.json();
      console.error('Brevo email failed:', brevoError);
    } else {
      console.log(`Delivery email sent to: ${customerEmail}`);
    }
  } catch (err) {
    console.error('Brevo email error:', err);
  }

  console.log(`[processReport] Complete. reportId: ${reportId}`);
}

// ── PHASE 4: Extract structured JSON from HTML via Haiku ──────
// Non-fatal. If extraction fails, report_json is stored as null
// and can be backfilled later when the Supabase row is reprocessed.
async function extractReportJson(reportHtml, submission) {
  // Build concept_snapshot directly from submission data (no extraction needed)
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
  console.log(`[extractReportJson] Calling ${utilityModel} for JSON extraction...`);

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

  if (!extractionResponse.ok || !extractionData.content?.[0]?.text) {
    throw new Error('Extraction API error: ' + JSON.stringify(extractionData).substring(0, 200));
  }

  // Strip any accidental markdown fences
  const jsonText = extractionData.content[0].text.trim()
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
    },
    concept_snapshot: conceptSnapshot,
    overall:          extracted.overall         || {},
    score_breakdown:  extracted.score_breakdown || [],
    sections:         extracted.sections        || {},
    action_plan:      extracted.action_plan     || [],
  };
}
