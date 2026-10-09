/* Arnaud's occupancy decision, 9 Oct 2026 (migration 20261009d): ramp 6 months from 65%, dinner cruise 70%,
 * +5 points in year 3. withOccupancyDecision(fx) applies it to a Canaille Brain snapshot. */
'use strict';
const rows = {
  'benchmark.ramp_months|': { value_num: 6, low: 4, high: 9 },
  'benchmark.ramp_start_factor|': { value_num: 0.65, low: 0.5, high: 0.8 },
  'benchmark.cruise_occupancy|dinner': { value_num: 0.7, low: 0.55, high: 0.8 },
};
const growth = { id: 'occ-growth-y3-2026-10-09', parameter_key: 'benchmark.occupancy_growth_y3', format_key: 'bistro_wine_bar', market_id: null, qualifier: '',
  value_num: 0.05, low: 0, high: 0.08, unit: 'pct', source_class: 'za3fran_verified', effective_source_class: 'za3fran_verified', status: 'verified', effective_status: 'verified',
  confidence: 'medium', source_name: 'Arnaud Hébrard, F&B operator judgment (decision 9 Oct 2026)', observed_at: '2026-10-09' };
function withOccupancyDecision(fx) {
  const values = fx.values.map((v) => {
    const d = rows[`${v.parameter_key}|${v.qualifier || ''}`];
    return d && v.format_key === 'bistro_wine_bar'
      ? { ...v, ...d, source_class: 'za3fran_verified', effective_source_class: 'za3fran_verified', status: 'verified', effective_status: 'verified', confidence: 'medium' }
      : v;
  });
  const parameters = fx.parameters.some((p) => p.key === 'benchmark.occupancy_growth_y3') ? fx.parameters
    : [...fx.parameters, { key: 'benchmark.occupancy_growth_y3', scope: 'format', fav: 'high', unit: 'pct', regulatory: false }];
  return { ...fx, parameters, values: [...values, growth] };
}
module.exports = { withOccupancyDecision };
