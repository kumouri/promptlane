import { esc, page } from './layout.mjs';

/**
 * The compile panel (door B, `docs/entrant-compile-preview.md`): paste prose, read the transparency
 * view `tools/jev/compile.py` printed for it, optionally queue a quick practice match in which Jev
 * plays those compiled rules against the house bot. Server-rendered, no client script — same as
 * every other Elysium page.
 */

/** Inline markdown on already-escaped text: `code`, **bold**, *italic*. */
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,;:)!?]|$)/g, '$1<i>$2</i>');
}

function row(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

/**
 * The small markdown subset `transparency.render_report_markdown` and `compile.py` emit: headings,
 * rules (---), pipe tables, `- ` bullets with indented `  > ` quotes, `> ` quotes, paragraphs.
 * Everything is HTML-escaped before any markup is added, so prose can't inject anything.
 */
export function renderMarkdown(md) {
  const lines = esc(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) { i++; continue; }
    if ((m = /^(#{1,3}) (.*)$/.exec(line))) {
      const level = m[1].length + 1; // the page owns <h1>
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
      i++;
    } else if (/^---+$/.test(line.trim())) {
      out.push('<hr>');
      i++;
    } else if (line.startsWith('|')) {
      const head = row(line);
      i += /^\|[-\s|:]+\|$/.test(lines[i + 1] ?? '') ? 2 : 1;
      const body = [];
      while (i < lines.length && lines[i].startsWith('|')) body.push(row(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`);
    } else if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('  '))) {
        if (lines[i].startsWith('- ')) items.push({ text: lines[i].slice(2), quotes: [] });
        else if (items.length) items[items.length - 1].quotes.push(lines[i].trim().replace(/^&gt; ?/, ''));
        i++;
      }
      out.push(`<ul>${items
        .map((it) => `<li>${inline(it.text)}${it.quotes.length ? `<blockquote>${it.quotes.map(inline).join('<br>')}</blockquote>` : ''}</li>`)
        .join('')}</ul>`);
    } else if (line.startsWith('&gt; ') || line === '&gt;') {
      const q = [];
      while (i < lines.length && lines[i].startsWith('&gt;')) q.push(lines[i++].replace(/^&gt; ?/, ''));
      out.push(`<blockquote>${q.map(inline).join('<br>')}</blockquote>`);
    } else {
      const p = [lines[i++]]; // always consume the first line, whatever it starts with
      while (i < lines.length && lines[i].trim() && !/^(#{1,3} |\||- |&gt;|---+$)/.test(lines[i])) p.push(lines[i++]);
      out.push(`<p>${inline(p.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

const EXTRA_CSS = `<style>
.compiled h2 { font-size: 20px; } .compiled h3 { font-size: 17px; } .compiled h4 { font-size: 15px; color: var(--fg); }
.compiled blockquote { margin: 6px 0 6px 4px; padding: 4px 10px; border-left: 3px solid var(--green); color: #cfcfcf; }
details.inst { border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; margin: 10px 0; }
details.inst > summary { cursor: pointer; font-weight: 600; color: var(--purple); }
</style>`;

function summaryLine(inst, e) {
  if (!e.ok) return `${inst} — not compiled`;
  const flags = [];
  if (e.unmatched_rules?.length) flags.push(`${e.unmatched_rules.length} rule(s) with no clear source`);
  const unclaimed = (e.dropped ?? []).filter((d) => d.label === 'unclaimed_rule').length;
  if (unclaimed) flags.push(`${unclaimed} rule-like sentence(s) compiled to nothing`);
  return `${inst} — ${e.schema.rules.length} rules${flags.length ? ` · ⚠ ${flags.join(' · ')}` : ''}`;
}

export function compilePage({ user, cfg, usage, draft, compiled, flash, practice }) {
  const result = compiled?.result;
  const resultHtml = result
    ? `<h2>Result</h2>
<div class="card compiled">
<p class="dim">Compiled with <code>${esc(result.backend)}</code> — ${esc(result.usage.calls)} model call(s),
${esc(result.usage.total_tokens.toLocaleString('en-US'))} tokens of a ${esc((result.capTokens ?? 0).toLocaleString('en-US'))}-token cap,
${esc(result.usage.wall_seconds)} s. Translation is sampled: compile again and the rules may shift a little —
wording that compiles the same way every time is wording that plays the way you meant.</p>
${Object.entries(result.instruments)
  .map(([inst, e], n) => `<details class="inst" ${n === 0 ? 'open' : ''}><summary>${esc(summaryLine(inst, e))}</summary>
${e.ok ? renderMarkdown(e.markdown) : `<p class="bad">${esc(e.error)}</p>`}
</details>`)
  .join('\n')}
</div>
${practice.enabled
  ? practice.schemas
    ? `<form method="post" action="/compile/practice" class="card">
<input type="hidden" name="compileId" value="${esc(compiled.id)}">
<label for="handle">Your handle (the practice match counts as one quick test against it)</label>
<input type="text" id="handle" name="handle" value="${esc(user.handle ?? '')}" required pattern="[A-Za-z0-9_][A-Za-z0-9._-]*" maxlength="39">
<p><button type="submit">Run a quick practice match vs the house bot</button></p>
<p class="dim" style="margin:0">Jev plays <em>exactly the rules above</em> on your side (3 sim-minutes, never ranked); the house bot plays its usual prompt.
The match page shows each of your bearbots' decisions as <code>{rule, action}</code>.</p>
</form>`
    : '<p class="dim">A practice match needs all three instruments to compile — fix the prose and compile again.</p>'
  : '<p class="dim">Practice matches on Jev are not switched on for this arena (<code>compile.practiceBackend</code>).</p>'}`
    : '';

  const body = `${EXTRA_CSS}
<h1>Compile your prose</h1>
<p>At the jam your prompt isn't read by a chat model: it's <b>compiled</b> into a rule cascade that Jev runs.
Paste your <code>pilot.md</code> to see what it compiles to — the rules, the question Jev is asked for each, the sentence each came from,
and, quoted, everything that <em>didn't</em> compile and why. This is the same view as the local command
(<code>python tools/jev/compile.py pilot.md</code>) and the pull-request bot in jamobair-entrants.</p>
<form method="post" action="/compile">
  <label for="prompt">Your prose (one prompt drives drums, keytar and violin — each is compiled separately; takes about 10–40 s)</label>
  <textarea id="prompt" name="prompt" required placeholder="You are a bearbot on the drums…">${esc(draft ?? '')}</textarea>
  <p class="dim" style="margin:4px 0">${esc(usage.today)} of ${esc(usage.perIpPerDay)} compiles used today from your address · at most ${esc(cfg.perIpPerMinute)} a minute. Nothing you paste is stored past ${esc(cfg.cacheTtlMin)} minutes.</p>
  <p><button type="submit">Compile</button></p>
</form>
${resultHtml}`;
  return page({ title: 'Compile', path: '/compile', user, body, flash });
}
