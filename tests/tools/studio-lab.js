/* tests/tools/studio-lab.js — Concept Studio lot 1 laboratory (12 Nov 2026).
 *
 * Runs a fictitious profile through the path the router gives it, with the code modules only (no model call):
 * routing -> M6 (premises) -> M2 market reading -> M3 three directions -> M5 districts -> M7 engine figures -> M8 readiness.
 *   node tests/tools/studio-lab.js [out.md]   prints (or writes) the readable French output Arnaud validates
 * The cards' text is lot 2: here every finding is a code with its data, rendered by a fixed French label.
 */
'use strict';
const path = require('path');
const ROUTE = require('../../lib/studio-route.js');
const SEL = require('../../lib/studio-select.js');
const FIG = require('../../lib/studio-figures.js');
const SB = require('../../lib/studio-brain.js');
const BF = require('../../lib/bp-facts.js');

function runProfile(p, { K, brain, today }) {
  const { answers, errors } = ROUTE.normalizeAnswers(p.entry);
  const routing = ROUTE.route(answers);
  const out = { key: p.key, label: p.label, answers, errors, routing };
  if (!routing.profile || routing.profile === 'P4') return out;
  const fd = p.founder;
  const steps = routing.path.map((s) => s.id);
  const prefDistrict = (fd.constraints && fd.constraints.districts && fd.constraints.districts[0]) || (p.premises && p.premises.district) || '';
  const marketPref = SB.marketFor(K, prefDistrict);
  if (steps.includes('M6')) out.fit = SEL.premisesFit({ K, premises: p.premises });
  if (steps.includes('M2')) {
    out.market_targeted = routing.path.find((s) => s.id === 'M2').variant === 'targeted';
    out.market = SEL.marketReading({ K, focus: out.market_targeted ? fd.idea_format : null });
  }
  const invCache = {};
  const investmentOf = (slug) => (invCache[slug] = invCache[slug] || FIG.investmentAtTypicalSize({ format: slug, K, market: marketPref, brain, base: { ...fd, district: prefDistrict }, today }));
  let chosen = fd.idea_format || null;
  if (steps.includes('M3')) {
    const limitTo = out.fit ? out.fit.formats.filter((f) => f.status !== 'incompatible').map((f) => f.slug) : null;
    out.selection = SEL.selectFormats({ K, founder: fd, premisesFit: out.fit, investmentOf, limitTo });
    out.comparison = SEL.comparison(K, out.selection.three, fd);
    chosen = p.choice || out.selection.three[0];
  }
  out.chosen = chosen;
  if (!chosen) return out;
  const m4 = p.m4 || {};
  if (steps.includes('M5')) out.districts = SEL.selectDistricts({ K, format: chosen, surface_m2: m4.surface_m2, prefer: fd.constraints && fd.constraints.districts });
  const district = (p.premises && p.premises.district) || (fd.constraints && fd.constraints.districts && fd.constraints.districts[0]) || (out.districts && out.districts.districts[0] && out.districts.districts[0].name) || '';
  out.district = district;
  if (steps.includes('M7')) {
    const draft = { ...m4, district, budget_amount: fd.budget_amount, own_funds: fd.own_funds, founder_works: m4.founder_works !== false && fd.role !== 'invest' };
    out.figures = FIG.figures({ draft, format: chosen, K, market: SB.marketFor(K, district), brain, today });
    if (out.figures.record) out.ready = FIG.readyForValidator({ record: out.figures.record, origins: out.figures.origins });
  }
  return out;
}

/* ------------------------------ readable output ------------------------------ */

const fmt = (n) => BF.money(n, 'MAD', 'fr');
const pc = (x) => BF.pct(x, 'fr', 0);
const name = (K, slug) => { const f = SEL.formatBySlug(K, slug); return f ? f.name_fr : slug; };
const TYPE = (c) => `${c} (${SEL.ARCHETYPE_LABELS[c].fr})`;
const LEVEL = { low: 'faible', medium: 'moyenne', high: 'élevée', very_high: 'très élevée', unknown: 'non renseignée' };
const SKILL = { kitchen: 'cuisine', floor: 'salle', bar: 'bar', management: 'gestion', unknown: 'non renseignée' };
const SVC = { breakfast: 'matin', lunch: 'déjeuner', dinner: 'soir' };
const CODES = {
  not_proposed_regulatory: 'jamais proposé spontanément (drapeau réglementaire fort)',
  regulatory_first: 'drapeau réglementaire à dire en premier',
  alcohol_core: 'l’alcool est au cœur du format, refusé par le porteur',
  evening_only: 'format du soir seulement, refusé par le porteur',
  too_demanding_for_beginner: 'exigence très élevée pour un débutant',
  thin_sheet_no_clear_match: 'fiche mince, sans lien clair avec les envies',
  premises_incompatible: 'incompatible avec le local',
  premises_condition: 'possible avec le local, sous condition',
  above_budget: 'investissement au-delà du budget × 1,2',
  budget_unchecked: 'budget non vérifiable : taille type du format manquante (fourchettes A9)',
  outside_engine: 'hors moteur (pas de chiffrage)',
  thin_sheet: 'fiche mince : peu de références à Casablanca',
  regulatory_watch: 'point réglementaire à surveiller',
  regulatory_strong: 'drapeau réglementaire fort',
  alcohol_licence: 'licence d’alcool : procédure et coût à confirmer',
  needs_operator: 'demande un exploitant (directeur ou chef associé)',
  needs_partner_skill: 'compétence clé à apporter par un associé',
  founder_presence: 'demande la présence du porteur en salle',
  district_type_mismatch: 'quartier visé d’un autre type que ceux où le format est documenté',
  extraction_required_absent: 'extraction exigée, absente du local',
  extraction_required_possible: 'extraction exigée : à obtenir',
  extraction_required_unknown: 'extraction exigée : à vérifier',
  extraction_desirable: 'extraction souhaitable',
  size_unchecked: 'taille non vérifiable (fourchette du format manquante)',
  investment_above_budget: 'l’investissement seul dépasse le budget',
  reserve_makes_need_above_budget: 'l’investissement tient dans le budget, mais pas avec la réserve de trésorerie du scénario prudent',
  seafront_public_domain: 'front de mer : statut du domaine public maritime et démolitions de 2026 à Aïn Diab — régularité du local et de la terrasse à vérifier',
  own_funds_low_share: 'apports sous 20 % du besoin',
  breakeven_above_capacity: 'le point mort demande plus de remplissage que le plafond retenu',
  rent_share_high: 'loyer au-dessus de 12 % du CA (année 2)',
  cash_negative_conservative: 'trésorerie négative dans le scénario prudent',
  licence_unpriced: 'licence d’alcool non chiffrée',
  own_funds_assumed: 'apports supposés (non donnés)',
  rent_undocumented: 'loyer du quartier non documenté',
  no_density: 'pas de densité OpenStreetMap relevée',
  no_district_card: 'pas de fiche quartier',
};
const code = (c) => CODES[c.code] || c.code;
const LABEL = { rent_monthly: 'loyer', seats: 'places', surface_m2: 'surface', services: 'services', alcohol: 'alcool' };

function render(results, K) {
  const L = [];
  L.push('# Concept Studio — lot 1 : 8 profils fictifs');
  L.push('');
  L.push(`*Sorties du code seul (aucun appel au modèle) sur le Brain lu le ${K.as_of}. Les textes des cartes viennent au lot 2 ; ici chaque constat est un code avec ses données. Aucune note, aucun score : le classement interne sert seulement à choisir et n’est pas affiché.*`);
  L.push('');
  L.push('**À lire comme un opérateur :** les trois pistes ont-elles du sens pour ce porteur ? les quartiers ? les constats chiffrés ? Ce qui cloche se corrige en code avant le lot 2.');
  L.push('');
  L.push('**Tes arbitrages (réponds dans le chat, une ligne par point suffit) :**');
  L.push('1. **Ordre des pistes pour un débutant prudent.** Aujourd’hui les envies pèsent le plus : Salma (aucune expérience, prudente) voit d’abord la boulangerie-pâtisserie (exigence élevée), puis le café-resto (faible). Faut-il faire passer la difficulté avant les envies pour un débutant ?');
  L.push('2. **Réserve de trésorerie.** Quand le scénario prudent perd de l’argent, la réserve devient énorme (Youssef : réserve 2,5 M MAD pour 0,88 M d’investissement). Le Studio le dit comme un constat du moteur (« l’investissement tient dans le budget, mais pas avec la réserve du scénario prudent »). Ça te va, ou veux-tu montrer l’investissement seul face au budget et la réserve à part ?');
  L.push('3. **Équipe estimée.** Café de spécialité de 30 places matin + midi : 9 personnes à l’ouverture (méthode d’équipe de la famille café / brunch). Trop pour ce format ? Si oui, il faudra une méthode d’équipe propre au café de spécialité (c’est un changement de méthode, relancé sur Canaille).');
  L.push('4. **Concept travaillé + local mais budget inconnu** : je l’envoie au Validator (le formulaire demande le budget). D’accord ?');
  L.push('5. **Investisseur sans idée (Mehdi)** : poulet, tacos, pizzeria — les formats « franchise possible » remontent. C’est le bon réflexe pour un investisseur qui n’exploite pas ?');
  L.push('6. **Types de quartier** : tous déduits (« à relire » dans `/brain`, bas de l’onglet Revue). Les classements d’Aïn Diab (D seul), de Gauthier et Maârif (C puis A) et du Centre-ville (C puis E) te paraissent justes ?');
  L.push('');
  L.push('**Limite du jour :** aucune fourchette par format n’est encore remplie dans `/brain` (onglet Fourchettes). Le filtre budget de M3 est donc « non vérifiable » partout ; les chiffres M7 utilisent les tickets, places et surfaces que chaque porteur donne à l’approfondissement (M4).');
  const common = SEL.marketReading({ K });
  L.push('', '## Lecture du marché commune (M2, pour P1 et P6 ; version courte pour P5)', '');
  for (const t of common.types) {
    L.push(`- **${TYPE(t.archetype)}** — ${t.districts.join(', ') || 'aucun quartier classé'}${t.inference ? ' (classement déduit, à relire)' : ''}`);
    if (t.present.length) L.push(`  - Présents (source datée) : ${t.present.map((x) => name(K, x.slug) + (x.venues.length ? ` [${x.venues.map((v) => v.name + ', ' + v.district).join(' ; ')}]` : '')).join(' · ')}`);
    if (t.no_dated_example.length) L.push(`  - Aucun exemple casablancais daté — manque possible, ou limite de nos données : ${t.no_dated_example.map((x) => name(K, x.slug)).join(', ')}`);
    if (t.clusters.length) L.push(`  - Grappes recensées : ${t.clusters.map((c) => `${name(K, c.slug)} à ${c.district} (${c.venues.map((v) => v.name).join(', ')})`).join(' · ')}`);
  }
  L.push('', 'Chaque quartier proposé en M5 porte aussi : à vérifier sur place — passage aux heures des services, stationnement, extraction, autorisation de terrasse, bail et copropriété (activité, alcool), travaux annoncés.');
  for (const r of results) {
    L.push('', '---', '', `## ${r.label}`, '');
    const a = r.answers;
    const A = { none: 'aucune', wish: 'une envie', worked: 'concept travaillé', district: 'un quartier', premises: 'un local', unknown: 'inconnu', range: 'fourchette', amount: 'montant', close: 'proche', pro: 'c’est son métier', operate: 'exploiter', invest: 'investir', casablanca: 'Casablanca', other: 'autre ville' };
    L.push(`Entrée : idée ${A[a.idea]} · lieu ${a.place === 'none' ? 'aucun' : A[a.place]} · budget ${A[a.budget]} · expérience ${A[a.experience]} · rôle ${A[a.role]} · ville ${A[a.city]}`);
    if (!r.routing.profile) { L.push('', `**Hors Casablanca** : le Studio le dit et propose ${r.routing.offer.join(' ou ')}.`); continue; }
    L.push(`Profil ${r.routing.profile} (non affiché au porteur) · chemin : ${r.routing.path.map((s) => s.id + (s.variant ? ` (${s.variant})` : '')).join(' → ')}`);
    if (r.routing.notes.length) L.push(`Notes de routage : ${r.routing.notes.join(', ')}`);
    if (r.routing.profile === 'P4') { L.push('', '**Va directement au Validator**, formulaire pré-rempli de ce qu’il a déjà dit.'); continue; }
    if (r.fit) {
      const by = (s) => r.fit.formats.filter((f) => f.status === s);
      L.push('', `### M6 — Le local (${r.fit.district_types.map(TYPE).join(', ') || 'type inconnu'})`);
      L.push(`- Compatibles : ${by('compatible').map((f) => name(K, f.slug)).join(', ') || 'aucun'}`);
      L.push(`- Sous condition : ${by('condition').map((f) => `${name(K, f.slug)} (${f.reasons.filter((x) => x.code !== 'size_unchecked').map(code).join(' ; ')})`).join(' · ') || 'aucun'}`);
      L.push(`- Incompatibles : ${by('incompatible').map((f) => `${name(K, f.slug)} (${f.reasons.map(code).join(' ; ')})`).join(' · ') || 'aucun'}`);
    }
    if (r.market && !r.market_targeted) { L.push('', '### M2 — Lecture du marché : la lecture commune ci-dessus.'); }
    if (r.market && r.market_targeted) {
      L.push('', '### M2 — Lecture du marché, ciblée sur son format');
      for (const t of r.market.types) {
        if (!t.districts.length && !t.present.length) continue;
        L.push(`- **${TYPE(t.archetype)}** — ${t.districts.join(', ') || 'aucun quartier classé'}${t.inference ? ' (classement déduit)' : ''}`);
        if (t.present.length) L.push(`  - Présents (source datée) : ${t.present.map((x) => name(K, x.slug) + (x.venues.length ? ` [${x.venues.map((v) => v.name + ', ' + v.district).join(' ; ')}]` : '')).join(' · ')}`);
        if (t.no_dated_example.length) L.push(`  - Aucun exemple casablancais daté — manque possible, ou limite de nos données : ${t.no_dated_example.map((x) => name(K, x.slug)).join(', ')}`);
        if (t.clusters.length) L.push(`  - Grappes recensées : ${t.clusters.map((c) => `${name(K, c.slug)} à ${c.district} (${c.venues.map((v) => v.name).join(', ')})`).join(' · ')}`);
      }
    }
    if (r.selection) {
      L.push('', `### M3 — Trois pistes (sur ${r.selection.candidates} formats retenus après filtres)`);
      r.selection.three.forEach((slug, i) => {
        const f = SEL.formatBySlug(K, slug); const s = r.selection.formats.find((x) => x.slug === slug);
        const ex = (f.examples.top || []).slice(0, 2).map((e) => `${e.name} (${e.city}, ${e.country}${e.date ? ', ' + e.date : ', sans date'})`).join(' ; ');
        L.push(`${i + 1}. **${f.name_fr}**${s.own ? ' — son idée' : ''} · types de quartier ${f.traits.archetypes.map(TYPE).join(', ') || '—'} · compétence clé ${SKILL[f.traits.key_skill] || '—'}`);
        if (s.warnings.length) L.push(`   - À dire : ${[...new Set(s.warnings.map(code))].join(' ; ')}`);
        if (f.pitfalls[0]) L.push(`   - Ce qui coince (catalogue) : ${f.pitfalls[0].text}`);
        if (f.gaps[0]) L.push(`   - Ce que nous ne savons pas : ${f.gaps[0].text}`);
        if (ex) L.push(`   - Exemples : ${ex}`);
      });
      L.push('', '| Piste | Exigence d’exploitation | Compétence clé | Risque | Adéquation au profil | Connaissance |', '|---|---|---|---|---|---|');
      const RISK = { regulatory_strong: 'réglementaire fort', alcohol_licence: 'licence d’alcool', regulatory_watch: 'à surveiller', ordinary: 'ordinaire' };
      const FIT = { matches: 'correspond', learnable: 'accessible', needs_partner: 'avec un associé', needs_operator: 'exploitant à recruter', franchise_ok: 'franchise possible' };
      for (const c of r.comparison) L.push(`| ${name(K, c.slug)} | ${LEVEL[c.operating_demand]} | ${SKILL[c.key_skill]} | ${RISK[c.risk]} | ${FIT[c.profile_fit]} | ${c.knowledge === 'thin' ? 'mince' : 'documentée'} |`);
      const ex = r.selection.formats.filter((x) => x.status === 'excluded' && x.excluded.some((e) => e.code !== 'premises_incompatible'));
      if (ex.length) L.push('', `Écartés : ${ex.map((x) => `${name(K, x.slug)} (${[...new Set(x.excluded.map(code))].join(' ; ')})`).join(' · ')}`);
    }
    L.push('', `### Piste retenue pour la suite : ${name(K, r.chosen)}`);
    if (r.districts) {
      L.push('', '### M5 — Quartiers (jamais une adresse)');
      if (!r.districts.districts.length) L.push(`Aucun quartier compatible (${r.districts.none_reason}).`);
      for (const d of r.districts.districts) {
        const why = d.reasons.map((x) => {
          if (x.code === 'district_type') return `type ${x.data.types.map(TYPE).join(', ')}${x.data.inference ? ' (déduit)' : ''}`;
          if (x.code === 'founder_choice') return 'choisi par le porteur';
          if (x.code === 'same_format_cluster') return `déjà ${x.data.venues.length} lieux du même format recensés (${x.data.venues.map((v) => v.name).join(', ')})`;
          if (x.code === 'same_format_present') return `un lieu du même format recensé (${x.data.venues[0].name})`;
          if (x.code === 'no_same_format_recorded') return 'aucun lieu du même format recensé (manque possible, ou limite de nos données)';
          if (x.code === 'same_family_nearby') return `concurrence proche recensée (même famille) : ${x.data.venues.map((v) => v.name).join(', ')}`;
          if (x.code === 'district_type_mismatch') return 'type de quartier différent de ceux du format';
          return x.code;
        });
        const rent = d.rent ? `loyer ${fmt(d.rent.m2)}/m²/mois (Mahaly.ma, oct. 2026)${d.rent.monthly_for_surface ? `, soit ${fmt(d.rent.monthly_for_surface)} par mois pour la surface visée` : ''}` : 'loyer non documenté — à demander aux agences';
        L.push(`- **${d.name}** — ${rent} ; ${why.join(' ; ')}${d.unknowns.filter((u) => u.code !== 'rent_undocumented').length ? ` ; à savoir : ${d.unknowns.filter((u) => u.code !== 'rent_undocumented').map(code).join(', ')}` : ''}`);
      }
    }
    if (r.figures) {
      const onReq = r.routing.path.some((x) => x.id === 'M7' && x.variant === 'on_request');
      L.push('', `### M7 — Ordres de grandeur (${r.district || 'Casablanca'})${onReq ? ' — sur demande pour ce profil' : ''} — estimations à confirmer, jamais un verdict`);
      const g = r.figures;
      if (g.status !== 'computed') L.push(`Pas de chiffrage : ${g.status}${g.gaps && g.gaps.length ? ' — manque ' + g.gaps.map((x) => x.path || x.code).join(', ') : ''}.`);
      else {
        const F = g.figures;
        L.push(`- Investissement hors réserve : ${fmt(F.investment.total_excl_reserve)} (haut de fourchette ${fmt(F.investment.high_excl_reserve)}) ; réserve de trésorerie : ${fmt(F.investment.reserve)} ; besoin total : ${fmt(F.funding_need)}`);
        L.push(`- Budget annoncé ${fmt(F.budget)}, apports ${fmt(F.own_funds)} ; emprunt nécessaire ${fmt(F.loan_needed)}`);
        L.push(`- Effectif à l’ouverture : ${F.headcount} ; masse salariale chargée année 1 : ${fmt(F.payroll_monthly_y1)} par mois`);
        L.push(`- CA HT année 3 : ${fmt(F.revenue_y3_range.base)} (prudent ${fmt(F.revenue_y3_range.conservative)}, favorable ${fmt(F.revenue_y3_range.optimistic)})`);
        L.push(`- Point mort : ${F.breakeven.covers_per_open_day} couverts par jour d’ouverture (remplissage ${pc(F.breakeven.occupancy)}) ; prévu en année 2 : ${F.covers_per_day_y2} couverts par jour`);
        L.push(`- Loyer retenu : ${fmt(F.rent.monthly)} par mois, ${pc(F.rent.share_y2)} du CA en année 2`);
        if (g.findings.length) L.push(`- **Constats du moteur** : ${g.findings.map((x) => code(x) + (x.data && x.data.shortfall ? ` (écart ${fmt(x.data.shortfall)})` : '') + (x.data && x.data.share != null && x.code === 'rent_share_high' ? ` (${pc(x.data.share)})` : '')).join(' ; ')}`);
        const est = Object.entries(g.origins).filter(([, o]) => o.source !== 'founder').map(([k, o]) => `${LABEL[k] || k} (${o.source === 'estimate' ? 'estimation Za3fran' : o.source === 'brain_rent' ? 'loyer du Brain au m² × surface' : 'catalogue'})`);
        L.push(`- Hypothèses : tout vient du porteur${est.length ? ', sauf ' + est.join(', ') : ''}. Équipe et investissement : estimations Za3fran du moteur.`);
      }
    }
    if (r.ready) L.push('', `### M8 — Prêt pour le Validator : ${r.ready.ready ? 'oui' : 'non, manque ' + r.ready.missing.join(', ')}${r.ready.to_confirm.length ? ` · marqué « à confirmer » : ${r.ready.to_confirm.map((k) => LABEL[k] || k).join(', ')}` : ''}`);
  }
  return L.join('\n') + '\n';
}

if (require.main === module) {
  const K = require('../fixtures/studio-knowledge-2026-11-12.js');
  const brain = require('../fixtures/studio-engine-brain.js');
  const profiles = require('../fixtures/studio-profiles.js');
  const results = profiles.map((p) => runProfile(p, { K, brain, today: '2026-11-12' }));
  const md = render(results, K);
  if (process.argv[2]) require('fs').writeFileSync(path.resolve(process.argv[2]), md); else process.stdout.write(md);
}

module.exports = { runProfile, render };
