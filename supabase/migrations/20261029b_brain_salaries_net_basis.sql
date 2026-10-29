-- Resolver ar-1.9.0 (Arnaud, 29 Oct 2026): market salaries published net are converted to gross with labour.payroll_rules.
-- Marks the basis of each live labour.salary_monthly row (metadata only: the published figures are unchanged).
--   net:   job-board figures (jobsquare.ma) — they publish net pay; sommelier (basis unknown, treated net: prudent)
--   gross: cleaner (Za3fran judgment anchored on the minimum wage, which is a gross figure)

update brain_parameter_values
set value_json = coalesce(value_json, '{}'::jsonb) || '{"basis":"net"}'::jsonb,
    review_note = concat_ws(' ', review_note, '[29 Oct 2026] Figure is net pay (job-board source); converted to gross by the resolver (ar-1.9.0, payroll rules).')
where parameter_key = 'labour.salary_monthly' and status <> 'superseded'
  and qualifier in ('bartender', 'chef', 'commis', 'cook', 'kitchen_porter', 'manager', 'server', 'sommelier');

update brain_parameter_values
set value_json = coalesce(value_json, '{}'::jsonb) || '{"basis":"gross"}'::jsonb,
    review_note = concat_ws(' ', review_note, '[29 Oct 2026] Figure is gross (anchored on the minimum wage, a gross figure).')
where parameter_key = 'labour.salary_monthly' and status <> 'superseded' and qualifier = 'cleaner';
