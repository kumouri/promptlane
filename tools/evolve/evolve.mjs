#!/usr/bin/env node
/**
 * Prompt-evolution harness for the house bots, v0 — `npm run evolve -- <command>`.
 * Spec, open decisions and budget: docs/prompt-evolution-spec.md. The loop is Ceryce's design.
 *
 *   npm run evolve -- init   --name smoke --seed-prompt prompts/pilots/drums.md [--seed-prompt …]
 *                            [--config overrides.json] [--store DIR]
 *   npm run evolve -- step   --name smoke [--generations 1]     run / resume the next generation(s)
 *   npm run evolve -- status --name smoke                       where the campaign is
 *   npm run evolve -- report --name smoke --out runs/x.md       Markdown summary of every generation
 *
 * The store defaults to runs/evolve/<name>/ (git-ignored). `step` needs, running first:
 *   python tools/jev/schema_server.py --port 8797          (Jev plays the compiled rules; Workers AI)
 * and whatever the campaign's compile/mutation backends need (default: $OPENROUTER_API_KEY for the
 * compile, the `claude` CLI for the mutation). Killing `step` anywhere and running it again resumes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, realDeps } from './adapters.mjs';
import { initCampaign, runGeneration } from './generation.mjs';
import { Store } from './store.mjs';
import { renderReport } from './report.mjs';

function parseArgs(argv) {
  const args = { command: argv[0], seedPrompts: [], generations: 1 };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    switch (a) {
      case '--name': args.name = next(); break;
      case '--store': args.store = next(); break;
      case '--seed-prompt': args.seedPrompts.push(next()); break;
      case '--config': args.config = next(); break;
      case '--generations': args.generations = Number(next()); break;
      case '--out': args.out = next(); break;
      default: throw new Error(`unknown option ${a}`);
    }
  }
  return args;
}

function storeFor(args) {
  if (!args.store && !args.name) throw new Error('--name (or --store) is required');
  return new Store(args.store ?? path.join(ROOT, 'runs', 'evolve', args.name));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Python children read prose on stdin; a Windows pipe is cp1252 unless told otherwise.
  process.env.PYTHONUTF8 = process.env.PYTHONUTF8 ?? '1';
  const store = storeFor(args);
  const log = (msg) => console.error(msg);
  switch (args.command) {
    case 'init': {
      const overrides = args.config ? JSON.parse(readFileSync(args.config, 'utf8')) : {};
      const seedPrompts = args.seedPrompts.map((file) => ({ file: file.replace(/\\/g, '/'), text: readFileSync(file, 'utf8') }));
      const { ids } = initCampaign(store, { name: args.name ?? path.basename(store.dir), overrides, seedPrompts });
      console.log(`campaign ${store.dir}: seed genome(s) ${ids.join(', ')}; first opponent ${ids[0]}`);
      return 0;
    }
    case 'step': {
      const campaign = store.readJson('campaign.json');
      const deps = realDeps(campaign);
      for (let i = 0; i < args.generations; i++) {
        const gen = await runGeneration(store, deps, { log });
        const top = gen.ranking[0];
        console.log(
          `GENERATION ${gen.generation} done: survivors ${gen.survivors.join(', ')}; best ${top.id} mean ${top.fitness.mean?.toFixed(3)} ` +
            `(${top.fitness.wins}W ${top.fitness.draws}D ${top.fitness.losses}L)` +
            (gen.promotion ? `; promotion ${gen.promotion.promote ? 'YES' : 'no'} (${gen.promotion.reason})` : ''),
        );
      }
      return 0;
    }
    case 'status': {
      console.log(JSON.stringify(store.readJson('state.json'), null, 1));
      return 0;
    }
    case 'report': {
      const md = renderReport(store);
      if (args.out) writeFileSync(args.out, md, 'utf8');
      else process.stdout.write(md);
      return 0;
    }
    default:
      console.error('usage: npm run evolve -- init|step|status|report --name <campaign> [options] (see tools/evolve/evolve.mjs)');
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`evolve: ${err.message}`);
    process.exit(2);
  },
);
