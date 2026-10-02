/**
 * Teams on the web (docs/arena-runbook.md §1d): create a team, join one with its code, submit the
 * team's pilot.md -- which the arena commits into the entrants repo, so the repo stays the one
 * record and the sync places the entry exactly as it places a merged pull request.
 *
 * Who may do what, all checked here, server-side:
 *   - identity is the Access email (auth.mjs); a team's members are emails recorded in the ledger
 *     (`team`, `team-member`), so only a member can submit for a team -- a self-claimed handle is
 *     never enough, and a team that exists only on GitHub is read-only here until the organizer
 *     links it (creates the team with those handles and its members' emails);
 *   - the creator is the lead; one learner joins with the team's join code; a second learner
 *     (a team of three) is the organizer's to assign, as the entrants README rules;
 *   - nothing is created, joined or submitted at or after `submissions.cutoff` (midnight Central at
 *     the end of Thursday 15 October, ruling 2026-09-30 05:40 CT);
 *   - each submission is checked by the entrants validator itself (validator.mjs), is at most
 *     `maxPromptBytes`, and counts against per-person and global rate limits.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { CompileError, RateLimiter } from './compile.mjs';
import { EntrantsConflict, EntrantsWriteError, pilotPath } from './entrants_writer.mjs';
import { pendingPlacements, standings } from './ledger.mjs';
import { TEAM_SEP, gitBlobSha, isHandle, validateTeamName } from './prompts.mjs';
import { ValidatorUnavailable, runEntrantsValidator, vendoredValidatorSha } from './validator.mjs';

export const SUBMISSION_DEFAULTS = {
  enabled: true,
  // Friday 16 October 2026 00:00 at UTC-5 (CDT) -- "midnight Central" (entrants README, Rulings).
  cutoff: '2026-10-16T05:00:00Z',
  maxPromptBytes: 32 * 1024,
  perUserPerMinute: 2,
  perUserPerDay: 30,
  globalPerDay: 300,
  joinsPerMinute: 5,
  joinsPerDay: 20,
  python: null,
};

export class TeamError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

/** The folder a team's members name: lead first, then learners in the order they joined. */
export function teamFolder(members) {
  const lead = members.filter((m) => m.role === 'lead');
  return [...lead, ...members.filter((m) => m.role !== 'lead')].map((m) => m.handle).join(TEAM_SEP);
}

/** Where a team's pilot.md is in the repo now: its last web write, else its own folder if the repo has it (a linked team). */
export function entryFolder(team, state) {
  if (team.lastSubmit) return team.lastSubmit.folder;
  const f = teamFolder(team.members);
  return state.prompts.has(f) ? f : null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols: no bias from a byte, no 0/O or 1/I
export function newJoinCode(n = 10) {
  return [...randomBytes(n)].map((b) => CODE_ALPHABET[b % 32]).join('');
}

function sameCode(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** `Fri, Oct 16, 2026, 12:00 AM CT` */
export function fmtCutoff(iso) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) + ' CT';
}

/**
 * @param o.ledger, o.promptStore, o.schemaCache   the arena's own
 * @param o.writer        entrants_writer.mjs, on `config.entrants`
 * @param o.entrantsKind  `gh` | `dir` (a gh repo with no validator upstream counts as drift)
 * @param o.config        `config.submissions`
 * @param o.python        the interpreter for the validator (default: the compiler's)
 * @param o.claimHandle   the server's (user, handle) → handle, which records the claim
 * @param o.sync          the server's entrants sync, run right after a write
 * @param o.jevLadder     compile a submission straight away (what the ladder will play)
 * @param o.visible       (state, job) → whether this viewer may see that match
 * @param o.now           clock seam (ms)
 */
export function makeTeams({ ledger, promptStore, schemaCache, writer, entrantsKind, config = {}, python, claimHandle, sync, jevLadder, log, now = () => Date.now() }) {
  const cfg = { ...SUBMISSION_DEFAULTS, ...config };
  const py = cfg.python ?? python;
  const cutoffMs = Date.parse(cfg.cutoff);
  if (!Number.isFinite(cutoffMs)) throw new Error(`submissions.cutoff is not a date: ${cfg.cutoff}`);
  const submitLimiter = new RateLimiter({ perIpPerMinute: cfg.perUserPerMinute, perIpPerDay: cfg.perUserPerDay, globalPerDay: cfg.globalPerDay }, now, {
    noun: 'submissions',
    per: 'for one person',
    spent: 'a pull request to jamobair-entrants still works',
  });
  const joinLimiter = new RateLimiter({ perIpPerMinute: cfg.joinsPerMinute, perIpPerDay: cfg.joinsPerDay, globalPerDay: Infinity }, now, { noun: 'team attempts', per: 'for one person', spent: '' });
  const validator = { vendored: vendoredValidatorSha(), upstream: null, checkedAt: null };

  const isOpen = () => cfg.enabled && now() < cutoffMs;
  function checkOpen() {
    if (!cfg.enabled) throw new TeamError(404, 'web submissions are turned off on this arena — submit by pull request to jamobair-entrants');
    if (now() >= cutoffMs) throw new TeamError(403, `submissions closed at ${fmtCutoff(cfg.cutoff)} (midnight Central) — teams and entries are frozen`);
  }
  function limited(limiter, key) {
    try {
      limiter.take(key);
    } catch (err) {
      if (err instanceof CompileError) throw new TeamError(429, err.message, { retryAfterSec: err.retryAfterSec });
      throw err;
    }
  }

  /** Called by the sync (and every write) with the upstream validator's blob sha on the ref. */
  function noteUpstreamValidator(sha) {
    validator.upstream = sha;
    validator.checkedAt = new Date(now()).toISOString();
  }
  const drifted = (sha) => (entrantsKind === 'gh' ? sha !== validator.vendored : !!sha && sha !== validator.vendored);
  function checkValidator(sha) {
    noteUpstreamValidator(sha);
    if (drifted(sha)) {
      log?.warn(`arena: the entrants repo's ${'tools/validate_entry.py'} (${sha?.slice(0, 7) ?? 'missing'}) differs from the vendored copy (${validator.vendored.slice(0, 7)}); web submissions refused until it is re-vendored`);
      throw new TeamError(503, 'the entrants validator changed upstream and the arena has not been updated to match, so web submissions are paused — submit by pull request meanwhile, and tell the organizer');
    }
  }
  async function validate(team, text) {
    try {
      return await runEntrantsValidator({ team, text, python: py });
    } catch (err) {
      if (err instanceof ValidatorUnavailable) throw new TeamError(503, err.message);
      throw err;
    }
  }

  const teamFor = (email) => {
    const id = ledger.state().teamOf.get(email);
    return id ? ledger.state().teams.get(id) : null;
  };

  /** A handle is free for `email` if no repo folder or other team names it (case-insensitively). */
  function checkHandleFree(handle, email, { ownFolder = null } = {}) {
    if (!isHandle(handle)) throw new TeamError(400, 'handle must be letters, digits, . _ - (at most 39), as your folder name under entrants/ will use it');
    const state = ledger.state();
    const lc = handle.toLowerCase();
    for (const t of state.teams.values()) {
      const m = t.members.find((x) => x.handle.toLowerCase() === lc);
      if (m && m.email !== email) throw new TeamError(409, `${handle} is already on the team ${teamFolder(t.members)}`);
    }
    for (const folder of state.prompts.keys()) {
      if (folder === ownFolder) continue;
      if (folder.split(TEAM_SEP).some((h) => h.toLowerCase() === lc)) {
        throw new TeamError(409, `entrants/${folder} in jamobair-entrants already names ${handle}. If that is your team, ask the organizer to link it to your login; it keeps working by pull request meanwhile`);
      }
    }
  }

  /** The prose a folder holds now, as the arena last saw it: `{folder, hash, blobSha, text, at}` or null. */
  function current(folder, team = null) {
    if (!folder) return null;
    const state = ledger.state();
    const seen = state.prompts.get(folder);
    const sub = team?.lastSubmit?.folder === folder ? team.lastSubmit : null;
    const pick = sub && (!seen || sub.ts > seen.seenAt) ? { hash: sub.hash, blobSha: sub.blobSha, at: sub.ts, via: 'web' } : seen ? { hash: seen.hash, blobSha: seen.blobSha, at: seen.seenAt, via: 'repo' } : null;
    if (!pick) return null;
    let text = null;
    try {
      text = promptStore.read(folder, pick.hash);
    } catch {
      // not cached (a fresh data dir): the page says so
    }
    return { folder, ...pick, text };
  }

  async function create(user, body) {
    checkOpen();
    if (teamFor(user.email)) throw new TeamError(409, `you are already on the team ${teamFolder(teamFor(user.email).members)}`);
    limited(joinLimiter, user.email);
    const handle = String(body.handle ?? '').trim();
    checkHandleFree(handle, user.email);
    claimHandle(user, handle);
    const teamId = `team-${randomBytes(4).toString('hex')}`;
    ledger.append({ type: 'team', teamId, members: [{ email: user.email, handle, role: 'lead' }], joinCode: newJoinCode(), by: user.email });
    log?.info(`arena: team ${handle} created on the web`);
    return ledger.state().teams.get(teamId);
  }

  async function join(user, body) {
    checkOpen();
    if (teamFor(user.email)) throw new TeamError(409, `you are already on the team ${teamFolder(teamFor(user.email).members)}`);
    limited(joinLimiter, user.email);
    const code = String(body.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const team = [...ledger.state().teams.values()].find((t) => sameCode(t.joinCode, code));
    if (!code || !team) throw new TeamError(404, 'no team has that join code — check it with your lead');
    if (team.members.length >= 2) throw new TeamError(409, 'that team already has its learner — teams of three are assigned by the organizer');
    const handle = String(body.handle ?? '').trim();
    checkHandleFree(handle, user.email);
    const members = [...team.members, { email: user.email, handle, role: 'learner' }];
    const to = teamFolder(members);
    const nameProblems = validateTeamName(to);
    if (nameProblems.length) throw new TeamError(400, nameProblems.join('; '));
    const state = ledger.state();
    if (state.prompts.has(to)) throw new TeamError(409, `entrants/${to} already exists in jamobair-entrants`);
    const from = entryFolder(team, state);
    claimHandle(user, handle);
    if (!from) {
      ledger.append({ type: 'team-member', teamId: team.teamId, email: user.email, handle, role: 'learner', by: user.email });
      return { team: ledger.state().teams.get(team.teamId), moved: null };
    }
    // The team already has an entry: it moves to the folder that names both of them, in one commit.
    const head = await writer.head();
    checkValidator(head.validatorBlobSha);
    const blobSha = head.files.get(pilotPath(from));
    if (!blobSha) throw new TeamError(409, `entrants/${from}/pilot.md is not in the entrants repo any more — ask your lead to submit again first`);
    const text = await writer.readBlob(blobSha);
    const problems = await validate(to, text);
    if (problems.length) throw new TeamError(422, `the entrants validator refuses entrants/${to}: ${problems.join('; ')}`, { problems });
    const { commit } = await write({
      put: { [pilotPath(to)]: { blobSha } },
      remove: [pilotPath(from)],
      expect: { [pilotPath(from)]: blobSha, [pilotPath(to)]: null },
      message: `entrants/${to}: ${handle} joins as learner (moved from entrants/${from})\n\nVia Elysium, the arena's team page.`,
      base: head,
    });
    const hash = promptStore.save(to, text);
    ledger.append({ type: 'team-member', teamId: team.teamId, email: user.email, handle, role: 'learner', by: user.email });
    ledger.append({ type: 'team-submit', teamId: team.teamId, kind: 'rename', folder: to, previousFolder: from, hash, blobSha, commit, by: user.email });
    log?.info(`arena: ${handle} joined ${from} → entrants/${to} (${String(commit).slice(0, 8)})`);
    await sync();
    return { team: ledger.state().teams.get(team.teamId), moved: { from, to, commit } };
  }

  async function write(args) {
    try {
      return await writer.write(args);
    } catch (err) {
      if (err instanceof EntrantsConflict) {
        let currentText = null;
        if (err.currentBlobSha) currentText = await writer.readBlob(err.currentBlobSha).catch(() => null);
        throw new TeamError(409, err.message, { conflict: { path: err.path, currentBlobSha: err.currentBlobSha, currentText } });
      }
      if (err instanceof EntrantsWriteError) throw new TeamError(502, err.message);
      throw err;
    }
  }

  /** Submit or update the team's pilot.md. Resolves to `{folder, commit, hash, blobSha, unchanged}`. */
  async function submit(user, body) {
    const team = teamFor(user.email);
    if (!team) throw new TeamError(403, 'you are not on a team — create one or join one with its code first');
    if (body.team !== undefined && body.team !== '' && body.team !== team.teamId && body.team !== teamFolder(team.members)) {
      throw new TeamError(403, 'only a team’s own members can edit its entry');
    }
    checkOpen();
    const text = String(body.prompt ?? '').replace(/\r\n/g, '\n');
    if (Buffer.byteLength(text, 'utf8') > cfg.maxPromptBytes) {
      throw new TeamError(413, `pilot.md is over ${cfg.maxPromptBytes / 1024} KB, the web form's limit — a larger entry can still go in by pull request`);
    }
    if (body.base === undefined) throw new TeamError(400, 'base is required: the blob sha of the pilot.md you are replacing, or empty for a first submission');
    const base = String(body.base ?? '') || null;
    limited(submitLimiter, user.email);
    const state = ledger.state();
    const from = entryFolder(team, state);
    const to = teamFolder(team.members);
    const head = await writer.head();
    checkValidator(head.validatorBlobSha);
    const problems = await validate(to, text);
    if (problems.length) throw new TeamError(422, `the entrants validator refuses it: ${problems.join('; ')}`, { problems });
    const expect = { [pilotPath(to)]: from === to || !from ? base : null };
    const remove = [];
    if (from && from !== to) {
      expect[pilotPath(from)] = base;
      remove.push(pilotPath(from));
    }
    if (from === to && base && gitBlobSha(text) === base && head.files.get(pilotPath(to)) === base) {
      return { folder: to, commit: null, hash: promptStore.save(to, text), blobSha: base, unchanged: true };
    }
    const member = team.members.find((m) => m.email === user.email);
    const { commit, blobs } = await write({
      put: { [pilotPath(to)]: { text } },
      remove,
      expect,
      message: `entrants/${to}: pilot.md from ${member.handle} (${member.role})\n\nSubmitted on Elysium, the arena's team page; checked by tools/validate_entry.py (blob ${validator.vendored.slice(0, 7)}) before this commit.`,
      base: head,
    });
    const hash = promptStore.save(to, text);
    const blobSha = blobs[pilotPath(to)];
    ledger.append({ type: 'team-submit', teamId: team.teamId, folder: to, previousFolder: from && from !== to ? from : null, hash, blobSha, commit, by: user.email });
    log?.info(`arena: entrants/${to}/pilot.md submitted on the web by ${member.handle} → ${String(commit).slice(0, 8)} (${hash.slice(0, 8)})`);
    await sync();
    if (jevLadder) schemaCache.schemasFor(text).catch(() => {}); // what the ladder will play; status() shows it
    return { folder: to, commit, hash, blobSha, unchanged: false };
  }

  /** Organizer: a team for anyone (a learner with Ceryce as lead, a team of three, or linking a GitHub entry). */
  function organizerCreate(user, body) {
    const people = [['lead', body.leadEmail, body.leadHandle], ['learner', body.learnerEmail, body.learnerHandle], ['learner', body.learner2Email, body.learner2Handle]]
      .map(([role, e, h]) => ({ role, email: String(e ?? '').trim().toLowerCase(), handle: String(h ?? '').trim() }))
      .filter((m) => m.email || m.handle);
    if (!people.length || people[0].role !== 'lead') throw new TeamError(400, 'a team needs its lead');
    const state = ledger.state();
    for (const m of people) {
      if (!m.email.includes('@') || !isHandle(m.handle)) throw new TeamError(400, `each member needs an email and a handle (${m.role}: ${m.email || '?'} / ${m.handle || '?'})`);
      if (state.teamOf.has(m.email)) throw new TeamError(409, `${m.email} is already on the team ${teamFolder(state.teams.get(state.teamOf.get(m.email)).members)}`);
    }
    const folder = teamFolder(people);
    const nameProblems = validateTeamName(folder);
    if (nameProblems.length) throw new TeamError(400, nameProblems.join('; '));
    for (const m of people) checkHandleFree(m.handle, m.email, { ownFolder: folder });
    for (const m of people) if (state.claims.get(m.email) !== m.handle) ledger.append({ type: 'claim', email: m.email, handle: m.handle, by: user.email });
    const teamId = `team-${randomBytes(4).toString('hex')}`;
    ledger.append({ type: 'team', teamId, members: people, joinCode: newJoinCode(), by: user.email });
    return { team: ledger.state().teams.get(teamId), linked: state.prompts.has(folder) };
  }

  function disband(user, teamId) {
    const t = ledger.state().teams.get(teamId);
    if (!t) throw new TeamError(404, 'no such team');
    ledger.append({ type: 'team-disband', teamId, by: user.email });
    return t;
  }

  /** Every entry the arena knows of, web teams and repo folders alike, as the teams page lists them. */
  function rows(user) {
    const state = ledger.state();
    const ladder = new Map(standings(state).map((r) => [r.handle, r]));
    const byFolder = new Map();
    for (const t of state.teams.values()) byFolder.set(entryFolder(t, state) ?? teamFolder(t.members), t);
    const folders = new Set([...state.prompts.keys(), ...byFolder.keys()]);
    return [...folders]
      .map((folder) => {
        const team = byFolder.get(folder) ?? null;
        const members = team
          ? [...team.members].sort((a, b) => (a.role === 'lead' ? -1 : b.role === 'lead' ? 1 : 0)).map((m) => ({ handle: m.handle, role: m.role, ...(user.organizer ? { email: m.email } : {}) }))
          : folder.split(TEAM_SEP).map((handle, i) => ({ handle, role: i === 0 ? 'lead' : 'learner' }));
        const cur = current(state.prompts.has(folder) || team?.lastSubmit ? folder : null, team);
        const onLadder = state.prompts.has(folder);
        const placing = onLadder && (pendingPlacements(state, folder).length > 0 || [...state.jobs.values()].some((j) => j.kind === 'placement' && j.status === 'started' && [j.sides.violet, j.sides.green].some((r) => r.handle === folder)));
        const status = onLadder ? (placing ? 'placing' : 'on the ladder') : cur ? 'submitted — syncing' : 'not submitted yet';
        const s = ladder.get(folder);
        return {
          folder,
          teamId: team?.teamId ?? null,
          source: team ? 'web' : 'github',
          members,
          status,
          hash: cur?.hash ?? null,
          updatedAt: cur?.at ?? team?.createdAt ?? null,
          standing: onLadder && s ? { rank: s.rank, elo: s.elo, current: s.current, allTime: s.allTime, matches: s.matches } : null,
        };
      })
      .sort((a, b) => (a.standing?.rank ?? Infinity) - (b.standing?.rank ?? Infinity) || a.folder.localeCompare(b.folder));
  }

  /** One entry's page: its row, its prose, what the ladder's compiler made of it, its recent matches. */
  function detail(user, folder, visible) {
    const row = rows(user).find((r) => r.folder === folder);
    if (!row) return null;
    const state = ledger.state();
    const team = row.teamId ? state.teams.get(row.teamId) : null;
    const cur = current(row.hash ? folder : null, team);
    const compile = !cur ? null : jevLadder ? schemaCache.status(cur.hash) : { state: 'n/a' };
    const matches = [...state.jobs.values()]
      .filter((j) => !j.scratch && [j.sides?.violet, j.sides?.green].some((r) => r && !r.scratch && r.handle === folder) && visible(j))
      .sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt))
      .slice(0, 20);
    const member = team?.members.some((m) => m.email === user.email) ?? false;
    return { row, current: cur, compile, matches, member, joinCode: member || user.organizer ? team?.joinCode ?? null : null, submits: member || user.organizer ? team?.submits ?? [] : [] };
  }

  return {
    cfg,
    cutoffLabel: fmtCutoff(cfg.cutoff),
    isOpen,
    validator,
    noteUpstreamValidator,
    teamFor,
    teamFolder,
    entryFolder: (team) => entryFolder(team, ledger.state()),
    current,
    create,
    join,
    submit,
    organizerCreate,
    disband,
    rows,
    detail,
  };
}
