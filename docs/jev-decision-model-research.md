# "Jev" / type-one models — identification, and what the arena would become on one

*Research note, 2026-09-22. No code, prompt, sim, model-server, or arena behaviour changed by this
note. No paid inference was run. Every number below is either a vendor claim (labelled), an
independent third-party claim (labelled), or a measurement already checked into this repo (labelled
and cited). Where I could not verify something, I say so instead of guessing.*

This memo answers a request from Ceryce (Telegram, 2026-09-22 21:29–21:42 CT): identify a model
category she called "type one models" from a company she recalled, hedged, as "Typesafe AI", and —
if identified — say what adapting `promptlane`'s jam arena to it would take, what it would cost,
how fast it could run, and how the entrant-facing prompts would have to change.

## 1. Identification — confident, not a guess

**This is TypeSafe AI's "Jev", the first model in a category they call "System One models".**
Confidence: high. Independent corroboration below comes from the vendor's own blog and docs, a
trade-press writeup, an SDK integration (Pydantic AI), a hosting catalog (Cloudflare Workers AI),
and a well-known independent commentator (Simon Willison) — five sources that agree on the same
shape, the same numbers, and the same launch date, with no daylight between them on the facts that
matter here.

- **Vendor primary sources:** [TypeSafe AI's launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
  and [docs.typesafe.ai](https://docs.typesafe.ai/introduction) (fetched 2026-09-22). Jev launched
  **2026-09-15**, the same day TypeSafe AI came out of stealth with a $40M seed led by DCVC,
  founded by Diogo Almeida (previously OpenAI, an InstructGPT co-author).
- **Trade press:** [The Register, 2026-09-16](https://www.theregister.com/ai-and-ml/2026/09/16/typesafe-ai-debuts-model-for-machines-that-plays-doom/5296711),
  ["TypeSafe AI debuts model for machines that plays Doom"](https://www.theregister.com/ai-and-ml/2026/09/16/typesafe-ai-debuts-model-for-machines-that-plays-doom/5296711).
- **Independent commentary:** [Simon Willison, 2026-09-21, "Jev introduces a new shape of
  LLM—System One, aka Decision Models"](https://simonwillison.net/2026/Sep/21/jev/).
- **Third-party integration docs (confirms the wire shape independently of TypeSafe's own claims):**
  [Pydantic AI's TypeSafe/Jev model docs](https://pydantic.dev/docs/ai/models/typesafe/) and
  [Cloudflare Workers AI's Jev model page](https://developers.cloudflare.com/ai/models/typesafe/jev/)
  (both fetched 2026-09-22).
- **API reference (fetched 2026-09-22):** [docs.typesafe.ai/api.md](https://docs.typesafe.ai/api.md),
  [docs.typesafe.ai/models](https://docs.typesafe.ai/models).

**Her identification checks out on every specific she gave:** "type one models" → TypeSafe AI's own
name for the category is "**System One models**" (she reconstructed it slightly, understandably —
it's a new coinage); "don't output human text, output structured decisions" → exactly Jev's pitch,
verified independently by Pydantic AI's integration and Cloudflare's model catalog, not just
TypeSafe's own copy; "Typesafe Ai … iirc" → correct, spelled `TypeSafe AI`.

**The confound flagged in the brief did not materialize.** *Typesafe* (no space) is indeed the
former name of Lightbend (Scala/Akka), and a search that stopped at the name alone could plausibly
collide with that. It didn't: every source above is a distinct company at `typesafe.ai` (blog,
docs, console), unrelated to Lightbend's old branding, and nothing in the evidence points at Scala,
Akka, or Lightbend at all. I'm treating this as resolved, not just unconfirmed.

### What Jev actually is

A **decision model, not a language model.** Per TypeSafe's own framing (their launch post) and
independently confirmed by Pydantic AI's docs: you send it **unstructured `state`** (text, a JSON
object, or an array of text) plus a set of **typed questions**, and it answers all of them **in
parallel**, in one call, with **no free text generated anywhere in the loop**. Three question
primitives:

| Type | Answers | Shape |
|---|---|---|
| `noul` | a calibrated yes/no probability (0–1) | `{"noul": 0.95}` |
| `choice` | pick one of up to 255 predefined options | `{"choice": "...", "probabilities": {...}, "confidence": 0.81}` |
| `score` | a value on a continuous rubric | `{"score": 1.05, "legend": {...}, "probabilities": {...}, "confidence": ...}` |

Request: `POST https://api.typesafe.ai/v1/systemone`, `{state, model, questions: {id: {type,
instructions, criteria}}}`. Response: `{model, answers: {id: {...}}, usage: {input_tokens,
output_tokens}}`. (Full shapes: §3 below.) TypeSafe's claim, load-bearing for the whole "why bother"
case: **schema matching is guaranteed and type errors are mathematically impossible** — there is no
JSON to parse, because the wire format never contains free text to begin with.

## 2. Her framing, taken seriously: what would the arena become, not "it doesn't fit"

Ceryce already knows Jev isn't a text model — that's the premise, not a problem to report back to
her. The real questions are what the arena would have to become to run on it, whether that's a
better arena, and whether the prize (some multiple of cheaper-and-faster, "in suitable tasks") is
real for *this* task. Answering those:

**Her recollected numbers, checked against the vendor's actual claims.** She hedged
"200x cheaper and 40x faster (or the other way around)". The real published numbers, single-call:
**20–200x faster, 40–400x cheaper** than "frontier LLMs" (TypeSafe launch post, 2026-09-15/16) —
so her hedge was closer to right than wrong; the true multiples are a range, and the top of that
range is what's quoted in headlines. On TypeSafe's own four-workflow evaluation (comparing Jev
against "the average of GPT-6 Astra and Fable 5.1" as the reference answer) the measured multiples
were **193.6x faster, 444.6x cheaper** — but TypeSafe's own post attaches two caveats to that
number, quoted directly: *"we expect that these are on the higher end of real world gains"* and
*"these comparisons were made by individuals on our model capabilities team, so some bias could
exist."* Treat 193.6x/444.6x as a vendor best case, not a baseline to plan around. Pricing itself is
plain and public: **$0.042 per million input tokens, output tokens free** (TypeSafe blog and docs,
2026-09-15/22) — for comparison, that's roughly half the input price of `qwen/qwen3-32b` on
OpenRouter ($0.08/M, see `hosted-model-options.md` §2), with output free instead of $0.28/M, though
"free" is annotated "too cheap to meter" rather than a permanent commitment.

**The "in suitable tasks" qualifier is the whole ballgame, and it cuts both ways for this workload.**
Two pieces of independent evidence, not vendor copy:

- *Against suitability:* Simon Willison's independent write-up states Jev "is currently not great
  with numbers, dates, or adversarial content" ([simonwillison.net, 2026-09-21](https://simonwillison.net/2026/Sep/21/jev/)).
  The arena's entire game state is numbers — `hp`, `maxHp`, `pos: {x,y}`, `moveSpeed`,
  `cooldowns: {ability: secondsRemaining}` (`tools/arena/pages/contract.mjs:18-35`, the `Observation`
  shape). If Jev is weak specifically on the one thing this workload is made of, that is a
  first-order risk to the whole idea, not a footnote — and it is the single most important reason
  Q3/Q4 below say "test it for real" rather than "yes, do it."
- *For suitability:* TypeSafe's own **Doom demo** is structurally the closest thing to this arena
  that exists today: **structured game state → a bounded set of candidate actions → Jev picks one
  by `choice`**, at ~10 decisions/second, ~$7/hour, with a head-to-head figure of **0.114s/decision
  for Jev vs. 8.566s/decision for "GPT-5.6 Terra" on the same frames** (The Register, 2026-09-16;
  corroborated by multiple independent write-ups of the same demo). That is the same shape as one
  bearbot's decide-loop — real-time control from structured state, not free-form reasoning — and it
  is a working demo, not just a benchmark claim, even though TypeSafe built and ran it themselves.

Net: the case for "suitable" rests on a real demo of the *same shape* of task; the case against
rests on an independent claim that the model is weak at exactly the *content* (numbers) that shape
is made of here. Nobody has run this specific workload on Jev. That gap is why §5 below proposes a
cheap, concrete test rather than a recommendation to switch.

## 3. Q1 — Is there a public preview we could actually run?

**Yes, no waitlist, self-serve, API-only, closed weights.** All labelled by source and date:

- **Access (published):** early access opened 2026-09-15; the waitlist was **removed 2026-09-20**
  — TypeSafe's own note: *"Jev is now available to everyone. No waitlist."* Sign-up is self-serve at
  `console.typesafe.ai`. (Multiple 2026-09-20/21 secondary sources agree; I could not reach a
  TypeSafe first-party page stating the waitlist removal directly — flagging as published-by-
  secondary-source, not vendor-primary, though corroborated across several independent write-ups.)
- **Self-hostable?** No. **Weights are closed.** There is no download, no local build, no
  self-hosting — only TypeSafe's managed API, or a provider that already holds a key on your
  behalf (Cloudflare Workers AI re-exposes the same model, `jev-1.13.0`, through its own gateway —
  [developers.cloudflare.com/ai/models/typesafe/jev](https://developers.cloudflare.com/ai/models/typesafe/jev/),
  fetched 2026-09-22).
- **Cost (published):** $0.042/M input tokens, output free-as-of-now. No credits/free-tier detail
  found; unverified whether a card is required to get a key — **I don't know this, and didn't find
  it**, rather than guessing.
- **Rate limits (published, and explicitly unstable):** **1,200 requests/minute and 250,000
  tokens/second** per the docs, with the docs' own words that *"rate limits are adjusting
  dynamically because the company is serving a very large volume of demand, and the limits above
  can change without notice."* Custom/enterprise limits exist via `sales@typesafe.ai`. Exceeding
  either returns `429`.
- **Terms of service:** **not found.** I looked; nothing turned up a ToS document distinct from the
  general docs. Don't take my silence here as "no unusual terms" — it means unverified, and if this
  goes further, someone should actually read TypeSafe's ToS before any real spend.
- **What getting access would take from here:** create a `console.typesafe.ai` account, generate an
  API key, set it as an env var — no different in kind from the `OPENROUTER_API_KEY` /
  `OPENAI_API_KEY` pattern `tools/model_server.py` already uses. The gate is entirely "do we want to
  do this," not "can we get in."

## 4. Q2 — What would adapting the arena take?

**Not "a config entry and a flag." A new backend kind, and a change to what the pilot's prompt even
is — read together with §6 below, this is the deepest incompatibility.**

`tools/model_server.py`'s `Backend` abstraction (read in full for this note) is `complete(prompt:
str) -> str` — every existing backend (`ollama`, `claude`, `openrouter`, `openai`) is a "hand it one
text blob, get one text blob back" adapter, because all four are chat-completions-shaped underneath.
Phase C's `OpenAIBackend` (merged today) generalised the *wire format* of that family — base URL,
key env var, provider pinning — but every member of the family still agrees on the fundamental
shape: **one prompt string in, one reply string out**, which is also exactly the contract
`src/pilots/callModel.ts`'s `CallModel = (prompt: string) => Promise<string>` and
`tools/model_server.py`'s own `POST {"prompt": ...} -> {"reply": ...}` HTTP contract assume end to
end.

**Jev has no `prompt` field at all.** Its request is `{state, questions: {id: {type, instructions,
criteria}}}` — a piece of state, plus a *named, typed set of decision points* to evaluate against
it. There is nowhere to put "the entrant's entire pilot.md text, concatenated with the fixed reply
instruction, concatenated with the Observation JSON" (which is exactly what
`PromptPilot.buildPrompt`, `src/pilots/promptPilot.ts:33-42`, does today) as a single string, because
Jev's API was never designed to receive a monolithic prompt — it was designed to receive data
(`state`) and a schema of questions about that data, as two separate, structured things.

Concretely, three specific incompatibilities, as asked:

1. **Request shape.** Chat-completions `messages: [{role, content}]` vs. Jev's `state` +
   `questions`. Not a header or field rename — a different mental model of what a "call" is.
2. **Schema/grammar declaration.** Today's "schema" is one English sentence
   (`REPLY_INSTRUCTION` in `src/pilots/promptPilot.ts:37`, also served verbatim at
   `tools/arena/pages/contract.mjs:15-16`) plus a permissive regex (`parseAction`,
   `promptPilot.ts:45-55`, which just greps for the first `{`…last `}` and validates `kind`). Jev
   *requires* the schema up front, per call, as the `questions` object — there is no equivalent of
   "describe the shape in prose and hope." This is stricter and, per TypeSafe, unbreakable — but it
   means the schema has to be declared in code, not written by the entrant in prose (see §6).
3. **How a decision comes back.** Today, one model call returns one `Action` object
   (`{kind, target?, ability?}`) that the game applies directly. Jev returns **one typed answer per
   named question** — there is no single "the decision"; there's an answer set. Assembling that
   into an `Action` becomes the game's own code's job (e.g., a `choice` question for `kind`, a
   `choice` question for `target` among visible ids, a `noul` for "should I recall"), not something
   a single free-text reply already packages. That is a real shift in where "the pilot's brain"
   lives — today it's entirely inside the model's free-text response; under Jev, the *menu* of
   possible answers and how they combine into an `Action` has to be authored somewhere outside the
   model, because Jev only ever picks from options it's handed.
4. **Streaming.** Not found in anything I read; flagging as unverified rather than assuming either
   way.

**What happens to the `hold` degradation path.** Partially dead code, partially more load-bearing —
not simply one or the other:

- The failure mode `hold` exists to catch today — a model emitting text that isn't valid JSON, or
  valid JSON with an invalid `kind` (`parseAction` returning `null`) — **is exactly what TypeSafe
  claims Jev cannot do by construction** ("type errors are mathematically impossible"). If that
  claim holds, this specific reason for `hold` becomes unreachable dead code under a Jev backend.
- But `Backend.complete`'s `hold` net also catches every *transport*-level failure — timeout,
  non-2xx, network error (`tools/model_server.py:429-435`, `# any backend failure -> the game
  holds, never crashes`) — and that class of failure is, if anything, **more likely** on Jev today
  than on the existing OpenRouter path, precisely because the docs say rate limits are "adjusting
  dynamically" and can tighten "without notice." So: the *parse-failure* reason for `hold` goes
  away; the *backend-had-a-bad-day* reason for `hold` stays exactly as necessary as it is now, and
  arguably becomes the dominant reason `hold` ever fires.

## 5. Q3 — How fast could we run it?

Labelled throughout, against the runner's own real baselines (not the abstract "40x/200x"):

| Backend | Latency | Label |
|---|---:|---|
| `qwen3.5:9b`, host Ollama, serial | 420 calls, ~12 min (1.8 s mean/call) | **measured**, `hosted-model-options.md` §1/§6 |
| `qwen/qwen3-32b`, OpenRouter, 6 in flight | 138 calls, 80 s wall, mean 1,383 ms, p90 2,174 ms | **measured**, `runs/openrouter-phase-c-proof-2026-09-22.md` |
| Jev, general | 70–500 ms end-to-end | **vendor-published**, typesafe.ai blog, 2026-09-15 |
| Jev, Doom demo | 0.114 s/decision | **vendor-demoed** (a real running demo, not just a benchmark table, but built and measured by TypeSafe) |
| Jev, this workload (bearbot decide-loop) | — | **untested** — nobody has run it |

If Jev's low end holds for this shape of state, a single decision would land somewhere around
**10–20x faster than the already-parallel OpenRouter baseline**, and combined with Jev's stated
1,200 req/min / 250,000 tok/s ceiling — far above the ~3 requests/second six pilots at cadence 2
produce today — the binding constraint would likely shift from *per-call latency* to *the account-
wide rate limit* once more than one match runs at once. That's an **inferred** conclusion, built on
an unverified premise (that Jev's general-purpose latency and the Doom demo's numeric-light game
state transfer to a lane full of floating-point positions, hp values, and cooldown timers) — which
is precisely the premise Simon Willison's "not great with numbers" caveat (§2) puts in doubt. I'm
not willing to call this "measured" or even "confidently inferred" until someone runs it.

**What a faster model would let the tournament config become, concretely.** `tournament.cadenceSec`
is 2 today (floor 0.5), and the wall cap is `3 × (maxSimSec / cadenceSec) × 6 × avgSecPerCall`
(`docs/arena-site-spec.md:622-624`, read for context, not edited). At Jev's published low end, even
serialised six-caller latency would sit comfortably under the 0.5 s floor, which today exists
because nothing faster was worth planning around. A model that's reliably sub-100ms would make
**cadence 0.5 the *floor to remove*, not the floor to hit** — bearbots reacting within a couple of
sim-ticks instead of over multiple seconds, closer to the real-time feel of the Doom demo than to
today's arena. That would be a materially different, more responsive game. It is also exactly the
kind of change that should be proven on a handful of real calls before anyone touches
`cadenceSec` in config.

## 6. Q4 — How would the prompts change? (Read: `prompts/pilots/`, the entrant contract, `runs/house-prompt-2026-09-21.md`)

**Would the house prompt's per-side split survive?** Probably not, but this is inferred, not
tested. `house-violet.md`/`house-green.md` are split into two files *because* `qwen3.5:9b` cannot
compare a field against its own `self.team` — it read its own towers as enemy towers every time
(`runs/house-prompt-2026-09-21.md`, "what the prompt does and why it looks the way it does"). A
Jev `noul` question like "is this entity's `team` equal to `self.team`?" is exactly the kind of
typed comparison the model is built to answer directly rather than infer from prose position — so
the *reason* for the split (a specific reasoning failure of one small model) plausibly disappears.
Whether TypeSafe's calibration actually nails that comparison for *this* schema is untested.

**How much of a pilot prompt is format-coaxing, not strategy — counted, not guessed:**

| File | Total | Format/mechanism tail | Fraction |
|---|---:|---:|---:|
| `drums.md` (entrant-shaped, chat model) | 1,548 chars | 407 chars ("You will be handed an OBSERVATION… just the object.") | **26%** |
| `house-violet.md` (worksheet + 7 ordered rules) | 2,452 chars | 1,977 chars (worksheet definition, rule list, reply-format reminder) | **81%** |
| — plus, on every call regardless of pilot | +140 chars | the runner's own fixed `REPLY_INSTRUCTION` line | (not in either total above) |

`drums.md`'s quarter is pure "please reply with only JSON and nothing else" — the kind of tax the
brief calls out, and something a schema-native model deletes outright, since there is no free text
to coax in the first place. `house-violet.md`'s **81%** is a different, more interesting tax:
most of that file isn't reply-format coaxing, it's a **worked-around reasoning limitation** — a
worksheet of five fields the model must copy out of the Observation before it's shown to make a
decision, because `qwen3.5:9b` can compare two numbers "that are both in front of it" but can't do
a lookup or a percentage on its own (`runs/house-prompt-2026-09-21.md`, "the model class is the
constraint"). The house prompt's own "take the FIRST rule that matches" 7-rule list is already,
structurally, a decision table — the closest thing in this repo to what Jev's `choice`/`noul`
primitives are *for*. That's not a coincidence worth losing: **the house bot is the single most
Jev-shaped thing already in this codebase**, and it isn't an entrant artifact, which matters a lot
for what follows.

**THE BIG ONE, as instructed — flagged prominently, not solved.** The jam's entrants write one file,
`entrants/<handle>/pilot.md` — free natural-language prose, in the bearbot's voice, with exactly
four rules (non-empty, no code fences, no URLs, no length cap — `tools/arena/pages/contract.mjs:50-
57`, ported verbatim from `jamobair-entrants/tools/validate_entry.py`). That entire premise assumes
there is a `prompt` field to write prose into. **Jev has no such field.** If the arena's *entrant-
facing* pilots ran on Jev, "write your bearbot's personality" would have to become something else —
most plausibly, authoring the `questions` schema itself: naming the decision points (which `kind`?
which `target`? recall or not?) and writing each one's `instructions`/`criteria`, which is closer to
designing a decision table or a scoring rubric than writing in character. This reaches, at minimum:

- **The jam's premise.** "Prompt-writing" and "decision-schema authoring" are different creative
  acts with different skills and a different entry bar — some good prose writers might not enjoy
  or be good at criteria tables, and vice versa. This is a different competition, not a faster
  version of the same one.
- **The entrant contract and its validator.** The four current rules (no fences, no URLs, non-empty,
  no length cap) were written for prose; a schema-shaped artifact needs its own validation
  (`jamobair-entrants/tools/validate_entry.py`) and its own explainer page
  (`tools/arena/pages/contract.mjs`), not a patch to the current ones.
- **"One file drives all three bearbots."** Today that works because it's one voice. Whether one
  decision schema can still serve drums/keytar/violin identically, or whether per-instrument logic
  (today handled in prose — "keytar only: … violin only: …" in `house-violet.md`) needs to become
  per-instrument question sets, is a real design choice, not a detail to assume away.

**Options, as I see them, not a recommendation:**

1. **Keep the jam as prompt-writing; use Jev only behind the scenes**, with tooling that translates
   an entrant's prose file into a `questions` schema automatically. Preserves the event's premise
   entirely, but the entrant is no longer directly authoring what actually runs — a layer of
   (unbuilt, unproven) translation sits between their words and the model's decisions.
2. **Change the jam's premise for a future event** to decision-schema authoring, using Jev's
   primitives directly. Honest about what the model is, but it is a different competition from the
   one already run once — a "future jam," not an upgrade to this one.
3. **Run Jev only where it doesn't touch the entrant contract at all: the house bot.**
   `house-violet.md`/`house-green.md` are not entrant artifacts — they're the arena's own fixed
   opponent, and (per the table above) already 81% decision-table mechanism wrapped around 19%
   actual strategy. Rewriting the house bot's logic as Jev questions changes nothing an entrant
   sees or writes, and is the lowest-risk way to find out whether Jev is even suitable for this
   *kind* of numeric, real-time game state (§2's open question) before anyone touches what
   entrants do.

Option 3 is also, not coincidentally, the cheapest thing to test for real — see below.

## The one thing I'd want tested for real before anyone commits

**Take `house-violet.md`'s existing logic — it's already a 7-rule decision table — and replay it
against real `Observation` snapshots already sitting in `runs/house-prompt-2026-09-21-r{1..4}-
*.json`, as three Jev questions (a `choice` for `kind`, a `choice` for `target` among visible ids, a
`noul` for "recall") per tick, and compare Jev's answers to what the ruled `qwen3.5:9b` backend
actually did on the same states.** This is deliberately the option-3 test: it never touches the
entrant contract, it reuses match data that already exists (no live match needs to run), and it
directly tests the one open question that matters most — whether a model an independent source
calls "not great with numbers" can correctly compare `hp` against 75, read a cooldown against 0,
and pick the lowest-hp visible enemy, which is *all* the house prompt's logic actually does. Rough
cost: at $0.042/M input tokens and free output, and given the existing runs logged 904 real calls
across all four house-prompt tests (`runs/house-prompt-2026-09-21.md`), even replaying all of them
against Jev would land in the same "a few cents, not a few dollars" territory as the existing
OpenRouter Phase C proof, which spent $0.0143 for 138 calls. This is an estimate, not a quote — I
did not run it, per the brief's "spend nothing" rule.

## Sources

- TypeSafe AI launch post, 2026-09-15/16: https://typesafe.ai/blog/introducing-system-one-models-and-jev
- TypeSafe AI docs (introduction, models, API reference), fetched 2026-09-22:
  https://docs.typesafe.ai/introduction, https://docs.typesafe.ai/models, https://docs.typesafe.ai/api.md
- TypeSafe AI home/console: https://typesafe.ai/, https://console.typesafe.ai
- The Register, 2026-09-16, "TypeSafe AI debuts model for machines that plays Doom":
  https://www.theregister.com/ai-and-ml/2026/09/16/typesafe-ai-debuts-model-for-machines-that-plays-doom/5296711
- Simon Willison, 2026-09-21, "Jev introduces a new shape of LLM—System One, aka Decision Models":
  https://simonwillison.net/2026/Sep/21/jev/
- Pydantic AI, TypeSafe/Jev model integration docs, fetched 2026-09-22: https://pydantic.dev/docs/ai/models/typesafe/
- Cloudflare Workers AI, Jev model page, fetched 2026-09-22: https://developers.cloudflare.com/ai/models/typesafe/jev/
- This repo: `tools/model_server.py`, `src/pilots/promptPilot.ts`, `src/pilots/callModel.ts`,
  `tools/arena/pages/contract.mjs`, `prompts/pilots/drums.md`, `prompts/pilots/house-violet.md`,
  `prompts/pilots/README.md`, `runs/house-prompt-2026-09-21.md`, `runs/openrouter-phase-c-proof-2026-09-22.md`,
  `docs/hosted-model-options.md`, `docs/arena-site-spec.md` (read for context only, not edited)
