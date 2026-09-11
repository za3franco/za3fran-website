// ============================================================
// /api/generate-menu.js
// Menu Engineer generation pipeline — a genuine production-
// planning tool, not just an analysis report.
//
// 3 structured-data Claude passes + 1 HTML pass:
//   Pass 1 — menu architecture (sections, item counts, voice)
//   Pass 2 — item list + descriptions
//   Pass 3 — recipe costing (ingredients, yields, seasoning, method),
//            section attachment rates + item popularity weights
//            (drives the sales-mix formulas), and a CONSOLIDATED
//            supplier list (3-5 real foodservice distributors, not
//            fragmented per-category retail sources)
//   Pass 4 (HTML) — strategy report
//
// Costing workbook (ExcelJS):
//   - One tab per recipe: method block (editable), ingredient lines
//     with live formulas (yield ratio, seasoning allowance, food
//     cost %, margin)
//   - Recap & Sales Mix tab: Daily Covers is the single editable
//     driver cell. Each item's Est. Weekly Units is a LIVE FORMULA
//     (Daily Covers x Operating Days x Attachment Rate % x
//     Popularity Weight %), pulled from Validator's covers data as
//     a starting point. A covers-weighted blended food cost % is
//     computed via SUMPRODUCT.
//   - Market List tab: ingredient quantities aggregated via live
//     cross-sheet formulas tied to each recipe's Est. Weekly Units
//     (not a static batch assumption). A Current Stock column
//     drives MAX(0, Needed - Stock) replenishment logic.
//
// No manual per-call timeouts - relies solely on the function's
// own maxDuration (600s) as the ceiling.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { getModel } from '../lib/claude-config.js';
import ExcelJS from 'exceljs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STORAGE_BUCKET = 'menu-engineer-deliverables';
const DEFAULT_DAILY_COVERS = 50;
const DEFAULT_OPERATING_DAYS_PER_WEEK = 7;

export const config = { api: { bodyParser: true }, maxDuration: 600 };

// ── Anthropic API call helper — no manual timeout, relies on maxDuration ──
async function callClaude(model, systemPrompt, userPrompt, maxTokens) {
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
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error('Anthropic API error: ' + (data.error?.message || JSON.stringify(data)));
  }
  const textBlock = (data.content || []).find((block) => block.type === 'text');
  if (!textBlock || !textBlock.text) {
    throw new Error('Anthropic API returned empty content');
  }
  return textBlock.text.trim();
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
  const system = `You are a senior menu engineering consultant working across MENA and European F&B markets. You design menu architecture — section structure, item counts, and balance — based on positioning, cuisine, and target audience. Return ONLY valid JSON, no markdown, no preamble.`;

  const user = `Design the menu architecture for this concept. Return JSON matching exactly this schema:
{
  "sections": [{"name": "<section name, in ${language === 'fr' ? 'French' : 'English'}>", "item_count": <integer>, "rationale": "<why this section and count, max 150 chars>"}],
  "menu_voice": "<3-4 words describing appropriate writing tone for item names/descriptions>",
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
Specific requests from customer: ${intake.additional_notes || 'none'}

Design 3-6 sections appropriate to this concept type and cuisine. Total items should be realistic for the format. Return ONLY the JSON object.`;

  const text = await callClaude(model, system, user, 5000);
  return parseJsonResponse(text);
}

// ── PASS 2: Menu items ──────────────────────────────────────────
async function generateItems(model, concept, intake, architecture, language) {
  const system = `You are a professional menu writer working across MENA and European F&B markets. You write item names and descriptions appropriate to a concept's positioning and cuisine — specific and appetizing, never generic or interchangeable. Return ONLY valid JSON, no markdown, no preamble.`;

  const sectionList = architecture.sections.map((s) => `- ${s.name}: ${s.item_count} items`).join('\n');

  const user = `Write the full, FINAL menu item list for this concept, in ${language === 'fr' ? 'French' : 'English'}. This is the decided menu — not a draft. Return JSON matching exactly this schema:
{
  "items": [
    {
      "section": "<must match a section name from the list below exactly>",
      "name": "<item name>",
      "description": "<1-2 line description>",
      "ingredients": ["<ingredient 1>", "<ingredient 2>", "..."],
      "suggested_price": <number, no currency symbol, realistic for the stated ticket>,
      "addresses_gap": "<optional: which market opportunity or audience need this item specifically fills, max 100 chars, or empty string if it's a standard/expected item>"
    }
  ]
}

CONCEPT: ${concept.concept_name || 'Concept'} — ${concept.cuisine || ''} ${concept.type || ''} in ${concept.city || ''}
POSITIONING: ${concept.description || 'Not provided'}
DIFFERENTIATION: ${concept.differentiation || 'Not provided'}
TARGET TICKET: ${concept.ticket || 'Not provided'}
AUDIENCE: ${Array.isArray(concept.audience) ? concept.audience.join(', ') : (concept.audience || 'Not provided')}
WRITING TONE: ${architecture.menu_voice || 'Match the concept positioning'}
SPECIFIC REQUESTS: ${intake.additional_notes || 'none'}

SECTIONS TO FILL (write exactly this many items per section):
${sectionList}

IMPORTANT — before finalizing: think through what a well-informed local competitor analysis and this audience's expectations would demand from this menu, and make sure every real opportunity is already represented as an actual item below. Do not identify a gap and then leave it unaddressed. Do not include filler items that don't earn their place.

List 3-6 realistic ingredients per item (used for costing in the next step). Return ONLY the JSON object — write every item, do not truncate.`;

  const text = await callClaude(model, system, user, 16000);
  return parseJsonResponse(text);
}

// ── PASS 3: Recipe costing, sales-mix weighting, suppliers ──────
const CATEGORY_LIST = 'Produce, Protein, Dairy, Dry Goods & Pantry, Spices & Seasoning, Beverage, Other';

async function generateCosting(model, items, architecture, concept, currency, language) {
  const system = `You are an F&B cost accountant, kitchen operations specialist, and procurement specialist working across MENA and European markets. You provide realistic ingredient costs, yield ratios, and prep methods. For sourcing, you recommend OPERATIONALLY PRACTICAL supplier lists — always real foodservice/catering distributors or wholesale markets who actually service restaurant accounts of the relevant scale, never small retail shops or industrial-scale producers who would not take on a single-unit restaurant as a client. You minimize the total number of suppliers recommended, since every additional supplier multiplies the number of orders, deliveries, and invoices an operator has to manage — you strongly prefer broadline distributors that cover multiple ingredient categories over fragmenting sourcing across many single-category specialists. You never compute cost totals yourself — you provide the raw inputs that a spreadsheet calculates live. Return ONLY valid JSON, no markdown, no preamble.`;

  const itemList = items.items.map((it, i) =>
    `${i + 1}. ${it.name} (${it.section}) — ingredients: ${it.ingredients.join(', ')} — target price: ${it.suggested_price}`
  ).join('\n');

  const sectionNames = architecture.sections.map((s) => s.name).join(', ');

  const user = `Provide recipe costing, sales-mix weighting, and supplier recommendations for this menu, in ${currency}. Return JSON matching exactly this schema:
{
  "recipes": [
    {
      "name": "<must match item name exactly>",
      "method": "<3-6 numbered prep steps as plain text, e.g. '1. Sear the... 2. Reduce the... 3. Plate with...', max 500 chars total — a practical starting point the kitchen can edit>",
      "popularity_weight_percent": <integer, this item's share of demand WITHIN its section — all items in the same section should sum to approximately 100>,
      "ingredient_lines": [
        {
          "ingredient": "<name>",
          "category": "<one of: ${CATEGORY_LIST}>",
          "unit": "<kg|g|l|ml|piece|bunch|dozen>",
          "ap_cost_per_unit": <number, benchmark AS-PURCHASED cost per unit in ${currency}>,
          "yield_percent": <integer 1-100, usable yield after trim/peel/prep loss>,
          "net_qty_required": <number, quantity actually used in the finished dish, same unit as above>
        }
      ],
      "seasoning_percent": <integer 3-6>
    }
  ],
  "section_attachment_rates": [
    {"section": "<one of: ${sectionNames}>", "attachment_rate_percent": <integer 1-100, realistic % of covers who order from this section — e.g. ~90 for a Mains section, ~30-40 for Desserts or Starters, adjust for this concept's service style>}
  ],
  "supplier_recommendations": {
    "strategy_note": "<1-2 sentences on the consolidation approach for this concept, max 200 chars>",
    "suppliers": [
      {
        "name": "<real foodservice distributor, catering wholesaler, or wholesale market — NOT a retail shop or industrial producer>",
        "type": "<Foodservice Distributor|Wholesale Market|Specialty Supplier>",
        "categories_covered": ["<one or more of: ${CATEGORY_LIST}>"],
        "notes": "<why this fits this concept's scale and region, max 140 chars>"
      }
    ]
  }
}

CONCEPT REGION: ${concept.city || 'Not specified'}, cuisine: ${concept.cuisine || 'Not specified'}, format: ${concept.type || 'Not specified'}

ITEMS TO COST (list every ingredient from each item below as a costed line):
${itemList}

SUPPLIER GUIDANCE: Recommend a MINIMAL, practical list — aim for 3-5 total suppliers covering every category used above, not 2-3 sources per category. Prioritize real foodservice/catering distributors or wholesale markets that would realistically take on an account of this concept's scale. For Morocco specifically, real options include Derb Omar (Casablanca wholesale market) and named foodservice distributors — not generic retail chains. Only add a specialty single-category supplier if a genuine ingredient requires it.

Return ONLY the JSON object — cost every ingredient of every item, do not truncate.`;

  const text = await callClaude(model, system, user, 28000);
  return parseJsonResponse(text);
}

// ── JS-side cost computation (grounds the report in real numbers) ──
function computeRecipeCost(recipe) {
  let subtotal = 0;
  (recipe.ingredient_lines || []).forEach((line) => {
    const yieldFactor = (line.yield_percent || 100) / 100;
    const rawQty = yieldFactor > 0 ? line.net_qty_required / yieldFactor : line.net_qty_required;
    subtotal += rawQty * (line.ap_cost_per_unit || 0);
  });
  const seasoningCost = subtotal * ((recipe.seasoning_percent || 0) / 100);
  const totalCost = subtotal + seasoningCost;
  return { subtotal, seasoningCost, totalCost };
}

// ── PASS 4: Strategy report HTML ────────────────────────────────
function buildStrategyReportSystemPrompt(language) {
  return `You are a senior menu engineering consultant. You produce the Menu Strategy Report — a rigorous, practical analysis grounded in real menu engineering discipline (architecture, pricing psychology, profitability classification, sourcing), not a design document. This is a paid deliverable; write it as if billing for genuine expertise.

LANGUAGE: Write the entire report in ${language === 'fr' ? 'French' : 'English'}. Be fully consistent.

TONE: Direct, specific, no filler. Balanced.

FORMAT RULES — NON-NEGOTIABLE:
- Output is a single, self-contained HTML document. No markdown, no code fences, no backticks.
- Pure HTML with inline CSS only. No external stylesheets except the Google Fonts import.
- Print-ready. Apply this exact CSS block in the <head>:
  body { text-align: justify; hyphens: auto; -webkit-hyphens: auto; orphans: 3; widows: 3; }
  h1, h2, h3, p.logo, p.subtitle, th, td { text-align: left; }
  section { page-break-inside: avoid; page-break-before: always; }
  section:first-of-type { page-break-before: avoid; }
  h2, h3 { page-break-after: avoid; }
  .callout { page-break-inside: avoid; }
- The Menu Engineering Matrix table is the ONE exception to "every table avoids breaking" — see pagination rule 3 below, which requires the OPPOSITE (letting it break between items) to avoid a worse problem.
- Every single one of the 6 numbered sections below MUST be its own <section style="page-break-inside:avoid;"> element (plus page-break-before:always except the cover) — never let any heading or block of content sit outside a <section> wrapper, and never split a section's content across two <div> siblings that aren't both inside the same <section>. This applies with no exceptions to the Supplier section. Exception: the Menu Engineering Matrix table (Section 4) itself must NOT have page-break-inside:avoid — see rule 3 below.

PRINT/PAGINATION — COMMON MISTAKES, AVOID ALL OF THESE:
1. COVER HEIGHT: the cover section's total height (title, subtitle, meta rows, all padding combined) must comfortably fit within a single A4 page after typical browser print margins (~270mm usable height). Keep the cover's vertical padding modest — do not use large spacer blocks, do not set min-height or height larger than the content needs, do not vertically center content using a technique that inflates total block height (e.g. min-height:100vh). Let the cover size naturally to its content and stay clearly under one page. This is the single most common failure — check your cover's total content height mentally before finalizing.
2. Because Section 2 immediately follows the cover with page-break-before:always, if the cover overflows onto a second page it pushes Section 2's content to overflow awkwardly too. Fixing the cover height (rule 1) is what prevents this cascade — do not try to compensate by shrinking Section 2 instead.
3. MENU ENGINEERING MATRIX TABLE (Section 4): do NOT apply page-break-inside:avoid to the <table> element itself — a table-wide avoid rule forces the ENTIRE table to jump to a fresh page whenever it doesn't fit in the remaining space, which strands the heading above a large blank gap on the previous page (this is the actual cause of the heading/table gap problem — not intro text length). Instead: apply style="page-break-inside:avoid;" to each item's ROW PAIR only (both the compact data row and its rationale row beneath it), so a complete item never splits internally, but the table as a whole is free to continue naturally onto the next page after however many complete item-pairs fit — filling the current page first rather than jumping entirely. Also never put the rationale text in a narrow table column — a narrow column forces heavy word-wrapping and makes every row very tall. Structure each item as TWO stacked rows: Row A has the compact columns (Item | Section | Price | Food Cost % | Gross Margin | Classification badge); Row B is a single cell with colspan spanning the full table width, containing the rationale in smaller muted text (e.g. font-size:12px; color:#888880; padding:2px 8px 10px;) directly beneath Row A, no visible border between them.
4. SUPPLIER SECTION (Section 5): the entire block — heading, strategy note, and every supplier card — must be wrapped together in one container with style="page-break-inside:avoid;" so it either fits entirely on the current page or the WHOLE block moves together to the next page. Keep every supplier card compact (3-4 lines max, tight padding) — this section must fit on a single page even with 4-5 suppliers.
- Color palette: Background #FAFAF7, section headers #0F1F3D (navy), accent #C9862A (copper), body text #1a1a1a, muted #888880.
- Typography: Headings 'Cormorant Garamond', Georgia, serif. Body 'DM Sans', Arial, sans-serif.
- Visual weight: sparing use of color/callouts — reserve navy/copper treatment for the "This Week" box only. Generous white space, concise paragraphs.
- Do not truncate any section.

REQUIRED STRUCTURE:
1. COVER: Concept name, "Menu Strategy Report" label in copper uppercase, date.
2. MENU ARCHITECTURE & MARKET FIT: why these sections and this balance — 2-3 paragraphs, reference 2-3 specific items and the need each fills.
3. PRICING STRATEGY & MENU PSYCHOLOGY: price points vs. target ticket, pricing psychology relevant to this concept — 2-3 paragraphs.
4. MENU ENGINEERING MATRIX: keep the introductory text to at most ONE short sentence before the table — go from the heading almost straight into the table. A long intro paragraph here is what causes an awkward page-break gap between the heading and the table (the table has to jump to a fresh page while the heading and paragraph are stranded above a large blank gap on the previous page). A table projecting each item's likely classification — Star / Plowhorse / Puzzle / Dog — based on food cost % and pricing (framed as a pre-launch projection to revisit with real POS data). Use the two-row-per-item table pattern described in the pagination rules above (compact row + full-width rationale row) — never a narrow rationale column.
5. SUPPLIER & SOURCING STRATEGY: present the CONSOLIDATED supplier list provided (not one source per category) — explain why this small set was chosen (operational simplicity: fewer orders, deliveries, invoices) and which categories each supplier covers. Wrap the entire heading + note + all supplier cards in one page-break-inside:avoid container per the pagination rules above. Keep this section DENSE and compact — each supplier card should be no more than 3-4 lines total (name/type/categories on one line, one short sentence of notes), with minimal padding between cards (e.g. 8-10px, not 20px+) — this section must fit entirely on a single page even with 4-5 suppliers, so prioritize compactness over generous whitespace here specifically.
6. THIS WEEK BOX: 2 immediate actions, dark navy background, copper accent text. Beneath the box, add one small muted line (not its own section, not page-breaking): "Generated by Za3fran's Menu Engineer — za3fran.io" and a print instruction ("Use your browser's Print function to save as PDF"). This is the final content of the report — there is no separate closing section.

Do not include visual/graphic design guidance, brand identity kits, or social media direction — this report covers menu engineering analysis only.

OUTPUT REQUIREMENT: Return ONLY the HTML document. Start with <!DOCTYPE html> and end with </html>.`;
}

function buildStrategyReportUserPrompt(concept, architecture, items, costing, currency, language) {
  const sectionSummary = architecture.sections.map((s) => `${s.name} (${s.item_count} items): ${s.rationale}`).join('\n');

  const itemSummary = items.items.map((it) => {
    const recipe = costing.recipes.find((r) => r.name === it.name);
    let costLine = 'costing not available';
    if (recipe) {
      const { totalCost } = computeRecipeCost(recipe);
      const foodCostPct = it.suggested_price > 0 ? ((totalCost / it.suggested_price) * 100).toFixed(1) : 'n/a';
      costLine = `est. cost ${totalCost.toFixed(2)} ${currency}, price ${it.suggested_price} ${currency}, food cost ~${foodCostPct}%`;
    }
    return `${it.name} [${it.section}] — ${it.description}${it.addresses_gap ? ` (addresses: ${it.addresses_gap})` : ''} — ${costLine}`;
  }).join('\n');

  const supplierBlock = costing.supplier_recommendations || {};
  const supplierSummary = `Strategy: ${supplierBlock.strategy_note || ''}\n` +
    (supplierBlock.suppliers || []).map((s) => `${s.name} (${s.type}) — covers: ${(s.categories_covered || []).join(', ')} — ${s.notes}`).join('\n');

  return `Generate the Menu Strategy Report for this concept. Today's date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.

CONCEPT: ${concept.concept_name || 'Concept'}
Type/cuisine: ${concept.type || ''} / ${concept.cuisine || ''}
City: ${concept.city || 'Not provided'}
Positioning: ${concept.description || 'Not provided'}
Target ticket: ${concept.ticket || 'Not provided'} ${currency}
Audience: ${Array.isArray(concept.audience) ? concept.audience.join(', ') : (concept.audience || 'Not provided')}

MENU ARCHITECTURE:
${sectionSummary}

MENU ITEMS WITH ESTIMATED COSTING:
${itemSummary}

CONSOLIDATED SUPPLIER LIST:
${supplierSummary}

Generate the full report now. Return only the HTML document.`;
}

async function generateStrategyReport(model, concept, architecture, items, costing, currency, language) {
  const system = buildStrategyReportSystemPrompt(language);
  const user = buildStrategyReportUserPrompt(concept, architecture, items, costing, currency, language);
  return await callClaude(model, system, user, 20000);
}

// ── Costing workbook (ExcelJS) ───────────────────────────────────
const NAVY = 'FF0F1F3D';
const COPPER = 'FFC9862A';
const LIGHT_ROW = 'FFF5F3EE';
const PRICE_HIGHLIGHT = 'FFFFF3E0';
const WHITE = 'FFFFFFFF';

function sanitizeSheetName(name, usedNames) {
  let clean = (name || 'Recipe').replace(/[:\\/?*\[\]]/g, '').slice(0, 28).trim();
  if (!clean) clean = 'Recipe';
  let unique = clean;
  let i = 2;
  while (usedNames.has(unique)) {
    unique = `${clean.slice(0, 25)} (${i})`;
    i++;
  }
  usedNames.add(unique);
  return unique;
}

function styleHeaderRow(row, colCount) {
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  }
  row.height = 30;
}

function buildRecipeSheet(workbook, item, recipe, currency, usedNames) {
  const sheetName = sanitizeSheetName(item.name, usedNames);
  const sheet = workbook.addWorksheet(sheetName);
  sheet.properties.tabColor = { argb: COPPER };

  sheet.columns = [
    { width: 26 }, { width: 16 }, { width: 9 }, { width: 14 },
    { width: 9 }, { width: 15 }, { width: 16 }, { width: 14 },
  ];

  sheet.mergeCells('A1:H1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = item.name;
  titleCell.font = { name: 'Georgia', size: 16, bold: true, color: { argb: NAVY } };
  titleCell.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 28;

  sheet.mergeCells('A2:H2');
  const subCell = sheet.getCell('A2');
  subCell.value = `${item.section} \u00b7 Target selling price: ${item.suggested_price} ${currency}`;
  subCell.font = { size: 10, italic: true, color: { argb: 'FF888880' } };

  sheet.getCell('A3').value = 'Method (editable)';
  sheet.getCell('A3').font = { bold: true, size: 10, color: { argb: COPPER } };

  const methodStartRow = 4;
  const methodRows = 5;
  sheet.mergeCells(`A${methodStartRow}:H${methodStartRow + methodRows - 1}`);
  const methodCell = sheet.getCell(`A${methodStartRow}`);
  methodCell.value = recipe.method || '1. \n2. \n3. ';
  methodCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  methodCell.font = { size: 11 };
  methodCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBFAF7' } };
  methodCell.border = { top: { style: 'thin', color: { argb: 'FFE0DDD5' } }, bottom: { style: 'thin', color: { argb: 'FFE0DDD5' } } };

  const headerRowIdx = methodStartRow + methodRows + 1;
  const headers = ['Ingredient', 'Category', 'Unit', `AP Cost/Unit (${currency})`, 'Yield %', 'Net Qty Required', 'Raw Qty to Purchase', `Line Cost (${currency})`];
  const headerRow = sheet.getRow(headerRowIdx);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
  styleHeaderRow(headerRow, 8);

  let rowIdx = headerRowIdx + 1;
  const firstIngredientRow = rowIdx;
  const ingredientCells = [];
  (recipe.ingredient_lines || []).forEach((line) => {
    const row = sheet.getRow(rowIdx);
    row.getCell(1).value = line.ingredient;
    row.getCell(2).value = line.category || 'Other';
    row.getCell(3).value = line.unit;
    row.getCell(4).value = line.ap_cost_per_unit;
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(5).value = (line.yield_percent || 100) / 100;
    row.getCell(5).numFmt = '0%';
    row.getCell(6).value = line.net_qty_required;
    row.getCell(6).numFmt = '#,##0.00';
    row.getCell(7).value = { formula: `F${rowIdx}/E${rowIdx}` };
    row.getCell(7).numFmt = '#,##0.00';
    row.getCell(8).value = { formula: `G${rowIdx}*D${rowIdx}` };
    row.getCell(8).numFmt = '#,##0.00';
    if ((rowIdx - firstIngredientRow) % 2 === 1) {
      for (let c = 1; c <= 8; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_ROW } };
    }
    ingredientCells.push({
      ingredient: line.ingredient,
      unit: line.unit,
      rawQtyCell: `'${sheetName}'!$G$${rowIdx}`,
    });
    rowIdx++;
  });
  const lastIngredientRow = rowIdx - 1;

  const subtotalRow = rowIdx + 1;
  sheet.getCell(`A${subtotalRow}`).value = 'Ingredient Subtotal';
  sheet.getCell(`A${subtotalRow}`).font = { bold: true };
  sheet.getCell(`H${subtotalRow}`).value = { formula: `SUM(H${firstIngredientRow}:H${lastIngredientRow})` };
  sheet.getCell(`H${subtotalRow}`).numFmt = '#,##0.00';
  sheet.getCell(`H${subtotalRow}`).font = { bold: true };

  const seasoningRow = subtotalRow + 1;
  sheet.getCell(`A${seasoningRow}`).value = 'Seasoning / Misc Allowance';
  sheet.getCell(`D${seasoningRow}`).value = (recipe.seasoning_percent || 4) / 100;
  sheet.getCell(`D${seasoningRow}`).numFmt = '0%';
  sheet.getCell(`H${seasoningRow}`).value = { formula: `H${subtotalRow}*D${seasoningRow}` };
  sheet.getCell(`H${seasoningRow}`).numFmt = '#,##0.00';

  const totalCostRow = seasoningRow + 1;
  sheet.getCell(`A${totalCostRow}`).value = 'Total Recipe Cost';
  sheet.getCell(`A${totalCostRow}`).font = { bold: true, color: { argb: NAVY } };
  sheet.getCell(`H${totalCostRow}`).value = { formula: `H${subtotalRow}+H${seasoningRow}` };
  sheet.getCell(`H${totalCostRow}`).numFmt = '#,##0.00';
  sheet.getCell(`H${totalCostRow}`).font = { bold: true, color: { argb: COPPER }, size: 12 };

  const priceRow = totalCostRow + 1;
  sheet.getCell(`A${priceRow}`).value = 'Selling Price (editable)';
  sheet.getCell(`H${priceRow}`).value = item.suggested_price;
  sheet.getCell(`H${priceRow}`).numFmt = '#,##0.00';
  sheet.getCell(`H${priceRow}`).font = { bold: true };
  sheet.getCell(`H${priceRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRICE_HIGHLIGHT } };

  const fcPctRow = priceRow + 1;
  sheet.getCell(`A${fcPctRow}`).value = 'Food Cost %';
  sheet.getCell(`H${fcPctRow}`).value = { formula: `H${totalCostRow}/H${priceRow}` };
  sheet.getCell(`H${fcPctRow}`).numFmt = '0.0%';
  sheet.getCell(`H${fcPctRow}`).font = { bold: true };

  const marginRow = fcPctRow + 1;
  sheet.getCell(`A${marginRow}`).value = 'Gross Margin';
  sheet.getCell(`H${marginRow}`).value = { formula: `H${priceRow}-H${totalCostRow}` };
  sheet.getCell(`H${marginRow}`).numFmt = '#,##0.00';
  sheet.getCell(`H${marginRow}`).font = { bold: true };

  sheet.views = [{ state: 'frozen', ySplit: headerRowIdx }];

  return {
    sheetName,
    totalCostCell: `'${sheetName}'!$H$${totalCostRow}`,
    sellingPriceCell: `'${sheetName}'!$H$${priceRow}`,
    foodCostPctCell: `'${sheetName}'!$H$${fcPctRow}`,
    marginCell: `'${sheetName}'!$H$${marginRow}`,
    ingredientCells,
  };
}

function buildRecapSheet(workbook, items, recipeRefs, sectionAttachmentRates, dailyCovers, currency) {
  const sheet = workbook.addWorksheet('Recap & Sales Mix');
  sheet.properties.tabColor = { argb: NAVY };
  sheet.columns = [
    { width: 26 }, { width: 16 }, { width: 13 }, { width: 13 },
    { width: 11 }, { width: 13 }, { width: 13 }, { width: 13 },
    { width: 14 }, { width: 15 }, { width: 16 }, { width: 13 },
  ];

  sheet.mergeCells('A1:L1');
  sheet.getCell('A1').value = 'Menu Recap & Sales Mix Analysis';
  sheet.getCell('A1').font = { name: 'Georgia', size: 16, bold: true, color: { argb: NAVY } };
  sheet.getRow(1).height = 28;

  sheet.mergeCells('A2:L2');
  sheet.getCell('A2').value = 'Adjust Daily Covers below to see weekly units, weighted food cost, and market list quantities update live.';
  sheet.getCell('A2').font = { size: 10, italic: true, color: { argb: 'FF888880' } };

  sheet.getCell('A4').value = 'Daily Covers';
  sheet.getCell('A4').font = { bold: true };
  sheet.getCell('B4').value = dailyCovers;
  sheet.getCell('B4').font = { bold: true, size: 13 };
  sheet.getCell('B4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRICE_HIGHLIGHT } };
  sheet.getCell('C4').value = '(from your Validator concept data — adjust to test scenarios)';
  sheet.getCell('C4').font = { size: 9, italic: true, color: { argb: 'FF888880' } };

  sheet.getCell('A5').value = 'Operating Days / Week';
  sheet.getCell('A5').font = { bold: true };
  sheet.getCell('B5').value = DEFAULT_OPERATING_DAYS_PER_WEEK;
  sheet.getCell('B5').font = { bold: true, size: 13 };
  sheet.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRICE_HIGHLIGHT } };

  const DAILY_COVERS_CELL = '$B$4';
  const OPERATING_DAYS_CELL = '$B$5';

  const headerRowIdx = 7;
  const headers = ['Item', 'Section', `Total Cost (${currency})`, `Selling Price (${currency})`, 'Food Cost %', `Gross Margin (${currency})`, 'Attachment Rate %', 'Popularity Weight %', 'Est. Weekly Units', `Est. Weekly Revenue (${currency})`, `Est. Weekly Contribution (${currency})`, 'Classification'];
  const headerRow = sheet.getRow(headerRowIdx);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
  styleHeaderRow(headerRow, 12);

  const attachmentBySection = {};
  (sectionAttachmentRates || []).forEach((s) => { attachmentBySection[s.section] = s.attachment_rate_percent; });

  let rowIdx = headerRowIdx + 1;
  const firstDataRow = rowIdx;
  const recapUnitsCellByItem = {};

  items.forEach((item) => {
    const ref = recipeRefs[item.name];
    if (!ref) return;
    const row = sheet.getRow(rowIdx);
    row.getCell(1).value = item.name;
    row.getCell(2).value = item.section;
    row.getCell(3).value = { formula: ref.totalCostCell };
    row.getCell(3).numFmt = '#,##0.00';
    row.getCell(4).value = { formula: ref.sellingPriceCell };
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(5).value = { formula: ref.foodCostPctCell };
    row.getCell(5).numFmt = '0.0%';
    row.getCell(6).value = { formula: ref.marginCell };
    row.getCell(6).numFmt = '#,##0.00';
    row.getCell(7).value = (attachmentBySection[item.section] || 50) / 100;
    row.getCell(7).numFmt = '0%';
    row.getCell(8).value = (item.popularity_weight_percent || 20) / 100;
    row.getCell(8).numFmt = '0%';
    row.getCell(9).value = { formula: `${DAILY_COVERS_CELL}*${OPERATING_DAYS_CELL}*G${rowIdx}*H${rowIdx}` };
    row.getCell(9).numFmt = '#,##0';
    row.getCell(9).font = { bold: true, color: { argb: COPPER } };
    row.getCell(10).value = { formula: `I${rowIdx}*D${rowIdx}` };
    row.getCell(10).numFmt = '#,##0.00';
    row.getCell(11).value = { formula: `I${rowIdx}*F${rowIdx}` };
    row.getCell(11).numFmt = '#,##0.00';
    if ((rowIdx - firstDataRow) % 2 === 1) {
      for (let c = 1; c <= 11; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_ROW } };
    }
    recapUnitsCellByItem[item.name] = `'Recap & Sales Mix'!$I$${rowIdx}`;
    rowIdx++;
  });
  const lastDataRow = rowIdx - 1;

  const avgMargin = `AVERAGE(F${firstDataRow}:F${lastDataRow})`;
  const avgUnits = `AVERAGE(I${firstDataRow}:I${lastDataRow})`;
  for (let r = firstDataRow; r <= lastDataRow; r++) {
    sheet.getCell(`L${r}`).value = {
      formula: `IF(AND(F${r}>=${avgMargin},I${r}>=${avgUnits}),"Star",IF(AND(F${r}>=${avgMargin},I${r}<${avgUnits}),"Puzzle",IF(AND(F${r}<${avgMargin},I${r}>=${avgUnits}),"Plowhorse","Dog")))`,
    };
    sheet.getCell(`L${r}`).font = { bold: true };
  }

  const totalRow = lastDataRow + 2;
  sheet.getCell(`A${totalRow}`).value = 'TOTAL / BLENDED';
  sheet.getCell(`A${totalRow}`).font = { bold: true, color: { argb: NAVY } };
  sheet.getCell(`J${totalRow}`).value = { formula: `SUM(J${firstDataRow}:J${lastDataRow})` };
  sheet.getCell(`J${totalRow}`).numFmt = '#,##0.00';
  sheet.getCell(`J${totalRow}`).font = { bold: true, color: { argb: COPPER } };
  sheet.getCell(`K${totalRow}`).value = { formula: `SUM(K${firstDataRow}:K${lastDataRow})` };
  sheet.getCell(`K${totalRow}`).numFmt = '#,##0.00';
  sheet.getCell(`K${totalRow}`).font = { bold: true, color: { argb: COPPER } };

  const weightedRow = totalRow + 1;
  sheet.getCell(`A${weightedRow}`).value = 'Covers-Weighted Blended Food Cost %';
  sheet.getCell(`A${weightedRow}`).font = { bold: true, color: { argb: NAVY } };
  sheet.getCell(`E${weightedRow}`).value = {
    formula: `SUMPRODUCT(C${firstDataRow}:C${lastDataRow},I${firstDataRow}:I${lastDataRow})/SUMPRODUCT(D${firstDataRow}:D${lastDataRow},I${firstDataRow}:I${lastDataRow})`,
  };
  sheet.getCell(`E${weightedRow}`).numFmt = '0.0%';
  sheet.getCell(`E${weightedRow}`).font = { bold: true, color: { argb: COPPER }, size: 12 };

  sheet.views = [{ state: 'frozen', ySplit: headerRowIdx }];

  return recapUnitsCellByItem;
}

function buildMarketListSheet(workbook, recipeIngredientData, recapUnitsCellByItem, currency) {
  const sheet = workbook.addWorksheet('Market List');
  sheet.properties.tabColor = { argb: COPPER };
  sheet.columns = [
    { width: 26 }, { width: 16 }, { width: 9 }, { width: 14 },
    { width: 16 }, { width: 14 }, { width: 16 }, { width: 16 },
  ];

  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = 'Market List \u2014 Weekly Ordering';
  sheet.getCell('A1').font = { name: 'Georgia', size: 16, bold: true, color: { argb: NAVY } };
  sheet.getRow(1).height = 28;

  sheet.mergeCells('A2:H2');
  sheet.getCell('A2').value = 'Needed Qty is tied live to the Recap tab\u2019s Est. Weekly Units \u2014 adjust Daily Covers there to see quantities update here. Enter your Current Stock to get the actual quantity to order.';
  sheet.getCell('A2').font = { size: 10, italic: true, color: { argb: 'FF888880' } };

  const aggregated = {};
  recipeIngredientData.forEach(({ itemName, category, ingredientCells }) => {
    const unitsCell = recapUnitsCellByItem[itemName];
    if (!unitsCell) return;
    ingredientCells.forEach((line) => {
      const key = `${line.ingredient.trim().toLowerCase()}|${line.unit}`;
      if (!aggregated[key]) {
        aggregated[key] = { ingredient: line.ingredient, category, unit: line.unit, terms: [] };
      }
      aggregated[key].terms.push(`${line.rawQtyCell}*${unitsCell}`);
    });
  });

  const headerRowIdx = 4;
  const headers = ['Ingredient', 'Category', 'Unit', 'Needed Qty (Weekly)', 'Current Stock', 'Qty to Order', `AP Cost/Unit (${currency})`, `Order Cost (${currency})`];
  const headerRow = sheet.getRow(headerRowIdx);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
  styleHeaderRow(headerRow, 8);

  let rowIdx = headerRowIdx + 1;
  const firstDataRow = rowIdx;
  const sorted = Object.values(aggregated).sort((a, b) =>
    a.category.localeCompare(b.category) || a.ingredient.localeCompare(b.ingredient)
  );

  const apCostByKey = {};
  recipeIngredientData.forEach(({ ingredientCellsWithCost }) => {
    (ingredientCellsWithCost || []).forEach((line) => {
      const key = `${line.ingredient.trim().toLowerCase()}|${line.unit}`;
      if (!(key in apCostByKey)) apCostByKey[key] = line.ap_cost_per_unit;
    });
  });

  sorted.forEach((ing) => {
    const key = `${ing.ingredient.trim().toLowerCase()}|${ing.unit}`;
    const row = sheet.getRow(rowIdx);
    row.getCell(1).value = ing.ingredient;
    row.getCell(2).value = ing.category;
    row.getCell(3).value = ing.unit;
    row.getCell(4).value = { formula: ing.terms.join('+') };
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(5).value = 0;
    row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRICE_HIGHLIGHT } };
    row.getCell(6).value = { formula: `MAX(0,D${rowIdx}-E${rowIdx})` };
    row.getCell(6).numFmt = '#,##0.00';
    row.getCell(6).font = { bold: true };
    row.getCell(7).value = apCostByKey[key] || 0;
    row.getCell(7).numFmt = '#,##0.00';
    row.getCell(8).value = { formula: `F${rowIdx}*G${rowIdx}` };
    row.getCell(8).numFmt = '#,##0.00';
    if ((rowIdx - firstDataRow) % 2 === 1) {
      for (let c = 1; c <= 8; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_ROW } };
    }
    rowIdx++;
  });
  const lastDataRow = rowIdx - 1;

  const totalRow = lastDataRow + 2;
  sheet.getCell(`A${totalRow}`).value = 'TOTAL ORDER COST (this week)';
  sheet.getCell(`A${totalRow}`).font = { bold: true, color: { argb: NAVY } };
  sheet.getCell(`H${totalRow}`).value = { formula: `SUM(H${firstDataRow}:H${lastDataRow})` };
  sheet.getCell(`H${totalRow}`).numFmt = '#,##0.00';
  sheet.getCell(`H${totalRow}`).font = { bold: true, color: { argb: COPPER } };

  sheet.views = [{ state: 'frozen', ySplit: headerRowIdx }];
}

async function buildCostingWorkbook(items, costing, concept, currency) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Za3fran Menu Engineer';
  workbook.created = new Date();

  const usedNames = new Set();
  const recipeRefs = {};
  const itemsWithRecipes = [];
  const recipeIngredientData = [];

  items.items.forEach((item) => {
    const recipe = costing.recipes.find((r) => r.name === item.name);
    if (!recipe) return;
    const ref = buildRecipeSheet(workbook, item, recipe, currency, usedNames);
    recipeRefs[item.name] = ref;
    itemsWithRecipes.push(item);
    recipeIngredientData.push({
      itemName: item.name,
      category: (recipe.ingredient_lines[0] && recipe.ingredient_lines[0].category) || 'Other',
      ingredientCells: ref.ingredientCells,
      ingredientCellsWithCost: recipe.ingredient_lines,
    });
  });

  const parsedCovers = parseInt(concept.covers, 10);
  const dailyCovers = (!isNaN(parsedCovers) && parsedCovers > 0) ? parsedCovers : DEFAULT_DAILY_COVERS;

  const recapUnitsCellByItem = buildRecapSheet(workbook, itemsWithRecipes, recipeRefs, costing.section_attachment_rates, dailyCovers, currency);
  buildMarketListSheet(workbook, recipeIngredientData, recapUnitsCellByItem, currency);

  return await workbook.xlsx.writeBuffer();
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
      covers: submission?.covers,
      audience: submission?.audience,
      description: submission?.description,
      differentiation: submission?.differentiation,
    };

    const intake = (run.output_json && run.output_json.intake) || {};
    const currency = run.currency || 'EUR';
    const language = run.language || 'en';
    const model = getModel('menuEngineer');

    await supabase
      .from('menu_engineer_runs')
      .update({
        model_used: model,
        output_json: { ...(run.output_json || {}), status: 'generating', active_model: model, generation_started_at: new Date().toISOString() },
      })
      .eq('id', runId);

    console.log(`[generate-menu] Starting generation for run ${runId} (model: ${model})`);

    let architecture;
    try {
      architecture = await generateArchitecture(model, concept, intake, currency, language);
    } catch (err) {
      throw new Error(`Pass 1 (architecture) failed: ${err.message}`);
    }
    console.log(`[generate-menu] Pass 1 complete: ${architecture.sections.length} sections`);

    let items;
    try {
      items = await generateItems(model, concept, intake, architecture, language);
    } catch (err) {
      throw new Error(`Pass 2 (items) failed: ${err.message}`);
    }
    console.log(`[generate-menu] Pass 2 complete: ${items.items.length} items`);

    let costing;
    try {
      costing = await generateCosting(model, items, architecture, concept, currency, language);
    } catch (err) {
      throw new Error(`Pass 3 (costing) failed: ${err.message}`);
    }
    console.log(`[generate-menu] Pass 3 complete: ${costing.recipes.length} recipes costed, ${(costing.supplier_recommendations?.suppliers || []).length} suppliers`);

    let reportHtml;
    try {
      reportHtml = await generateStrategyReport(model, concept, architecture, items, costing, currency, language);
    } catch (err) {
      throw new Error(`Pass 4 (strategy report) failed: ${err.message}`);
    }
    if (!reportHtml.startsWith('<!DOCTYPE') && !reportHtml.startsWith('<html')) {
      throw new Error('Pass 4 (strategy report) did not return valid HTML');
    }
    console.log(`[generate-menu] Pass 4 complete: ${reportHtml.length} chars`);

    let xlsxUrl;
    try {
      const xlsxBuffer = await buildCostingWorkbook(items, costing, concept, currency);
      xlsxUrl = await uploadXlsx(runId, xlsxBuffer);
    } catch (err) {
      throw new Error(`Costing workbook build/upload failed: ${err.message}`);
    }
    console.log(`[generate-menu] XLSX uploaded: ${xlsxUrl}`);

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
