/* Brain estimate methods, 9 Oct 2026 (resolver ar-1.5.0). Same JSON as
 * supabase/migrations/20261009_brain_estimate_models.sql (live ids below), plus labour.legal_hours_week.
 * withEstimateMethods(fixture) returns a copy of a Canaille fixture with these rows added.
 */
'use strict';
const MA = '6e6218db-0e40-4fc9-9528-30465935d145';
const STAFFING = {
  "version": "sm-1",
  "overtime_tolerance": 0.2,
  "service_hours": {
    "lunch": {
      "base": 5,
      "low": 4.5,
      "high": 6
    },
    "dinner": {
      "base": 6.5,
      "low": 6,
      "high": 7.5
    },
    "default": {
      "base": 6,
      "low": 5,
      "high": 7
    }
  },
  "fixed": [
    {
      "role": "chef",
      "count": 1,
      "covers": [
        "cook"
      ],
      "note": "One head chef per venue; works the line (covers cook hours)"
    },
    {
      "role": "manager",
      "count": 1,
      "covers": [
        "server"
      ],
      "founder_replaces": true,
      "note": "One floor manager per venue; covers one floor position"
    }
  ],
  "on_duty": [
    {
      "role": "server",
      "seats_per": {
        "base": 18,
        "low": 15,
        "high": 22
      }
    },
    {
      "role": "cook",
      "seats_per": {
        "base": 25,
        "low": 20,
        "high": 30
      }
    },
    {
      "role": "commis",
      "count": 1,
      "min_seats": 40
    },
    {
      "role": "kitchen_porter",
      "count": 1
    },
    {
      "role": "bartender",
      "count": 1,
      "alcohol_only": true
    }
  ]
};
const CAPEX = {
  "version": "cm-1",
  "m2_per_seat": {
    "base": 3.4,
    "low": 3,
    "high": 4
  },
  "lines": [
    {
      "key": "fitout",
      "category": "fitout",
      "per": "m2",
      "base": 3000,
      "low": 2500,
      "high": 4500,
      "label": "Travaux et aménagement / Works and fit-out",
      "note": "Moroccan anchor is one consultancy blog figure for a 200 m² food unit"
    },
    {
      "key": "kitchen_equipment",
      "category": "equipment",
      "per": "seat",
      "base": 7000,
      "low": 5000,
      "high": 10000,
      "label": "Équipement de cuisine / Kitchen equipment",
      "note": "French range for a traditional restaurant, scaled; no Moroccan source"
    },
    {
      "key": "furniture",
      "category": "furniture",
      "per": "seat",
      "base": 3000,
      "low": 2000,
      "high": 5000,
      "label": "Mobilier, décoration, éclairage / Furniture, decor, lighting",
      "note": "French range scaled to local manufacture; judgment"
    },
    {
      "key": "bar_wine",
      "category": "equipment",
      "per": "lump",
      "base": 120000,
      "low": 80000,
      "high": 180000,
      "alcohol_only": true,
      "label": "Équipement de bar / Bar equipment",
      "note": "Wine storage, ice machine, glass washer, coffee machine; judgment"
    },
    {
      "key": "tableware",
      "category": "equipment",
      "per": "seat",
      "base": 1200,
      "low": 800,
      "high": 1800,
      "label": "Arts de la table / Tableware, glassware, linen",
      "note": "Judgment"
    },
    {
      "key": "it",
      "category": "it",
      "per": "lump",
      "base": 50000,
      "low": 30000,
      "high": 80000,
      "label": "Informatique et encaissement / IT, payments, sound, cameras",
      "note": "Judgment"
    },
    {
      "key": "architect",
      "category": "fitout",
      "per": "pct_of",
      "of": [
        "fitout"
      ],
      "base": 0.1,
      "low": 0.07,
      "high": 0.15,
      "label": "Honoraires d'architecte / Architect and design fees",
      "note": "Judgment"
    },
    {
      "key": "setup_legal",
      "category": "preopening",
      "per": "lump",
      "base": 40000,
      "low": 20000,
      "high": 70000,
      "label": "Création, notaire, bail / Company set-up, notary, lease",
      "note": "Judgment"
    },
    {
      "key": "initial_stock",
      "category": "initial_stock",
      "per": "seat",
      "base": 1000,
      "low": 700,
      "high": 1500,
      "alcohol_extra_per_seat": {
        "base": 2000,
        "low": 1300,
        "high": 2900
      },
      "label": "Stock initial / Opening stock",
      "note": "No Moroccan wholesale prices found; judgment"
    },
    {
      "key": "preopening",
      "category": "preopening",
      "per": "preopening",
      "payroll_months": {
        "base": 1,
        "low": 1,
        "high": 1.5
      },
      "chef_extra_months": {
        "base": 1,
        "low": 0.5,
        "high": 2
      },
      "works_months": {
        "base": 3,
        "low": 2,
        "high": 4
      },
      "launch_marketing": {
        "base": 40000,
        "low": 20000,
        "high": 80000
      },
      "label": "Frais de pré-ouverture / Pre-opening costs"
    },
    {
      "key": "contingency",
      "category": "contingency",
      "per": "pct_of",
      "of": [
        "fitout",
        "architect",
        "kitchen_equipment",
        "furniture",
        "bar_wine",
        "tableware"
      ],
      "base": 0.1,
      "low": 0.05,
      "high": 0.15,
      "label": "Imprévus / Contingency",
      "note": "A Moroccan works guide recommends 15%"
    }
  ]
};
const row = (id, key, market, format, q, json, extra = {}) => ({ id, parameter_key: key, market_id: market, format_key: format, qualifier: q,
  value_num: null, low: null, high: null, value_json: json, source_class: 'estimate', effective_source_class: 'estimate',
  status: 'researched', effective_status: 'researched', observed_at: '2026-10-09', ...extra });
const parameters = [
  { key: 'benchmark.staffing_model', scope: 'format', fav: null, unit: 'json', regulatory: false },
  { key: 'benchmark.capex_model', scope: 'local', fav: null, unit: 'json', regulatory: false },
  { key: 'labour.legal_hours_week', scope: 'local', fav: null, unit: 'hours_per_week', regulatory: false },
];
const values = [
  row('60ac8eca-a20e-4a14-bf56-4a92a134d21d', 'benchmark.staffing_model', null, 'bistro_wine_bar', '', STAFFING),
  row('bd89e1e9-fd43-4642-9f56-29f1cbf8ee71', 'benchmark.capex_model', MA, null, 'bistro_wine_bar', CAPEX, { currency: 'MAD' }),
  { ...row('61a696af-58f1-40a8-8092-834664c90c6f', 'labour.legal_hours_week', MA, null, '', null), value_num: '44', source_class: 'published', effective_source_class: 'published' },
];
function withEstimateMethods(fx) {
  return { ...fx, parameters: [...fx.parameters, ...parameters], values: [...fx.values, ...values] };
}
module.exports = { STAFFING, CAPEX, parameters, values, withEstimateMethods };
