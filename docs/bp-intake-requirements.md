# Business Plan intake — requirements (recorded 8 Oct 2026)

Status: **requirements only, form not built.** The contract is the intake object documented at the top of
`lib/assumption-resolver.js` (ar-1.3.0). Every question below is bilingual (EN/FR) in the form. Each answer is
stored as a founder figure; anything Za3fran fills in instead is stored with `source: 'estimate'` and shown as
*Estimate* in the plan's appendix, never as a founder figure.

## Blocking (the plan cannot be generated without them)
| Question | Intake field | Why / rule |
|---|---|---|
| Opening month | `opening` (YYYY-MM) | Drives the calendar, Ramadan dates and ramp-up. |
| Services and days | `services[{id, days}]` | Lunch and dinner are separate services. |
| Ramadan: closed / open with reduced trade / normal | `ramadan` | Per-project choice (Arnaud, 8 Oct). Explain: closed = no revenue, rent and payroll continue. Alcohol venues usually close or stop serving alcohol; non-alcohol venues may stay open all day or evenings only. |
| Rent offer **or** surface | `rent_monthly` / `surface_m2` | **A rent offer is mandatory in any city without a Brain rent benchmark** (today: everywhere except Casablanca); the form says why. |
| Staff roster | `roster[{role, count, monthly_gross?}]` | Founder may accept a Za3fran estimated roster instead (labelled estimate). Ask whether the founder works in the business and draws a salary. |
| Investment lines | `investment[...]` | Founder may accept Za3fran estimates (labelled estimate) until the installation & equipment tool exists. Ask the alcohol licence cost (no official fee exists; often a takeover or adviser cost). |
| Funding | `shareholders[{label, amount}]`, `loan{amount, programme?, grace_months?}` | Show the state-guarantee ceiling (1.2M MAD, Intelaka/Damane) and flag a larger loan. Shares are at face value; a premium is a negotiation the plan does not model. |

## Asked, not blocking
- **Ticket per service, menu price including VAT.** Ask lunch and dinner separately (one ticket for both raises `SINGLE_TICKET`). The founder's figure wins; a Brain ticket, when one exists, is shown only as a cross-check (`founder_evidence`).
- **Covers per day or the benchmark.** Show the capacity check live (`checkClaimedCovers`): covers above 85% of seats per service are capped in every scenario. The founder may choose the Brain occupancy instead (`covers_source: 'benchmark'`) — Canaille did.
- **Alcohol served** (`alcohol`): adds the drinks-outlet tax and the licence question.
- **New company?** (`new_company`): the minimum-tax exemption (36 months) applies only to a new company.
- **Rent-free months during works**, rent escalation clause if the lease sets one.
- **Supplier payment days**, loan grace period if the bank offered one, maintenance capex if the founder has a policy.
- **Quotes the founder already holds** (insurance, accounting, security, music rights, laundry): each replaces the Brain line with the same key.

## Shown back to the founder before generation
Total uses including the cash reserve (sized by the engine on the conservative scenario), funding split and
share of capital, debt cover by year, and the list of figures that are estimates.

## Open points for Arnaud
- Drinks-outlet tax base (drinks sales vs all revenue) — supposed drinks sales; confirm with an accountant.
- Intelaka rate for 2026 (2% urban, from 2021 terms) and whether an alcohol-licensed restaurant qualifies.
- Usual length of the Intelaka deferral (exists within the 12-year maximum; no source gives it).
