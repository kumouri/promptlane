#!/usr/bin/env node
/**
 * Match metrics CLI — replay match logs and report how they were played (`metrics.ts`).
 *
 *   node tools/match/metrics.mjs --group before runs/a.json runs/b.json --group after runs/c.json \
 *       --json runs/x-metrics.json --md runs/x-metrics.md --heatmaps runs/x-heatmap
 *
 * Each `--group LABEL` starts a condition; the log files after it belong to it. Outputs:
 *   --json FILE      every match's metrics plus each condition's aggregate (heat grids included)
 *   --md FILE        the condition table, the per-bot table (with "vs position"), and for every
 *                    group after the first, seed-paired differences against the first (95 % CI)
 *   --heatmaps PFX   one PNG per condition, `PFX-<label>.png`: violet's positions left, green's
 *                    right, log-scaled, with lanes, the river and the condition's tower coverage
 * A log whose replay does not reproduce it is still measured but flagged (`replayOk: false`).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { flush, loadHeadless, loadMetrics } from './load.mjs';

const USAGE = `usage: node tools/match/metrics.mjs --group LABEL <log.json>... [--group LABEL <log.json>...]
                                  [--json FILE] [--md FILE] [--heatmaps PREFIX] [--quiet]`;

export function parseArgs(argv) {
  const args = { groups: [], quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--group') args.groups.push({ label: next(), files: [] });
    else if (a === '--json') args.json = next();
    else if (a === '--md') args.md = next();
    else if (a === '--heatmaps') args.heatmaps = next();
    else if (a === '--quiet') args.quiet = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else {
      if (!args.groups.length) args.groups.push({ label: 'all', files: [] });
      args.groups[args.groups.length - 1].files.push(a);
    }
  }
  return args;
}

// --- PNG ---------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A truecolor PNG from `rgb` (width × height × 3 bytes). */
export function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const TEAM_RGB = { violet: [0x8e, 0x00, 0xff], green: [0x00, 0xff, 0x0f] };

/**
 * Two panels (violet, green) of `px` pixels per world unit × 1000; heat is log-scaled per panel.
 * Overlay: lane paths grey, river band dark grey, tower coverage circles white, death sites red.
 */
export function renderHeatmap({ heat, heatN, towers, lanePaths, deathSites = [] }, px = 0.34) {
  const W = Math.round(1000 * px);
  const gap = 6;
  const width = W * 2 + gap;
  const rgb = Buffer.alloc(width * W * 3);
  let clip = [0, W]; // the current panel's x range, so an overlay never bleeds into the other panel
  const set = (x, y, c, alpha = 1) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < clip[0] || y < 0 || x >= clip[1] || y >= W) return;
    const o = (y * width + x) * 3;
    for (let k = 0; k < 3; k++) rgb[o + k] = Math.round(rgb[o + k] * (1 - alpha) + c[k] * alpha);
  };
  ['violet', 'green'].forEach((team, panel) => {
    const ox = panel * (W + gap);
    clip = [ox, ox + W];
    const grid = heat[team];
    const max = Math.max(1, ...grid);
    const cell = W / heatN;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const wx = x / px;
        const wy = y / px;
        const v = grid[Math.min(heatN - 1, Math.floor(y / cell)) * heatN + Math.min(heatN - 1, Math.floor(x / cell))];
        const f = v > 0 ? Math.log1p(v) / Math.log1p(max) : 0;
        const river = Math.abs(wx - wy) < 55 ? 26 : 0;
        set(ox + x, y, TEAM_RGB[team].map((c) => Math.max(river, Math.round(c * f))));
      }
    }
    for (const path of lanePaths) {
      for (let i = 1; i < path.length; i++) {
        const [a, b] = [path[i - 1], path[i]];
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * px);
        for (let s = 0; s <= steps; s++) set(ox + (a.x + ((b.x - a.x) * s) / steps) * px, (a.y + ((b.y - a.y) * s) / steps) * px, [110, 110, 110], 0.5);
      }
    }
    for (const t of towers) {
      const steps = Math.ceil(2 * Math.PI * t.range * px * 1.5);
      for (let s = 0; s < steps; s++) {
        const ang = (2 * Math.PI * s) / steps;
        set(ox + (t.pos.x + Math.cos(ang) * t.range) * px, (t.pos.y + Math.sin(ang) * t.range) * px, [255, 255, 255], 0.55);
      }
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ox + t.pos.x * px + dx, t.pos.y * px + dy, TEAM_RGB[t.team]);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) === 2 || Math.abs(dy) === 2) set(ox + t.pos.x * px + dx, t.pos.y * px + dy, [255, 255, 255]);
    }
    for (const d of deathSites.filter((s) => s.team === team)) {
      for (let k = -2; k <= 2; k++) {
        set(ox + d.pos.x * px + k, d.pos.y * px + k, [255, 40, 40]);
        set(ox + d.pos.x * px + k, d.pos.y * px - k, [255, 40, 40]);
      }
    }
  });
  return encodePng(width, W, rgb);
}

// --- markdown ------------------------------------------------------------------------------------

const pct = (x) => (x === null || x === undefined ? '–' : `${(100 * x).toFixed(1)}%`);
const num = (x, d = 1) => (x === null || x === undefined ? '–' : x.toFixed(d));
const signed = (x, d = 1, asPct = false) => (x === null || x === undefined ? '–' : `${x >= 0 ? '+' : ''}${asPct ? (100 * x).toFixed(1) + 'pp' : x.toFixed(d)}`);

/** Rows of the condition table: [label, key, formatter]. */
export const MATCH_ROWS = [
  ['matches (replay ok)', null, null],
  ['duration, min', 'durationMin', (x) => num(x, 2)],
  ['decided (not a draw)', 'decided', pct],
  ['deaths / min', 'deathsPerMin', (x) => num(x, 3)],
  ['damage / min, all', 'damagePerMin', (x) => num(x, 0)],
  ['damage / min, PvP (bot → enemy bot)', 'pvpDamagePerMin', (x) => num(x, 1)],
  ['damage / min, bot → minions', 'botToMinionPerMin', (x) => num(x, 1)],
  ['damage / min, bot → towers + nexus', 'botToStructurePerMin', (x) => num(x, 1)],
  ['damage / min, towers → bots', 'towerToBotPerMin', (x) => num(x, 1)],
  ['damage / min, minions → bots', 'minionToBotPerMin', (x) => num(x, 1)],
  ['PvP share of bot damage', 'pvpShareOfBotDamage', pct],
  ['bot-time engaged in PvP', 'engagedPvp', pct],
  ['bot-time engaged in PvE only', 'engagedPve', pct],
  ['bot-time intent: targeting a bot', 'intentPvp', pct],
  ['bot-time intent: targeting minion/tower', 'intentPve', pct],
  ['bot-time near a friendly bot', 'nearFriendly', pct],
  ['bot-time on opponent\'s side', 'opponentSide', pct],
  ['…of which near a friendly (gank proxy)', 'nearFriendlyOnOpponentSide', pct],
  ['bot-time under an enemy tower', 'underEnemyTower', pct],
  ['team fights / match', 'teamFightsPerMatch', (x) => num(x, 2)],
  ['team-fight seconds / match', 'teamFightSec', (x) => num(x, 1)],
  ['PvP damage taken in neutral ground', 'pvpDamageNeutral', pct],
  ['PvP damage taken under own tower', 'pvpDamageUnderVictimTower', pct],
  ['PvP damage taken under enemy tower', 'pvpDamageUnderEnemyTower', pct],
  ['PvP damage taken where both cover', 'pvpDamageUnderBoth', pct],
  ["deaths under the killer team's tower", 'deathsUnderEnemyTower', pct],
  ['deaths dealt by a tower', 'deathsToTowers', pct],
  ['gold proxy / min (both teams)', 'goldPerMin', (x) => num(x, 0)],
  ['swinginess: mean \\|d(gold diff)/dt\\| per min, 30 s windows', 'swinginess', (x) => num(x, 0)],
  ['swing ratio (swinginess ÷ gold/min)', 'swingRatio', (x) => num(x, 2)],
  ['lead changes / match', 'leadChanges', (x) => num(x, 2)],
  ['\\|gold diff\\| @3 min', 'absGoldDiffAt3', (x) => num(x, 0)],
  ['\\|gold diff\\| @6 min', 'absGoldDiffAt6', (x) => num(x, 0)],
  ['first blood happened', 'firstBloodRate', pct],
  ['first blood at, s', 'firstBloodSec', (x) => num(x, 0)],
  ['first tower happened', 'firstTowerRate', pct],
  ['towers destroyed / match', 'towersDestroyed', (x) => num(x, 2)],
];

export const BOT_COLS = [
  ['K', 'kills', (x) => num(x, 2)],
  ['D', 'deaths', (x) => num(x, 2)],
  ['A', 'assists', (x) => num(x, 2)],
  ['KP', 'killParticipation', pct],
  ['PvP dmg/min', 'pvpDamagePerMin', (x) => num(x, 1)],
  ['PvE dmg/min', 'pveDamagePerMin', (x) => num(x, 1)],
  ['PvP dmg share', 'pvpDamageShare', pct],
  ['gold/min', 'goldProxyPerMin', (x) => num(x, 0)],
  ['near friend', 'nearFriendly', pct],
  ['opp. side', 'opponentSide', pct],
  ['engaged PvP', 'engagedPvp', pct],
  ['FB kill', 'firstBloodKill', pct],
  ['FB victim', 'firstBloodVictim', pct],
  ['first tower (team)', 'firstTowerTeam', pct],
];

/** One "paired vs baseline" table per non-baseline condition (`metrics.paired`). */
export function pairedMarkdown(baselineLabel, pairedByLabel) {
  const out = [];
  for (const [label, diffs] of Object.entries(pairedByLabel)) {
    out.push('', `**${label} − ${baselineLabel}, seed-paired** (mean difference, 95 % bootstrap interval over pairs, pairs up / down)`, '');
    out.push('| metric | n | Δ mean | 95 % CI | up / down |', '|---|---:|---:|---|---:|');
    for (const [rowLabel, key, fmt] of MATCH_ROWS) {
      if (!key || !diffs[key] || diffs[key].n === 0) continue;
      const d = diffs[key];
      const f = (x) => (fmt === pct ? signed(x, 1, true) : signed(x, key.endsWith('Min') || key.endsWith('PerMatch') ? 2 : 1));
      out.push(`| ${rowLabel} | ${d.n} | ${f(d.meanDiff)} | [${f(d.lo)}, ${f(d.hi)}] | ${d.up} / ${d.down} |`);
    }
  }
  return out.join('\n') + '\n';
}

export function markdown(aggs) {
  const out = [];
  out.push(`| metric | ${aggs.map((a) => a.label).join(' | ')} |`, `|---|${aggs.map(() => '---:').join('|')}|`);
  for (const [label, key, fmt] of MATCH_ROWS) {
    if (!key) out.push(`| ${label} | ${aggs.map((a) => `${a.matches} (${a.replayOk})`).join(' | ')} |`);
    else out.push(`| ${label} | ${aggs.map((a) => fmt(a.match[key])).join(' | ')} |`);
  }
  for (const a of aggs) {
    out.push('', `**${a.label}: per bot** (mean per match; second line = vs the mean of every bot in the same position)`, '');
    out.push(`| bot | n | ${BOT_COLS.map((c) => c[0]).join(' | ')} |`, `|---|---:|${BOT_COLS.map(() => '---:').join('|')}|`);
    for (const b of a.bots) {
      out.push(`| ${b.key} | ${b.matches} | ${BOT_COLS.map(([, k, f]) => f(b.values[k])).join(' | ')} |`);
      out.push(`| ↳ vs ${b.instrument} | | ${BOT_COLS.map(([, k, f]) => (f === pct ? signed(b.vsPosition[k], 1, true) : signed(b.vsPosition[k], k.endsWith('PerMin') ? 1 : 2))).join(' | ')} |`);
    }
  }
  return out.join('\n') + '\n';
}

// --- main ----------------------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.groups.length) {
    console.log(USAGE);
    return args.help ? 0 : 2;
  }
  const metrics = await loadMetrics();
  const headless = await loadHeadless();
  const perGroup = [];
  for (const g of args.groups) {
    const ms = [];
    for (const file of g.files) {
      const log = JSON.parse(await readFile(file, 'utf8'));
      const mm = await metrics.measureLog(log, flush, file);
      if (!args.quiet) {
        console.error(
          `${g.label} ${file}: map=${mm.map} replay=${mm.replayOk ? 'ok' : 'DIVERGED'} winner=${mm.winner ?? 'draw'} deaths=${mm.deaths} ` +
            `pvp-share=${pct(mm.pvpShareOfBotDamage)} fights=${mm.teamFights.length}`,
        );
      }
      ms.push(mm);
    }
    perGroup.push({ label: g.label, matches: ms, aggregate: metrics.aggregate(g.label, ms), map: ms[0]?.map });
  }
  const aggs = perGroup.map((g) => g.aggregate);
  const pairedByLabel = {};
  for (const g of perGroup.slice(1)) pairedByLabel[g.label] = metrics.paired(perGroup[0].matches, g.matches);
  if (args.json) {
    await writeFile(args.json, JSON.stringify({ definitions: {
      PROXIMITY_RADIUS: metrics.PROXIMITY_RADIUS, FIGHT_RADIUS: metrics.FIGHT_RADIUS, ENGAGED_WINDOW_SEC: metrics.ENGAGED_WINDOW_SEC,
      FIGHT_MERGE_GAP_SEC: metrics.FIGHT_MERGE_GAP_SEC, SWING_WINDOW_SEC: metrics.SWING_WINDOW_SEC, ASSIST_WINDOW_SEC: metrics.ASSIST_WINDOW_SEC, GOLD: metrics.GOLD, HEAT_CELL: metrics.HEAT_CELL,
    }, groups: perGroup.map((g) => ({ label: g.label, aggregate: g.aggregate, matches: g.matches.map(({ heat, ...rest }) => rest) })), pairedVs: perGroup[0].label, paired: pairedByLabel }) + '\n');
  }
  const md = markdown(aggs) + (perGroup.length > 1 ? pairedMarkdown(perGroup[0].label, pairedByLabel) : '');
  if (args.md) await writeFile(args.md, md);
  if (args.heatmaps) {
    const { LANE_PATHS } = metrics;
    for (const g of perGroup) {
      const variant = headless.resolveMap(g.map);
      const towers = [];
      for (const lane of ['top', 'mid', 'bottom']) for (const team of ['violet', 'green']) for (const tier of [1, 2]) towers.push({ team, range: variant.towerRange, pos: metrics.towerPos(variant, lane, team, tier) });
      const deathSites = g.matches.flatMap((m) => m.deathSites.map((d) => ({ ...d, team: d.bot < 3 ? 'violet' : 'green' })));
      const png = renderHeatmap({ heat: g.aggregate.heat, heatN: metrics.HEAT_N, towers, lanePaths: Object.values(LANE_PATHS), deathSites });
      const file = `${args.heatmaps}-${g.label}.png`;
      await writeFile(file, png);
      if (!args.quiet) console.error(`heatmap ${file} (${png.length} bytes)`);
    }
  }
  if (!args.md && !args.json) process.stdout.write(md);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`metrics: ${err.stack ?? err.message}`);
      process.exit(2);
    },
  );
}
