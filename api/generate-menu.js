// ============================================================
// /api/generate-menu.js
// Menu Engineer generation pipeline — REPOSITIONED as a pure
// costing / analysis / piloting tool. Visual menu design was
// deliberately removed (belongs to a future Marketing & Brand
// tool instead). Two deliverables now:
//   1. Strategy Report — menu engineering discipline: architecture
//      rationale, pricing psychology, Stars/Plowhorses/Puzzles/Dogs
//      projection, and supplier/sourcing recommendations.
//   2. Costing Workbook — a genuine working recipe-costing tool:
//      one tab per recipe with live formulas (yield ratios,
//      seasoning allowance, food cost %, margin), a Recap tab with
//      editable sales-mix volume estimates and menu engineering
//      classification, and a Market List tab for ordering.
//
// 3-pass Claude generation for structured data, 1 pass for the
// HTML report:
//   Pass 1 — menu architecture (sections, item counts, voice)
//   Pass 2 — item list + descriptions
//   Pass 3 — recipe costing data (ingredients, yields, seasoning)
//            + supplier/sourcing recommendations by category
//   Pass 4 (HTML) — strategy report
//
// No manual per-call timeouts — relies solely on the function's
// own maxDuration (600s) as the ceiling, matching the pattern
// already proven stable on Validator and BP Essentials.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { getModel } from '../lib/claude-config.js';
import ExcelJS from 'exceljs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STORAGE_BUCKET = 'menu-engineer-deliverables';
const MARKET_LIST_REFERENCE_BATCH = 10; // base quantities shown per 10 portions of each item

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
  // Sonnet 5+ can insert a "thinking" content block before the text block —
  // never assume content[0] is the text; find it by type.
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
  "menu_voice": "<3-4 words describing appropriate writing tone for item names/descriptions, e.g. 'direct, appetite-driven, concise'>",
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

IMPORTANT — before finalizing: think through what a well-informed local competitor analysis and this audience's expectations would demand from this menu, and make sure every real opportunity is already represented as an actual item below. Do not identify a gap and then leave it unaddressed. Do not include filler items that don't earn their place — every item should be something you'd stand behind if asked "why is this here?"

List 3-6 realistic ingredients per item (used for costing in the next step). Prices should be realistic for a ${concept.ticket || 'mid-range'} ticket concept. Return ONLY the JSON object — write every item, do not truncate.`;

  const text = await callClaude(model, system, user, 16000);
  return parseJsonResponse(text);
}

// ── PASS 3: Recipe costing + supplier recommendations ───────────
const CATEGORY_LIST = 'Produce, Protein, Dairy, Dry Goods & Pantry, Spices & Seasoning, Beverage, Other';

async function generateCosting(model, items, concept, currency, language) {
  const system = `You are an F&B cost accountant and procurement specialist working across MENA and European markets, with deep knowledge of realistic ingredient costs, yield/trim loss ratios, and local sourcing options. You never compute totals yourself — you provide the raw inputs (unit costs, yield percentages, quantities) that a spreadsheet will calculate live. Return ONLY valid JSON, no markdown, no preamble.`;

  const itemList = items.items.map((it, i) =>
    `${i + 1}. ${it.name} (${it.section}) — ingredients: ${it.ingredients.join(', ')} — target price: ${it.suggested_price}`
  ).join('\n');

  const user = `Provide recipe costing inputs and supplier recommendations for this menu, in ${currency}. Return JSON matching exactly this schema:
{
  "recipes": [
    {
      "name": "<must match item name exactly>",
      "ingredient_lines": [
        {
          "ingredient": "<name>",
          "category": "<one of: ${CATEGORY_LIST}>",
          "unit": "<kg|g|l|ml|piece|bunch|dozen>",
          "ap_cost_per_unit": <number, benchmark AS-PURCHASED cost per unit in ${currency}, clearly a realistic regional estimate>,
          "yield_percent": <integer 1-100, usable yield after trim/peel/prep loss — 100 if no loss (e.g. canned goods, packaged items); lower for items with real trim loss (e.g. 75-85 for many fresh vegetables, 60-70 for whole fish before filleting)>,
          "net_qty_required": <number, the actual quantity of this ingredient that ends up in the finished dish, same unit as above>
        }
      ],
      "seasoning_percent": <integer 3-6, allowance for salt/pepper/oil/misc seasoning not individually itemized>
    }
  ],
  "supplier_recommendations": [
    {
      "category": "<one of: ${CATEGORY_LIST}>",
      "sources": [
        {"name": "<real supplier, wholesale market, or specialty source name>", "type": "<Wholesale market|Specialty supplier|Retail chain|Local producer>", "notes": "<why relevant to this concept and region, max 140 chars>"}
      ]
    }
  ]
}

CONCEPT REGION: ${concept.city || 'Not specified'}, cuisine: ${concept.cuisine || 'Not specified'}

ITEMS TO COST (list every ingredient from each item below as a costed line):
${itemList}

For supplier_recommendations: name REAL, specific sources relevant to the concept's region. For Morocco specifically, reference real options like Derb Omar (Casablanca wholesale market), regional souks, Marjane/Carrefour for retail sourcing, or named specialty importers where relevant to the category. Provide 2-3 sources per category that actually appears in this menu's ingredients — do not invent categories with no ingredients.

Return ONLY the JSON object — cost every ingredient of every item, do not truncate.`;

  const text = await callClaude(model, system, user, 28000);
  return parseJsonResponse(text);
}

// ── JS-side cost computation (grounds the report in real numbers, independent of Excel formulas) ──
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

LANGUAGE: Write the entire report in ${language === 'fr' ? 'French' : 'English'}. Be fully consistent — never mix languages.

TONE: Direct, specific, no filler. Balanced — name real strengths and real risks.

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
- Every <section> needs style="page-break-inside:avoid;" inline (except the cover).
- Color palette: Background #FAFAF7, section headers #0F1F3D (navy), accent #C9862A (copper), body text #1a1a1a, muted #888880.
- Typography: Headings 'Cormorant Garamond', Georgia, serif — load from Google Fonts. Body 'DM Sans', Arial, sans-serif.
- Visual weight: use color and callout boxes sparingly — reserve navy/copper callout treatment for the "This Week" box only. Most of the report should read as clean typography with generous white space, not colored blocks. Keep paragraphs concise — 2 tight paragraphs beat 4 padded ones.
- Do not truncate any section.

REQUIRED STRUCTURE:
1. COVER: Concept name (large, serif, navy), "Menu Strategy Report" label in copper uppercase, date.
2. MENU ARCHITECTURE & MARKET FIT: why these sections and this balance were chosen — 2-3 paragraphs. Reference 2-3 specific items by name and the market opportunity or audience need each fills (this is a retrospective validation of decisions already made in the final menu, not a list of things still missing — do not suggest adding or removing items).
3. PRICING STRATEGY & MENU PSYCHOLOGY: how price points relate to the target ticket and market context, plus practical pricing psychology relevant to this concept (price anchoring, ending conventions appropriate to the region, how higher and lower-priced items relate to each other on the page) — 2-3 paragraphs, reference the actual cost/price data provided.
4. MENU ENGINEERING MATRIX: a table projecting each item's likely classification — Star / Plowhorse / Puzzle / Dog — based on food cost % and price-point positioning (since real sales data doesn't exist pre-launch, frame this explicitly as a projection to revisit with actual POS data after opening, not a final verdict). Include brief rationale per item or group.
5. SUPPLIER & SOURCING RECOMMENDATIONS: organized by food category, name the real suppliers/markets/sources provided, with brief guidance on why each fits this concept.
6. THIS WEEK BOX: 2 immediate actions, dark navy background, copper accent text.
7. CLOSING: subtle CTA — "This report was generated by Za3fran's Menu Engineer. Visit za3fran.io or email hello@za3fran.io." Print instruction: "To save this report as a PDF, use your browser's Print function and select 'Save as PDF.'"

Do not include any visual/graphic design guidance, brand identity kits, social media direction, or menu layout design — this report covers menu engineering analysis only. Visual branding and marketing direction are handled by a separate tool.

OUTPUT REQUIREMENT: Return ONLY the HTML document. Start with <!DOCTYPE html> and end with </html>. No preamble, no explanation.`;
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

  const supplierSummary = (costing.supplier_recommendations || []).map((cat) =>
    `${cat.category}: ${cat.sources.map((s) => `${s.name} (${s.type}) — ${s.notes}`).join('; ')}`
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

MENU ITEMS WITH ESTIMATED COSTING:
${itemSummary}

SUPPLIER RECOMMENDATIONS BY CATEGORY:
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

  const headerRowIdx = 4;
  const headers = ['Ingredient', 'Category', 'Unit', `AP Cost/Unit (${currency})`, 'Yield %', 'Net Qty Required', 'Raw Qty to Purchase', `Line Cost (${currency})`];
  const headerRow = sheet.getRow(headerRowIdx);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
  styleHeaderRow(headerRow, 8);

  let rowIdx = headerRowIdx + 1;
  const firstIngredientRow = rowIdx;
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
  };
}

function buildRecapSheet(workbook, items, recipeRefs, currency) {
  const sheet = workbook.addWorksheet('Recap & Sales Mix');
  sheet.properties.tabColor = { argb: NAVY };
  sheet.columns = [
    { width: 26 }, { width: 16 }, { width: 14 }, { width: 14 },
    { width: 12 }, { width: 14 }, { width: 16 }, { width: 16 },
    { width: 16 }, { width: 14 },
  ];

  sheet.mergeCells('A1:J1');
  sheet.getCell('A1').value = 'Menu Recap & Sales Mix Analysis';
  sheet.getCell('A1').font = { name: 'Georgia', size: 16, bold: true, color: { argb: NAVY } };
  sheet.getRow(1).height = 28;

  sheet.mergeCells('A2:J2');
  sheet.getCell('A2').value = 'Enter your estimated monthly units sold per item in the highlighted column to see blended profitability and a projected Star/Plowhorse/Puzzle/Dog classification.';
  sheet.getCell('A2').font = { size: 10, italic: true, color: { argb: 'FF888880' } };

  const headerRowIdx = 4;
  const headers = ['Item', 'Section', `Total Cost (${currency})`, `Selling Price (${currency})`, 'Food Cost %', `Gross Margin (${currency})`, 'Est. Monthly Units', `Est. Revenue (${currency})`, `Est. Contribution (${currency})`, 'Classification'];
  const headerRow = sheet.getRow(headerRowIdx);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
  styleHeaderRow(headerRow, 10);

  let rowIdx = headerRowIdx + 1;
  const firstDataRow = rowIdx;
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
    row.getCell(7).value = 0;
    row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRICE_HIGHLIGHT } };
    row.getCell(8).value = { formula: `G${rowIdx}*D${rowIdx}` };
    row.getCell(8).numFmt = '#,##0.00';
    row.getCell(9).value = { formula: `G${rowIdx}*F${rowIdx}` };
    row.getCell(9).numFmt = '#,##0.00';
    if ((rowIdx - firstDataRow) % 2 === 1) {
      for (let c = 1; c <= 9; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_ROW } };
    }
    rowIdx++;
  });
  const lastDataRow = rowIdx - 1;

  const avgMargin = `AVERAGE(F${firstDataRow}:F${lastDataRow})`;
  const avgUnits = `AVERAGE(G${firstDataRow}:G${lastDataRow})`;
  for (let r = firstDataRow; r <= lastDataRow; r++) {
    sheet.getCell(`J${r}`).value = {
      formula: `IF(AND(F${r}>=${avgMargin},G${r}>=${avgUnits}),"Star",IF(AND(F${r}>=${avgMargin},G${r}<${avgUnits}),"Puzzle",IF(AND(F${r}<${avgMargin},G${r}>=${avgUnits}),"Plowhorse","Dog")))`,
    };
    sheet.getCell(`J${r}`).font = { bold: true };
  }

  const totalRow = lastDataRow + 2;
  sheet.getCell(`A${totalRow}`).value = 'TOTAL / BLENDED';
  sheet.getCell(`A${totalRow}`).font = { bold: true, color: { argb: NAVY } };
  sheet.getCell(`H${totalRow}`).value = { formula: `SUM(H${firstDataRow}:H${lastDataRow})` };
  sheet.getCell(`H${totalRow}`).numFmt = '#,##0.00';
  sheet.getCell(`H${totalRow}`).font = { bold: true, color: { argb: COPPER } };
  sheet.getCell(`I${totalRow}`).value = { formula: `SUM(I${firstDataRow}:I${lastDataRow})` };
  sheet.getCell(`I${totalRow}`).numFmt = '#,##0.00';
  sheet.getCell(`I${totalRow}`).font = { bold: true, color: { argb: COPPER } };

  sheet.views = [{ state: 'frozen', ySplit: headerRowIdx }];
}

function buildMarketListSheet(workbook, costing, currency, referenceBatchSize) {
  const sheet = workbook.addWorksheet('Market List');
  sheet.properties.tabColor = { argb: COPPER };
  sheet.columns = [
    { width: 26 }, { width: 16 }, { width: 9 }, { width: 14 },
    { width: 16 }, { width: 14 }, { width: 16 }, { width: 16 },
  ];

  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = 'Market List \u2014 Ordering Reference';
  sheet.getCell('A1').font = { name: 'Georgia', size: 16, bold: true, color: { argb: NAVY } };
  sheet.getRow(1).height = 28;

  sheet.mergeCells('A2:H2');
  sheet.getCell('A2').value = `Base quantities shown for ${referenceBatchSize} portions of each menu item. Adjust the Order Multiplier column to match your real order volume \u2014 e.g. set to 5 for 50 portions of each item.`;
  sheet.getCell('A2').font = { size: 10, italic: true, color: { argb: 'FF888880' } };

  // Aggregate ingredients across all recipes (matched by name + unit)
  const aggregated = {};
  costing.recipes.forEach((recipe) => {
    (recipe.ingredient_lines || []).forEach((line) => {
      const key = `${line.ingredient.trim().toLowerCase()}|${line.unit}`;
      const yieldFactor = (line.yield_percent || 100) / 100;
      const rawQty = yieldFactor > 0 ? line.net_qty_required / yieldFactor : line.net_qty_required;
      if (!aggregated[key]) {
        aggregated[key] = {
          ingredient: line.ingredient,
          category: line.category || 'Other',
          unit: line.unit,
          apCost: line.ap_cost_per_unit,
          totalRawQtyPerPortion: 0,
        };
      }
      aggregated[key].totalRawQtyPerPortion += rawQty;
    });
  });

  const headerRowIdx = 4;
  const headers = ['Ingredient', 'Category', 'Unit', `AP Cost/Unit (${currency})`, `Base Qty (${referenceBatchSize} portions)`, 'Order Multiplier', 'Total Order Qty', `Total Order Cost (${currency})`];
  const headerRow = sheet.getRow(headerRowIdx);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
  styleHeaderRow(headerRow, 8);

  let rowIdx = headerRowIdx + 1;
  const firstDataRow = rowIdx;
  const sorted = Object.values(aggregated).sort((a, b) =>
    a.category.localeCompare(b.category) || a.ingredient.localeCompare(b.ingredient)
  );
  sorted.forEach((ing) => {
    const row = sheet.getRow(rowIdx);
    row.getCell(1).value = ing.ingredient;
    row.getCell(2).value = ing.category;
    row.getCell(3).value = ing.unit;
    row.getCell(4).value = ing.apCost;
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(5).value = Math.round(ing.totalRawQtyPerPortion * referenceBatchSize * 100) / 100;
    row.getCell(5).numFmt = '#,##0.00';
    row.getCell(6).value = 1;
    row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRICE_HIGHLIGHT } };
    row.getCell(7).value = { formula: `E${rowIdx}*F${rowIdx}` };
    row.getCell(7).numFmt = '#,##0.00';
    row.getCell(8).value = { formula: `G${rowIdx}*D${rowIdx}` };
    row.getCell(8).numFmt = '#,##0.00';
    if ((rowIdx - firstDataRow) % 2 === 1) {
      for (let c = 1; c <= 8; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_ROW } };
    }
    rowIdx++;
  });
  const lastDataRow = rowIdx - 1;

  const totalRow = lastDataRow + 2;
  sheet.getCell(`A${totalRow}`).value = 'TOTAL ORDER COST';
  sheet.getCell(`A${totalRow}`).font = { bold: true, color: { argb: NAVY } };
  sheet.getCell(`H${totalRow}`).value = { formula: `SUM(H${firstDataRow}:H${lastDataRow})` };
  sheet.getCell(`H${totalRow}`).numFmt = '#,##0.00';
  sheet.getCell(`H${totalRow}`).font = { bold: true, color: { argb: COPPER } };

  sheet.views = [{ state: 'frozen', ySplit: headerRowIdx }];
}

async function buildCostingWorkbook(items, costing, currency) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Za3fran Menu Engineer';
  workbook.created = new Date();

  const usedNames = new Set();
  const recipeRefs = {};
  const itemsWithRecipes = [];

  items.items.forEach((item) => {
    const recipe = costing.recipes.find((r) => r.name === item.name);
    if (!recipe) return;
    const ref = buildRecipeSheet(workbook, item, recipe, currency, usedNames);
    recipeRefs[item.name] = ref;
    itemsWithRecipes.push(item);
  });

  buildRecapSheet(workbook, itemsWithRecipes, recipeRefs, currency);
  buildMarketListSheet(workbook, costing, currency, MARKET_LIST_REFERENCE_BATCH);

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
      audience: submission?.audience,
      description: submission?.description,
      differentiation: submission?.differentiation,
    };

    const intake = (run.output_json && run.output_json.intake) || {};
    const currency = run.currency || 'EUR';
    const language = run.language || 'en';
    const model = getModel('menuEngineer');

    // Write the resolved model immediately — ground truth for debugging,
    // unlike model_used which was previously only set once at payment time.
    await supabase
      .from('menu_engineer_runs')
      .update({
        model_used: model,
        output_json: { ...(run.output_json || {}), status: 'generating', active_model: model, generation_started_at: new Date().toISOString() },
      })
      .eq('id', runId);

    console.log(`[generate-menu] Starting generation for run ${runId} (model: ${model})`);

    // ── Pass 1: Architecture ──
    let architecture;
    try {
      architecture = await generateArchitecture(model, concept, intake, currency, language);
    } catch (err) {
      throw new Error(`Pass 1 (architecture) failed: ${err.message}`);
    }
    console.log(`[generate-menu] Pass 1 complete: ${architecture.sections.length} sections`);

    // ── Pass 2: Items ──
    let items;
    try {
      items = await generateItems(model, concept, intake, architecture, language);
    } catch (err) {
      throw new Error(`Pass 2 (items) failed: ${err.message}`);
    }
    console.log(`[generate-menu] Pass 2 complete: ${items.items.length} items`);

    // ── Pass 3: Costing + suppliers ──
    let costing;
    try {
      costing = await generateCosting(model, items, concept, currency, language);
    } catch (err) {
      throw new Error(`Pass 3 (costing) failed: ${err.message}`);
    }
    console.log(`[generate-menu] Pass 3 complete: ${costing.recipes.length} recipes costed, ${(costing.supplier_recommendations || []).length} supplier categories`);

    // ── Pass 4: Strategy report ──
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

    // ── Costing workbook ──
    let xlsxUrl;
    try {
      const xlsxBuffer = await buildCostingWorkbook(items, costing, currency);
      xlsxUrl = await uploadXlsx(runId, xlsxBuffer);
    } catch (err) {
      throw new Error(`Costing workbook build/upload failed: ${err.message}`);
    }
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
