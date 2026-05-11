// =============================================================
// /api/webhook-validator.js
// Za3fran Concept Validator — Stripe Webhook Handler
//
// Flow:
// 1. Receive checkout.session.completed from Stripe
// 2. Verify Stripe signature
// 3. Look up submission in Supabase by email
// 4. Generate report via Claude API
// 5. Store report HTML in validator_reports table
// 6. Update submission: status → 'paid', set report_id
// 7. Send delivery email via Brevo
// =============================================================

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

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

  // ── Step 1: Read raw body and verify Stripe signature ────────
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

  // ── Step 2: Only handle checkout.session.completed ───────────
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const session = event.data.object;
  const customerEmail = session.customer_details?.email || session.customer_email;

  if (!customerEmail) {
    console.error('No email found in Stripe session:', session.id);
    return res.status(200).json({ received: true, error: 'No email in session' });
  }

  console.log(`Processing payment for: ${customerEmail}, session: ${session.id}`);

  // ── Step 3: Look up submission in Supabase ───────────────────
  // Find the most recent pending submission for this email
  const { data: submissions, error: fetchError } = await supabase
    .from('validator_submissions')
    .select('*')
    .eq('email', customerEmail)
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1);

  if (fetchError || !submissions || submissions.length === 0) {
    console.error('No matching submission found for:', customerEmail, fetchError);
    // Still return 200 to Stripe — don't retry
    return res.status(200).json({ received: true, error: 'Submission not found' });
  }

  const submission = submissions[0];
  console.log(`Found submission: ${submission.id} for concept: ${submission.concept_name}`);

  // ── Step 4: Generate report via Claude API ───────────────────
  let reportHtml;
  try {
    console.log('Calling Claude API for report generation...');
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
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

    console.log(`Report generated successfully. Length: ${reportHtml.length} chars`);
  } catch (err) {
    console.error('Claude API report generation failed:', err);
    // Mark submission as error so we can retry manually
    await supabase
      .from('validator_submissions')
      .update({ status: 'report_error' })
      .eq('id', submission.id);
    return res.status(200).json({ received: true, error: 'Report generation failed' });
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
      access_code: accessCode,
      created_at: new Date().toISOString(),
    });

  if (insertError) {
    console.error('Failed to store report in Supabase:', insertError);
    return res.status(200).json({ received: true, error: 'Report storage failed' });
  }

  console.log(`Report stored. ID: ${reportId}, Access code: ${accessCode}`);

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
    // Non-fatal — report is already stored, continue to email
  }

  // ── Step 7: Send delivery email via Brevo ────────────────────
  const reportUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/report/${reportId}`;
  const conceptName = submission.concept_name || 'your concept';
  const firstName = submission.name ? submission.name.split(' ')[0] : 'there';

  // Detect language for bilingual email
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
          email: 'hello@za3fran.io', // ← must be verified sender in Brevo
        },
        to: [{ email: customerEmail, name: submission.name || customerEmail }],
        subject: emailSubject,
        htmlContent: emailHtml,
      }),
    });

    if (!brevoResponse.ok) {
      const brevoError = await brevoResponse.json();
      console.error('Brevo email failed:', brevoError);
      // Non-fatal — report is stored, operator can resend manually
    } else {
      console.log(`Delivery email sent to: ${customerEmail}`);
    }
  } catch (err) {
    console.error('Brevo email error:', err);
    // Non-fatal — continue
  }

  console.log(`Webhook complete. Submission ${submission.id} processed successfully.`);
  return res.status(200).json({ received: true, success: true, reportId });
}
