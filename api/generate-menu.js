// ============================================================
// /api/generate-menu.js
// Menu Engineer generation pipeline. Triggered on-demand by
// report-menu-viewer.js (fire-and-forget via waitUntil) the first
// time a customer opens their report.
//
// 4-pass Claude generation:
//   Pass 1 — menu architecture (sections, item counts, brand direction)
//   Pass 2 — item list + descriptions, written in brand voice
//   Pass 3 — costing data (benchmark ingredient costs, food cost %, margin)
//   Pass 4 — strategy report HTML (the permanent-link deliverable)
//
// Two non-AI build steps follow:
//   - Branded menu HTML is templated in code (not Claude-generated)
//     using design tokens per visual_style, for print-CSS reliability.
//   - Costed recipe matrix is built as a real XLSX workbook (SheetJS)
//     and uploaded to Supabase Storage.
//
// Runs synchronously within the 300s Vercel maxDuration budget —
// no separate polling needed inside this file itself.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { getModel } from '../lib/claude-config.js';
import * as XLSX from 'xlsx';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STORAGE_BUCKET = 'menu-engineer-deliverables';

export const config = { api: { bodyParser: true } };

// ── Design tokens per visual style (drives the templated menu doc) ──
const STYLE_TOKENS = {
  modern_minimal: {
    primary: '#1a1a1a', accent: '#888880', bg: '#FAFAF7',
    headingFont: "'Helvetica Neue', Arial, sans-serif",
    bodyFont: "'Helvetica Neue', Arial, sans-serif",
    density: 'spacious', sectionCase: 'uppercase', letterSpacing: '0.12em',
  },
  warm_artisanal: {
    primary: '#5C3A21', accent: '#C2714F', bg: '#FBF6EE',
    headingFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "'Trebuchet MS', sans-serif",
    density: 'medium', sectionCase: 'capitalize', letterSpacing: '0.04em',
  },
  bold_contemporary: {
    primary: '#0a0a0a', accent: '#C9862A', bg: '#FAFAF7',
    headingFont: "Impact, 'Arial Narrow', sans-serif",
    bodyFont: "Arial, sans-serif",
    density: 'compact', sectionCase: 'uppercase', letterSpacing: '0.06em',
  },
  elegant_refined: {
    primary: '#0F1F3D', accent: '#C9862A', bg: '#FAFAF7',
    headingFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "'Helvetica Neue', Arial, sans-serif",
    density: 'spacious', sectionCase: 'capitalize', letterSpacing: '0.08em',
  },
  casual_vibrant: {
    primary: '#7A3B1D', accent: '#E8A93A', bg: '#FFFBF2',
    headingFont: "'Comic Sans MS', 'Trebuchet MS', sans-serif",
    bodyFont: "'Trebuchet MS', sans-serif",
    density: 'medium', sectionCase: 'capitalize', letterSpacing: '0.02em',
  },
};

const DENSITY_SPACING = {
  spacious: { itemGap: '28px', sectionGap: '56px', padding: '48px' },
  medium:   { itemGap: '20px', sectionGap: '42px', padding: '36px' },
  compact:  { itemGap: '14px', sectionGap: '32px', padding: '28px' },
};

// ── Anthropic API call helpers ────────────────────────────────
async function callClaude(model, systemPrompt, userPrompt, maxTokens, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error('Anthropic API error: ' + (data.error?.message || JSON.stringify(data)));
    }
    // Sonnet 5 uses adaptive thinking by default, which can insert a
    // "thinking" content block before the actual text block — never
    // assume content[0] is the text; find it by type instead.
    const textBlock = (data.content || []).find((block) => block.type === 'text');
    if (!textBlock || !textBlock.text) {
      throw new Error('Anthropic API returned empty content');
    }
    return textBlock.text.trim();
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonResponse(text) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

// ── PASS 1: Menu architecture ───────────────────────────────────
async function generateArchitecture(model, concept, intake, currency, language) {
  const system = `You are a senior menu engineering consultant working across MENA and European F&B markets. You design menu architecture — section structure, item counts, and balance — for restaurant concepts based on their positioning, cuisine, and target audience. Return ONLY valid JSON, no markdown, no preamble.`;

  const user = `Design the menu architecture for this concept. Return JSON matching exactly this schema:
{
  "sections": [{"name": "<section name, in ${language === 'fr' ? 'French' : 'English'}>", "item_count": <integer>, "rationale": "<why this section and count, max 150 chars>"}],
  "inferred_brand": {
    "primary_color_hex": "<hex color that fits the concept, e.g. #C2714F>",
    "voice_description": "<3-4 words describing the writing voice, e.g. 'direct, appetite-driven, concise'>"
  },
  "total_items": <integer, sum of all section item_count>
}

CONCEPT DATA:
Concept name: ${concept.concept_name || 'Not provided'}
Type/format: ${concept.type || 'Not provided'}
Cuisine: ${concept.cuisine || 'Not provided'}
City: ${concept.city || 'Not provided'}
Target ticket: ${concept.ticket || 'Not provided'} ${currency}
Audience: ${Array.isArray(concept.audience) ? concept.audience.join(', ') : (concept.audience || 'Not provided')}
Positioning/description: ${concept.description || 'Not provided'}
Differentiation: ${concept.differentiation || 'Not provided'}

BRAND PREFERENCES (from customer form — use if provided, otherwise infer from concept):
Visual style: ${intake.visual_style || 'not specified — infer from concept'}
Brand color: ${intake.brand_color || 'not specified — infer from concept'}
Brand references: ${intake.brand_refs || 'none provided'}
Specific requests: ${intake.additional_notes || 'none'}

Design 3-6 sections appropriate to this concept type and cuisine. Total items should be realistic for the format (a fast-casual concept needs fewer items than a full-service restaurant). Return ONLY the JSON object.`;

  const text = await callClaude(model, system, user, 3000, 40000);
  return parseJsonResponse(text);
}

// ── PASS 2: Menu items in brand voice ───────────────────────────
async function generateItems(model, concept, intake, architecture, language) {
  const system = `You are a menu writer who crafts item names and descriptions that match a restaurant's brand voice exactly. You never write generic, interchangeable menu copy — every item name and description should feel specific to this concept. Return ONLY valid JSON, no markdown, no preamble.`;

  const sectionList = architecture.sections.map((s) => `- ${s.name}: ${s.item_count} items`).join('\n');

  const user = `Write the full menu item list for this concept, in ${language === 'fr' ? 'French' : 'English'}. Return JSON matching exactly this schema:
{
  "items": [
    {
      "section": "<must match a section name from the list below exactly>",
      "name": "<item name in brand voice>",
      "description": "<1-2 line description in brand voice>",
      "ingredients": ["<ingredient 1>", "<ingredient 2>", "..."],
      "suggested_price": <number, no currency symbol, realistic for the stated ticket>
    }
  ]
}

CONCEPT: ${concept.concept_name || 'Concept'} — ${concept.cuisine || ''} ${concept.type || ''} in ${concept.city || ''}
POSITIONING: ${concept.description || 'Not provided'}
TARGET TICKET: ${concept.ticket || 'Not provided'}
BRAND VOICE: ${architecture.inferred_brand?.voice_description || 'Match the concept positioning'}
BRAND REFERENCES: ${intake.brand_refs || 'None — infer from concept'}

SECTIONS TO FILL (write exactly this many items per section):
${sectionList}

List 3-6 realistic ingredients per item (used for costing in the next step). Prices should be realistic for a ${concept.ticket || 'mid-range'} ticket concept. Return ONLY the JSON object — write every item, do not truncate.`;

  const text = await callClaude(model, system, user, 6000, 60000);
  return parseJsonResponse(text);
}

// ── PASS 3: Costing data ────────────────────────────────────────
async function generateCosting(model, items, currency, language) {
  const system = `You are an F&B cost accountant specializing in MENA and European restaurant benchmarks. You estimate realistic ingredient costs and compute food cost percentages. Every cost you provide is a clearly-labeled benchmark estimate, not a real supplier quote. Return ONLY valid JSON, no markdown, no preamble.`;

  const itemList = items.items.map((it, i) =>
    `${i + 1}. ${it.name} (${it.section}) — ingredients: ${it.ingredients.join(', ')} — suggested price: ${it.suggested_price}`
  ).join('\n');

  const user = `Estimate costing for every menu item below, in ${currency}. Return JSON matching exactly this schema:
{
  "costed_items": [
    {
      "name": "<must match item name exactly>",
      "ingredient_costs": [{"ingredient": "<name>", "estimated_cost": <number>}],
      "total_food_cost": <number, sum of ingredient costs>,
      "target_selling_price": <number, may adjust from suggested price if needed>,
      "food_cost_percent": <number, e.g. 28.5>,
      "gross_margin": <number, selling price minus food cost>
    }
  ],
  "summary": {
    "overall_food_cost_percent": <number, weighted average>,
    "weighted_average_margin": <number>,
    "top_3_cost_drivers": ["<ingredient or item name>", "...", "..."]
  }
}

ITEMS TO COST:
${itemList}

Target food cost percentage should generally fall between 25-35% depending on item type. All monetary values in ${currency}, raw numbers only (no currency symbols). Return ONLY the JSON object — cost every item, do not truncate.`;

  const text = await callClaude(model, system, user, 6000, 55000);
  return parseJsonResponse(text);
}

// ── PASS 4: Strategy report HTML ────────────────────────────────
function buildStrategyReportSystemPrompt(language) {
  return `You are a senior F&B menu strategy consultant. You produce a premium consulting deliverable — the Menu Strategy Report — that explains the reasoning behind a menu, not just the menu itself. This is a paid deliverable; write it as if billing for genuine expertise.

LANGUAGE: Write the entire report in ${language === 'fr' ? 'French' : 'English'}. Be fully consistent — never mix languages.

TONE: Direct, specific, no filler. Balanced — name real strengths and real gaps.

FORMAT RULES — NON-NEGOTIABLE:
- Output is a single, self-contained HTML document. No markdown, no code fences, no backticks.
- Pure HTML with inline CSS only. No external stylesheets except the Google Fonts import.
- Print-ready. Apply this exact CSS block in the <head>:
  body { text-align: justify; hyphens: auto; -webkit-hyphens: auto; orphans: 3; widows: 3; }
  h1, h2, h3, p.logo, p.subtitle, th, td { text-align: left; }
  section { page-break-inside: avoid; page-break-before: always; }
  section:first-of-type { page-break-before: avoid; }
  h2, h3 { page-break-after: avoid; }
  table { page-break-inside: avoid; }
  .callout { page-break-inside: avoid; }
- Every <section> needs style="page-break-inside:avoid;" inline (except the cover, which needs no page-break-before).
- Color palette: Background #FAFAF7, section headers #0F1F3D (navy), accent #C9862A (copper), body text #1a1a1a, muted #888880.
- Typography: Headings 'Cormorant Garamond', Georgia, serif — load from Google Fonts. Body 'DM Sans', Arial, sans-serif.
- Do not truncate any section.

REQUIRED STRUCTURE:
1. COVER: Concept name (large, serif, navy), "Menu Strategy Report" label in copper uppercase, date.
2. MENU ARCHITECTURE RATIONALE: why these sections, this item count, this balance — 2-3 paragraphs.
3. PRICING STRATEGY: how price points relate to the target ticket and market context — 2-3 paragraphs, reference the actual pricing data provided.
4. LOCAL SOURCING RECOMMENDATIONS: specific ingredients to source locally in the stated region/city, naming real markets/suppliers where relevant (for Morocco: Derb Omar, regional souks, Marjane/Carrefour sourcing).
5. MENU ENGINEERING PREVIEW: a table projecting which items are likely Stars / Plowhorses / Puzzles / Dogs based on the cost/price/positioning data, with brief rationale.
6. GAP ANALYSIS: 3 items to consider adding (market gaps), 2 items to reconsider (risk flags), each with 1-2 sentence rationale.
7. THIS WEEK BOX: 2 immediate actions, styled with dark navy background and copper accent text.
8. BRAND IDENTITY STARTER KIT (its own section):
   - Recommended color palette: 3 hex colors with names
   - Typography pairing: 2 Google Fonts with heading/body usage guidance
   - Voice and tone guide: 3 sentences
   - Visual references: 2-3 real restaurant aesthetic descriptions (description only, no images, no copyrighted names beyond generic style references)
   - Instagram grid direction: what the first 9 posts should look and feel like
   - One legal action (OMPIC in Morocco / equivalent elsewhere)
9. CLOSING: subtle CTA — "This report was generated by Za3fran's Menu Engineer. Visit za3fran.io or email hello@za3fran.io." Print instruction: "To save this report as a PDF, use your browser's Print function and select 'Save as PDF.'"

OUTPUT REQUIREMENT: Return ONLY the HTML document. Start with <!DOCTYPE html> and end with </html>. No preamble, no explanation.`;
}

function buildStrategyReportUserPrompt(concept, architecture, items, costing, intake, currency, language) {
  const sectionSummary = architecture.sections.map((s) => `${s.name} (${s.item_count} items): ${s.rationale}`).join('\n');
  const itemSummary = items.items.map((it) => `${it.name} [${it.section}] — ${it.description}`).join('\n');
  const costSummary = costing.costed_items.map((c) =>
    `${c.name}: food cost ${c.total_food_cost} ${currency}, price ${c.target_selling_price} ${currency}, food cost ${c.food_cost_percent}%`
  ).join('\n');

  return `Generate the Menu Strategy Report for this concept. Today's date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.

CONCEPT: ${concept.concept_name || 'Concept'}
Type/cuisine: ${concept.type || ''} / ${concept.cuisine || ''}
City: ${concept.city || 'Not provided'}
Positioning: ${concept.description || 'Not provided'}
Differentiation: ${concept.differentiation || 'Not provided'}
Target ticket: ${concept.ticket || 'Not provided'} ${currency}
Audience: ${Array.isArray(concept.audience) ? concept.audience.join(', ') : (concept.audience || 'Not provided')}

MENU ARCHITECTURE:
${sectionSummary}

MENU ITEMS:
${itemSummary}

COSTING DATA:
${costSummary}
Overall food cost %: ${costing.summary?.overall_food_cost_percent}
Top cost drivers: ${(costing.summary?.top_3_cost_drivers || []).join(', ')}

BRAND PREFERENCES FROM CUSTOMER:
Visual style: ${intake.visual_style || 'Not specified — recommend based on concept'}
Brand color: ${intake.brand_color || architecture.inferred_brand?.primary_color_hex || 'Not specified'}
Brand references: ${intake.brand_refs || 'None provided'}

Generate the full report now. Return only the HTML document.`;
}

async function generateStrategyReport(model, concept, architecture, items, costing, intake, currency, language) {
  const system = buildStrategyReportSystemPrompt(language);
  const user = buildStrategyReportUserPrompt(concept, architecture, items, costing, intake, currency, language);
  return await callClaude(model, system, user, 16000, 75000);
}

// ── Templated branded menu document (not Claude — for print-CSS reliability) ──
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMenuHtml(architecture, items, intake, concept, language) {
  const styleKey = STYLE_TOKENS[intake.visual_style] ? intake.visual_style : 'modern_minimal';
  const tokens = { ...STYLE_TOKENS[styleKey] };
  if (intake.brand_color && /^#[0-9A-Fa-f]{6}$/.test(intake.brand_color)) {
    tokens.accent = intake.brand_color;
  }
  const spacing = DENSITY_SPACING[tokens.density] || DENSITY_SPACING.medium;

  const conceptName = escapeHtml(concept.concept_name || 'Menu');
  const printLabel = language === 'fr' ? 'Utilisez la fonction Imprimer de votre navigateur pour enregistrer en PDF' : "Use your browser's Print function to save as PDF";

  const sectionsHtml = architecture.sections.map((section) => {
    const sectionItems = items.items.filter((it) => it.section === section.name);
    const itemsHtml = sectionItems.map((it) => `
      <div class="menu-item" style="margin-bottom:${spacing.itemGap};">
        <div class="item-row">
          <span class="item-name">${escapeHtml(it.name)}</span>
          <span class="item-dots"></span>
          <span class="item-price">${it.suggested_price}</span>
        </div>
        <p class="item-desc">${escapeHtml(it.description)}</p>
      </div>`).join('');

    return `
    <section class="menu-section" style="margin-bottom:${spacing.sectionGap}; page-break-inside: avoid;">
      <h2 class="section-title">${escapeHtml(section.name)}</h2>
      ${itemsHtml}
    </section>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8">
<title>${conceptName} — Menu</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: ${tokens.bodyFont};
    background: ${tokens.bg};
    color: ${tokens.primary};
    padding: ${spacing.padding};
    max-width: 800px;
    margin: 0 auto;
  }
  .menu-cover { text-align: center; margin-bottom: ${spacing.sectionGap}; padding-bottom: 24px; border-bottom: 2px solid ${tokens.accent}; }
  .menu-cover h1 {
    font-family: ${tokens.headingFont};
    font-size: 42px;
    color: ${tokens.primary};
    margin-bottom: 8px;
  }
  .menu-cover .subtitle { color: ${tokens.accent}; font-size: 13px; text-transform: uppercase; letter-spacing: ${tokens.letterSpacing}; }
  .section-title {
    font-family: ${tokens.headingFont};
    font-size: 22px;
    color: ${tokens.accent};
    text-transform: ${tokens.sectionCase};
    letter-spacing: ${tokens.letterSpacing};
    margin-bottom: 20px;
    padding-bottom: 8px;
    border-bottom: 1px solid ${tokens.accent};
  }
  .item-row { display: flex; align-items: baseline; gap: 8px; }
  .item-name { font-weight: bold; font-size: 16px; white-space: nowrap; }
  .item-dots { flex: 1; border-bottom: 1px dotted ${tokens.accent}; opacity: 0.5; margin-bottom: 4px; }
  .item-price { font-weight: bold; font-size: 16px; color: ${tokens.accent}; white-space: nowrap; }
  .item-desc { color: ${tokens.primary}; opacity: 0.75; font-size: 13px; margin-top: 4px; line-height: 1.5; }
  .menu-footer { text-align: center; margin-top: ${spacing.sectionGap}; padding-top: 20px; border-top: 1px solid ${tokens.accent}; font-size: 11px; color: ${tokens.primary}; opacity: 0.6; }
  @media print { .menu-footer .print-hint { display: none; } }
</style>
</head>
<body>
  <div class="menu-cover">
    <h1>${conceptName}</h1>
    <p class="subtitle">${escapeHtml(concept.cuisine || concept.type || '')}</p>
  </div>
  ${sectionsHtml}
  <div class="menu-footer">
    <p class="print-hint">${printLabel}</p>
    <p style="margin-top:6px;">Generated by Za3fran</p>
  </div>
</body>
</html>`;
}

// ── XLSX costing matrix ─────────────────────────────────────────
function buildCostingXlsx(items, costing, currency) {
  const rows = costing.costed_items.map((c) => {
    const matchedItem = items.items.find((it) => it.name === c.name) || {};
    return {
      'Section': matchedItem.section || '',
      'Item': c.name,
      'Ingredients': (matchedItem.ingredients || []).join(', '),
      [`Total Food Cost (${currency})`]: c.total_food_cost,
      [`Selling Price (${currency})`]: c.target_selling_price,
      'Food Cost %': c.food_cost_percent,
      [`Gross Margin (${currency})`]: c.gross_margin,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 16 }, { wch: 28 }, { wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 16 },
  ];

  const summaryRows = [
    { Metric: 'Overall Food Cost %', Value: costing.summary?.overall_food_cost_percent || '' },
    { Metric: 'Weighted Average Margin', Value: costing.summary?.weighted_average_margin || '' },
    { Metric: 'Top Cost Driver 1', Value: (costing.summary?.top_3_cost_drivers || [])[0] || '' },
    { Metric: 'Top Cost Driver 2', Value: (costing.summary?.top_3_cost_drivers || [])[1] || '' },
    { Metric: 'Top Cost Driver 3', Value: (costing.summary?.top_3_cost_drivers || [])[2] || '' },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 24 }, { wch: 24 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Costing Matrix');
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

async function uploadXlsx(runId, buffer) {
  const path = `${runId}/costing-matrix.xlsx`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    });

  if (uploadError) {
    throw new Error('XLSX upload failed: ' + uploadError.message);
  }

  const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return publicUrlData.publicUrl;
}

// ── Main handler ─────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { runId } = req.body || {};
  if (!runId) {
    return res.status(400).json({ error: 'runId is required' });
  }

  try {
    const { data: run, error: runError } = await supabase
      .from('menu_engineer_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (runError || !run) {
      console.error('[generate-menu] Run not found:', runId, runError);
      return res.status(404).json({ error: 'Run not found' });
    }

    const { data: project, error: projError } = await supabase
      .from('za3fran_projects')
      .select('*')
      .eq('id', run.project_id)
      .single();

    if (projError || !project) {
      throw new Error('Project lookup failed: ' + (projError?.message || 'not found'));
    }

    const { data: submission } = await supabase
      .from('validator_submissions')
      .select('*')
      .eq('id', project.validator_submission_id)
      .single();

    const { data: vReport } = await supabase
      .from('validator_reports')
      .select('report_json')
      .eq('submission_id', project.validator_submission_id)
      .single();

    const concept = vReport?.report_json?.concept_snapshot || {
      concept_name: project.concept_name,
      cuisine: submission?.cuisine,
      type: submission?.concept_type,
      city: submission?.city,
      ticket: submission?.ticket,
      audience: submission?.audience,
      description: submission?.description,
      differentiation: submission?.differentiation,
    };

    const intake = (run.output_json && run.output_json.intake) || {};
    const currency = run.currency || 'EUR';
    const language = run.language || 'en';
    const model = getModel('menuEngineer');

    console.log(`[generate-menu] Starting generation for run ${runId} (model: ${model})`);

    // ── Pass 1: Architecture ──
    const architecture = await generateArchitecture(model, concept, intake, currency, language);
    console.log(`[generate-menu] Pass 1 complete: ${architecture.sections.length} sections`);

    // ── Pass 2: Items ──
    const items = await generateItems(model, concept, intake, architecture, language);
    console.log(`[generate-menu] Pass 2 complete: ${items.items.length} items`);

    // ── Pass 3: Costing ──
    const costing = await generateCosting(model, items, currency, language);
    console.log(`[generate-menu] Pass 3 complete: ${costing.costed_items.length} items costed`);

    // ── Pass 4: Strategy report ──
    const reportHtml = await generateStrategyReport(model, concept, architecture, items, costing, intake, currency, language);
    if (!reportHtml.startsWith('<!DOCTYPE') && !reportHtml.startsWith('<html')) {
      throw new Error('Strategy report did not return valid HTML');
    }
    console.log(`[generate-menu] Pass 4 complete: ${reportHtml.length} chars`);

    // ── Templated menu document ──
    const menuHtml = buildMenuHtml(architecture, items, intake, concept, language);

    // ── XLSX costing matrix ──
    const xlsxBuffer = buildCostingXlsx(items, costing, currency);
    const xlsxUrl = await uploadXlsx(runId, xlsxBuffer);
    console.log(`[generate-menu] XLSX uploaded: ${xlsxUrl}`);

    // ── Save everything ──
    const mergedOutputJson = {
      ...(run.output_json || {}),
      status: 'complete',
      architecture,
      items,
      costing,
      completed_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('menu_engineer_runs')
      .update({
        output_html: reportHtml,
        output_menu_html: menuHtml,
        output_xlsx_url: xlsxUrl,
        output_json: mergedOutputJson,
        status: 'complete',
      })
      .eq('id', runId);

    if (updateError) {
      throw new Error('Failed to save generated deliverables: ' + updateError.message);
    }

    console.log(`[generate-menu] Complete for run ${runId}`);
    return res.status(200).json({ success: true, runId });

  } catch (err) {
    console.error('[generate-menu] Error:', err.message);
    const { data: currentRun } = await supabase
      .from('menu_engineer_runs')
      .select('output_json')
      .eq('id', runId)
      .maybeSingle();

    await supabase
      .from('menu_engineer_runs')
      .update({
        status: 'error',
        output_json: {
          ...((currentRun && currentRun.output_json) || {}),
          status: 'error',
          error_message: err.message,
          error_stack: (err.stack || '').slice(0, 2000),
          error_at: new Date().toISOString(),
        },
      })
      .eq('id', runId)
      .then(() => {}, () => {});
    return res.status(500).json({ error: err.message });
  }
}
