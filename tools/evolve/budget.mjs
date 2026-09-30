/**
 * The campaign's spend caps and its blackout, enforced in code (docs/prompt-evolution-spec.md §7).
 * Ceryce's rulings: a $15 cap on the first epoch (Q6, 2026-09-30 01:50 CT); "if epoch 1 doesn't take
 * $15, you can go on to epoch 2 ... but don't use more than $25 total" (03:07 CT); no campaign
 * activity from Thu 2026-10-15 17:00 CT through the end of the Jam (Fri 2026-10-16; the Jam moved).
 *
 * `guardDeps` wraps the real (or fake) dependencies `runGeneration` takes. Every paid call goes
 * through a check first, and its cost is written to `spend.json` in the store as soon as it is known:
 *
 *   mutate     the mutator's own `usage.cost_usd` (for the `claude` backend that is what the metered
 *              API would have billed, not real dollars; counted anyway, so the cap is conservative)
 *   compile    compile.py's `usage.cost_usd` (OpenRouter's own figure when it sends one)
 *   playMatch  the Jev spend of the campaign's own `schema_server.py`: its `/health` `cost_usd` read
 *              before and after the match. Exact only because matches run one at a time on a
 *              server nobody else uses, which is the campaign's rule anyway.
 *   observe    free (a local replay), not wrapped
 *
 * A call whose cost can't be read (a crash, a restarted server, no usage in the reply) is charged
 * its kind's `reserveUsd`, the most one call of that kind is expected to cost. So is a call the
 * process died in the middle of: it is written as pending before it starts, and the next guard
 * charges it. The check refuses a call unless its reserve still fits under both the epoch's cap
 * and the total, and refuses anything that could still be running when a blackout starts. A refusal
 * throws `CampaignStop`. `runGeneration` never records it as a failed mutation or compile, so the
 * store stays resumable exactly where it stopped.
 */
export const SPEND_FILE = 'spend.json';

/**
 * How long before a blackout nothing paid may start. The CLI passes the match wall cap
 * (`adapters.mjs::matchWallCapMs`, 22.5 min at the Jam shape); this default is longer than that.
 */
export const DEFAULT_WALL_MARGIN_MS = 30 * 60_000;

/** The ruled caps. `init` copies them into campaign.json; a campaign without them gets these. */
export const DEFAULT_BUDGET = {
  epochCapUsd: 15,
  totalCapUsd: 25,
  // epoch 2 is allowed only after an epoch 1 that stayed under its cap; nothing past it was ruled
  maxEpochs: 2,
  reserveUsd: { mutate: 0.1, compile: 0.02, match: 0.15 },
  blackouts: [
    { start: '2026-10-15T17:00:00-05:00', end: '2026-10-17T00:00:00-05:00', why: 'entrant cutoff through the end of the Jam (Fri 2026-10-16)' },
  ],
};

export class CampaignStop extends Error {
  constructor(reason) {
    super(`campaign stopped: ${reason}`);
    this.name = 'CampaignStop';
    this.reason = reason;
  }
}

export function budgetOf(campaign) {
  const b = campaign.budget ?? {};
  return { ...DEFAULT_BUDGET, ...b, reserveUsd: { ...DEFAULT_BUDGET.reserveUsd, ...(b.reserveUsd ?? {}) } };
}

function readLedger(store) {
  return store.readJson(SPEND_FILE, { entries: [], pending: null });
}

/** Totals from the ledger: overall, per epoch and per kind (USD). */
export function spendTotals(store) {
  const { entries, pending } = readLedger(store);
  const out = { totalUsd: 0, byEpoch: {}, byKind: {}, calls: entries.length, pending };
  for (const e of entries) {
    out.totalUsd += e.usd;
    out.byEpoch[e.epoch] = (out.byEpoch[e.epoch] ?? 0) + e.usd;
    out.byKind[e.kind] = (out.byKind[e.kind] ?? 0) + e.usd;
  }
  return out;
}

function charge(store, entry) {
  const ledger = readLedger(store);
  ledger.entries.push(entry);
  ledger.pending = null;
  store.writeJson(SPEND_FILE, ledger);
}

function usd(n) {
  return `$${n.toFixed(4)}`;
}

/**
 * Throws `CampaignStop` unless a call of `kind` may start at `now`. With no `kind` it only asks
 * whether the campaign may go on at all (the CLI asks before each generation).
 */
export function assertMayContinue(store, campaign, { now = new Date(), kind = null, wallMs = 0 } = {}) {
  const budget = budgetOf(campaign);
  const t = now.getTime();
  for (const w of budget.blackouts ?? []) {
    const start = Date.parse(w.start);
    const end = Date.parse(w.end);
    if (t >= start && t < end) throw new CampaignStop(`blackout ${w.start} to ${w.end} (${w.why})`);
    if (t < start && t + wallMs > start) throw new CampaignStop(`a ${kind} started now could still be running when the blackout starts at ${w.start}`);
  }
  const { epoch } = store.readJson('state.json');
  const totals = spendTotals(store);
  for (let e = 0; e < epoch; e++) {
    const spent = totals.byEpoch[e] ?? 0;
    if (spent >= budget.epochCapUsd) throw new CampaignStop(`epoch ${e} spent ${usd(spent)}, not under its ${usd(budget.epochCapUsd)} cap, so no further epoch`);
  }
  if (epoch >= budget.maxEpochs) throw new CampaignStop(`${budget.maxEpochs} epoch(s) done, the most the budget ruling allows`);
  const reserve = kind ? budget.reserveUsd[kind] : 0;
  const epochSpent = totals.byEpoch[epoch] ?? 0;
  if (epochSpent + reserve > budget.epochCapUsd) throw new CampaignStop(`epoch ${epoch} has spent ${usd(epochSpent)}; a ${kind ?? 'call'} (reserve ${usd(reserve)}) would pass its ${usd(budget.epochCapUsd)} cap`);
  if (totals.totalUsd + reserve > budget.totalCapUsd) throw new CampaignStop(`the campaign has spent ${usd(totals.totalUsd)}; a ${kind ?? 'call'} (reserve ${usd(reserve)}) would pass the ${usd(budget.totalCapUsd)} total cap`);
}

/** The campaign's own Jev spend so far, from its schema server's `/health`; null if unreadable. */
export function makeJevSpend(endpoint) {
  const url = new URL('health', endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
  return async () => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return null;
      const body = await r.json();
      return typeof body.cost_usd === 'number' ? body.cost_usd : null;
    } catch {
      return null;
    }
  };
}

/**
 * `deps` with every paid call checked against the caps and charged to `spend.json`.
 * `now` and `jevSpend` are injectable so the tests need no clock and no server.
 */
export function guardDeps(store, campaign, deps, { now = () => new Date(), jevSpend = makeJevSpend(campaign.jevSchemaEndpoint), wallMs = DEFAULT_WALL_MARGIN_MS, log = () => {} } = {}) {
  const budget = budgetOf(campaign);
  const epochNow = () => store.readJson('state.json').epoch;

  const ledger = readLedger(store);
  if (ledger.pending) {
    // the process died inside a paid call: its cost is unknown, so it costs the reserve
    const p = ledger.pending;
    charge(store, { ...p, usd: budget.reserveUsd[p.kind], measured: false, note: 'interrupted mid-call; charged the reserve', at: now().toISOString() });
    log(`  spend: an interrupted ${p.kind} was charged its reserve ${usd(budget.reserveUsd[p.kind])}`);
  }

  async function paid(kind, label, call, costOf) {
    assertMayContinue(store, campaign, { now: now(), kind, wallMs });
    const epoch = epochNow();
    const before = kind === 'match' ? await jevSpend() : null;
    if (kind === 'match' && before === null) throw new CampaignStop(`can't read the Jev spend at ${campaign.jevSchemaEndpoint}health, so a match can't be accounted for`);
    const ledgerNow = readLedger(store);
    ledgerNow.pending = { kind, label, epoch, at: now().toISOString() };
    store.writeJson(SPEND_FILE, ledgerNow);
    let result;
    let failure = null;
    try {
      result = await call();
    } catch (err) {
      failure = err;
    }
    let cost = await costOf(result, before);
    const measured = typeof cost === 'number' && Number.isFinite(cost) && cost >= 0;
    if (!measured) cost = budget.reserveUsd[kind];
    charge(store, { kind, label, epoch, usd: cost, measured, at: now().toISOString(), ...(failure ? { error: String(failure.message) } : {}) });
    if (failure) throw failure;
    return result;
  }

  return {
    ...deps,
    mutate: (args) => paid('mutate', args.slot, () => deps.mutate(args), (out) => out?.usage?.cost_usd),
    compile: (text, opts) => paid('compile', opts?.id ?? null, () => deps.compile(text, opts), (out) => out?.usage?.cost_usd),
    playMatch: (args) =>
      paid('match', `${args.violet.id} v ${args.green.id} seed ${args.seed}`, () => deps.playMatch(args), async (_out, before) => {
        const after = await jevSpend();
        return after === null || after < before ? null : after - before; // a restarted server reads lower
      }),
  };
}
