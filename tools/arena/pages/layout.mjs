/**
 * Server-rendered HTML shell for every Elysium page: brand palette (#8e00ff / #00ff0f on black),
 * the Jamobair logo, one nav bar, no framework, no client script. Pages are plain forms and
 * tables so they work on a phone behind Access.
 */

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const CSS = `
:root { --purple: #8e00ff; --green: #00ff0f; --bg: #000; --fg: #e8e8e8; --dim: #9a9a9a; --line: #2a2a2a; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
a { color: var(--green); text-decoration: none; } a:hover { text-decoration: underline; }
header { display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
header img { height: 44px; width: auto; }
header .brand { font-weight: 700; color: var(--purple); font-size: 18px; letter-spacing: .04em; }
nav a { margin-right: 14px; color: var(--fg); } nav a.here { color: var(--purple); font-weight: 600; }
header .who { margin-left: auto; color: var(--dim); font-size: 13px; }
main { max-width: 980px; margin: 0 auto; padding: 18px 16px 48px; }
h1, h2, h3 { color: var(--purple); margin: 18px 0 8px; } h1 { font-size: 24px; } h2 { font-size: 18px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; margin: 8px 0 16px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--dim); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
code, pre { font-family: ui-monospace, Consolas, monospace; font-size: 13px; }
pre { background: #0b0b0b; border: 1px solid var(--line); padding: 10px; overflow: auto; white-space: pre-wrap; }
.card { border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; margin: 10px 0; }
.ok { color: var(--green); } .warn { color: #ffb020; } .bad { color: #ff4060; } .dim { color: var(--dim); }
.violet { color: #b56bff; } .green { color: var(--green); }
form label { display: block; margin: 10px 0 4px; color: var(--dim); font-size: 13px; }
input[type=text], select, textarea { width: 100%; background: #0b0b0b; color: var(--fg); border: 1px solid #444; border-radius: 4px; padding: 8px; font: inherit; }
textarea { min-height: 220px; font-family: ui-monospace, Consolas, monospace; font-size: 13px; }
button, .btn { background: var(--purple); color: #fff; border: 0; border-radius: 4px; padding: 9px 16px; font: inherit; font-weight: 600; cursor: pointer; }
button.secondary { background: #222; color: var(--fg); border: 1px solid #444; }
.row { display: flex; gap: 16px; flex-wrap: wrap; } .row > * { flex: 1 1 220px; }
.flash { border-left: 4px solid var(--green); padding: 8px 12px; margin: 10px 0; background: #071a07; }
.flash.bad { border-color: #ff4060; background: #1a0709; }
footer { color: var(--dim); font-size: 12px; text-align: center; padding: 16px; border-top: 1px solid var(--line); }
.pill { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; border: 1px solid #444; color: var(--dim); }
.pill.run { border-color: var(--green); color: var(--green); } .pill.q { border-color: var(--purple); color: #b56bff; }
`;

const NAV = [
  ['/', 'Home'],
  ['/contract', 'Contract'],
  ['/compile', 'Compile'],
  ['/test', 'Test'],
  ['/ladder', 'Ladder'],
  ['/matches', 'Matches'],
  ['/bracket', 'Bracket'],
];

/** Wrap a page body. `flash` is `{ok, text}` from a redirect after a form post. */
export function page({ title, path, user, body, flash }) {
  const nav = NAV.concat(user?.organizer ? [['/admin', 'Admin']] : [])
    .map(([href, label]) => `<a href="${href}" class="${path === href ? 'here' : ''}">${label}</a>`)
    .join('');
  const who = user ? `${esc(user.email)}${user.handle ? ` · <b>${esc(user.handle)}</b>` : ''}${user.organizer ? ' · organizer' : ''}` : '';
  const flashHtml = flash ? `<div class="flash ${flash.ok ? '' : 'bad'}">${esc(flash.text)}</div>` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Elysium</title><style>${CSS}</style></head>
<body><header><a href="/"><img src="/assets/logo/jamobair-logo-transparent.png" alt="Jamobair"></a>
<span class="brand" title="the promptlane arena">Elysium</span><nav>${nav}</nav><span class="who">${who}</span></header>
<main>${flashHtml}${body}</main>
<footer>InRhythm AI Jam · round one · <a href="https://github.com/kumouri/promptlane">promptlane</a> ·
<a href="https://github.com/kumouri/jamobair-entrants" title="private — ask Ceryce in Slack for access">jamobair-entrants (needs access)</a></footer>
</body></html>`;
}

export function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d) + ' CT';
}

export function fmtDuration(ms) {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function record(r) {
  return `${r.w}-${r.d}-${r.l}`;
}

export function sideLabel(ref) {
  if (!ref) return '?';
  if (ref.practice) return `${ref.handle} (practice · compiled on Jev)`;
  if (ref.scratch) return `${ref.handle} (scratch)`;
  return ref.handle;
}

export function statusPill(job) {
  const map = { queued: 'q', started: 'run' };
  const cls = map[job.status] ?? '';
  return `<span class="pill ${cls}">${esc(job.status)}</span>`;
}
