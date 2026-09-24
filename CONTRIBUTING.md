# Contributing to ccsaver

The rules of this repository, for a person or a model. The [README](README.md) and the pages it links under [docs/](docs/) say what ccsaver does; this file says how its code is written.

Each rule names its **guard**: the compiler switch (`tsconfig.json`), the Biome rule (`biome.json`) or the test that goes red when the rule is broken. A rule that no tool checks says *convention*: the reviewer is the guard. Examples cite a file and a symbol, like `src/delegation/worker.store.ts` · `readWorker`, and `test/repo/conventions.test.ts` fails when that symbol is gone.

## The gate

```bash
pnpm test && pnpm typecheck && pnpm lint && claude plugin validate .
```

All four green before a change is done, lint at zero warnings. What Biome flags is fixed in the code: no `biome-ignore`, no `@ts-ignore`, no `@ts-expect-error`, and no new rule or override in `biome.json` without the owner's approval.

## 1. Code quality

**1.1 ALWAYS keep the compiler at full strictness.** An index may be `undefined`, an optional field is absent rather than `undefined`, nothing unused stays.
Guard: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`.

```ts
// ❌ an optional field assigned undefined
return { url, model, claude: claude || undefined }
// ✅ `src/delegation/worker.store.ts` · `readWorker`: the field is there or it is not
return { url, model, ...(claude ? { claude } : {}) }
```

**1.2 NEVER `any`, NEVER `as T`, NEVER `!`.** Narrow with a guard that checks at run time; `as const` and `satisfies` are free.
Guard: Biome `noExplicitAny`, `noEvolvingTypes`, `noNonNullAssertion`; `as` by `test/repo/conventions.test.ts`.

```ts
// ❌ blesses whatever the file holds
const worker = JSON.parse(text) as Worker
// ✅ `src/delegation/worker.store.ts` · `readWorker`: unknown in, checked fields out
const raw = parsed(text)
const { url, model } = isRecord(raw) ? raw : {}
if (typeof url !== "string" || typeof model !== "string") throw new Refusal(`${workerFile()} is malformed`)
```

**1.3 ALWAYS an arrow const with an explicit return type.** `interface` for an object shape, `type` for a union, `T[]` for an array, named exports only.
Guard: Biome `useExplicitReturnType`, `useArrowFunction`, `useConsistentTypeDefinitions`, `useConsistentArrayType`; the `function` keyword and `export default` by `test/repo/conventions.test.ts`.

```ts
// ❌
export default function fellOf(error) { … }
// ✅ `src/delegation/worker.client.ts` · `fellOf`
export const fellOf = (error: unknown): Fell => { … }
```

**1.4 PREFER a new value over a mutation.** `const` and expressions; a list changes by building the next one.
Guard: Biome `useConst`; the rest is *convention*.

```ts
// ❌ the tally is counted up inside the map that rewrites the rows
tally[verdictOf(line, claimed)] += 1
// ✅ `src/delegation/answer.validator.ts` · `counted`, folded over the rows the map returns
verdict === undefined ? tally : { ...tally, [verdict]: tally[verdict] + 1 }
```

Two folds mutate what they carry, `src/saved/saved.service.ts` · `pagedAfter` and `src/doctor/spent.service.ts` · `gateInto`, because a copy per row is [quadratic](docs/development.md#adding-up-a-month-of-the-log). Module-level mutable state exists twice, `secret` in `src/state/state.store.ts`, read through `storedKey`, and `delegation` in `src/delegation/worker.client.ts`, because one process serves one call. Both become parameters the day a process serves two.

**1.5 NEVER comment code.** Names carry the what, the README and the pages under `docs/` carry the why. The complete list of exceptions: the one-line attribution header on a file that holds adapted third-party material (Apache-2.0 asks for it; [NOTICE](NOTICE) names the files), and one line inside a `catch` that is empty on purpose, saying why (`src/state/log.store.ts` · `record`).
Guard: `test/repo/conventions.test.ts`.

**1.6 NEVER leave dead code, PREFER the helper that exists.** `attempt` for a call whose failure is an expected answer, `parsed` for JSON text, `isRecord` to open an unknown object, `messageOf` for a caught error, `real` and `isUnder` for paths, `isSecretPlace` for a folder that holds credentials, whether a file is leaving it or a root is being plugged, `linesIn` and `tokensIn` for bytes weighed against a limit, `readKey`, `readWorker` and `foldMonth` as the only readers of their files, with one exception: `src/saved/prices.store.ts` · `workerNamed` reads `worker.json` on its own, because a broken `worker.json` must not stop a report whose worker name is decoration. One export is a test seam and nothing else: `src/saved/saved.service.ts` · `tallied`, fed rows by hand; the report folds a month through `foldMonth` without holding its rows.
Guard: `noUnusedLocals`, `noUnusedParameters`, Biome `noUnusedImports`, `noUnusedVariables`; an unused export and a duplicated helper are *convention*.

**1.7 PREFER a function a reader holds in their head: cognitive complexity 15 or less.**
Guard: *convention*, measured with `pnpm exec biome lint --only=complexity/noExcessiveCognitiveComplexity src test`. The last one over it, the field-by-field guard `adapterOf` in `src/state/config.store.ts` (18), came under by splitting the rejecting from the building: `fieldsHold` says whether the fields hold, `adapterOf` builds from them. A new function over 15 is split before it lands; three that resist put the rule in `biome.json` as an error.

**1.8 ALWAYS keep every file readable whole under this project's own gate: 350 lines and 32 KB.** A file splits by responsibility before it gets there, the way `delegation.service.ts` gave birth to `boundary.guard.ts`, `answer.validator.ts` and `worker.client.ts`: what goes is what the hook never reads, because every line left in a file the hook imports is parsed on every `Read` (4.4). Two files are excused, in `UNREAD_WHOLE`: `pnpm-lock.yaml`, and `CHANGELOG.md`, which grows by one section per commit and is read from the top. Splitting either one buys nothing, because neither holds a responsibility that could move.
Guard: `test/repo/conventions.test.ts`.

## 2. Architecture

**2.1 ALWAYS respect the map.** Twenty files in four folders and three entry points, one reason to change each, arrows that never turn back. `src/state/` holds the four files of the state folder, which everything else imports; `src/delegation/` the two flows, their ways out and what may leave the machine; `src/saved/` the report and its prices; `src/doctor/` the checks, what they report, the survey and the launcher. `src/ccsaver.cli.ts`, `src/read-gate.hook.ts` and `src/handoff.hook.ts` stay at the top, where `bin/ccsaver` and `hooks/gate` find them.

| File | Owns | Imports |
| --- | --- | --- |
| `src/state/state.store.ts` | the state folder, the key, the guards, what a terminal may be shown (`scrubbed`, `tinted`, `marked`) and what a shell may be handed (`quoted`), `Refusal` | `node:` only |
| `src/state/log.store.ts` | the event log, its switch and its reader | `state.store` |
| `src/state/config.store.ts` | what the user configured: the plugged roots, the adapters, and how a file is weighed against a limit | `log.store`, `state.store` |
| `src/state/handoff.store.ts` | `handoff.json`, the switch and the limit of the context warning, and the `handoff/` folder | `config.store`, `log.store`, `state.store` |
| `src/delegation/worker.store.ts` | `worker.json`: the url, the model, the pinned binary and the fallback switch | `log.store`, `state.store` |
| `src/doctor/survey.service.ts` | how long a project's files are, and what limit that asks for | `config.store`, `state.store` |
| `src/delegation/answer.validator.ts` | pure text work on the worker's answer | nothing |
| `src/delegation/boundary.guard.ts` | what may leave the machine | `state.store` |
| `src/delegation/worker.client.ts` | the two ways out: `fetch` to the worker, spawn of the fallback | `log.store`, `state.store`, the `Worker` type of `worker.store`, the `Tally` type of `answer.validator` |
| `src/delegation/delegation.service.ts` | the `bulk-read` and `code-write` flows | `answer.validator`, `boundary.guard`, `config.store`, `log.store`, `state.store`, `worker.client`, `worker.store` |
| `src/saved/prices.store.ts` | `prices.json`: one price per model, one for the worker, and the worker's name beside a price, its own lenient read of `worker.json` | `log.store`, `state.store` |
| `src/saved/saved.service.ts` | what the log says was spent, added up month by month | `config.store`, `log.store`, `prices.store`, `state.store` |
| `src/saved/saved.reporter.ts` | what `ccsaver saved` prints, and every caveat under it | `log.store`, `prices.store`, `saved.service`, `state.store` |
| `src/doctor/finding.model.ts` | what a check reports: a level, a text and the fix it offers, and how a line is painted | `state.store` |
| `src/doctor/spent.service.ts` | the two lines that add the month's log up, `denied:` and `spent:`, folded one row at a time | `finding.model`, `log.store`, `state.store` |
| `src/doctor/doctor.service.ts` | every check `doctor` runs and the level each one reports | `config.store`, `finding.model`, `handoff.store`, `launcher.service`, `log.store`, `spent.service`, `state.store`, `survey.service`, `worker.client`, `worker.store` |
| `src/doctor/launcher.service.ts` | the launcher of your own terminal: `launcher/ccsaver.sh` with `launcher/installed.js` inlined, its place, and what stands before it on the `PATH` | `finding.model`, `log.store`, `state.store` |
| `src/ccsaver.cli.ts` | arguments and the exit code | `config.store`, `delegation.service`, `doctor.service`, `handoff.store`, `launcher.service`, `log.store`, `prices.store`, `saved.reporter`, `state.store`, `survey.service`, `worker.store` |
| `src/read-gate.hook.ts` | the `Read` gate | `boundary.guard`, `config.store`, `log.store`, `state.store` |
| `src/handoff.hook.ts` | the context warning at the end of a turn | `config.store`, `handoff.store`, `log.store`, `state.store` |

Guard: Biome `noImportCycles`, which is why the log cannot live in `src/state/state.store.ts`: it needs `stateHome` and the stored key, and every command recording a `config` event would point back at it. The import lists of both hooks are pinned by `test/repo/conventions.test.ts`, because they are the start-up cost of every `Read` and of every turn (4.4).

Off the map: `scripts/version.hook.ts`, the git hook of 5.3: nothing in `src/` imports it, and it imports `node:` built-ins and the guards of `src/state/state.store.ts`, by `test/repo/conventions.test.ts`.

Off the map too: `bin/ccsaver`, the POSIX `sh` launcher, which holds `key set` and `setup`, because only a shell can turn a terminal's echo off and the key must never reach a Node argument list. `setup` asks for the four settings, hands each to the CLI and shares `store_key` with `key set`, so the key file keeps one writer. It also stops a `node` under the floors `package.json` declares before `setup`, `doctor` and `plug`, the three a person types before anything works, and no others: the check is a second process start and [costs 14 ms](docs/development.md#the-cost-of-the-node-version-check) that the delegation commands would pay on every call. The launcher appends one event of its own, the `key set` line, in shell: the line format of `src/state/log.store.ts` · `LOG_VERSION` has two writers, and a change to it touches both or the month's file holds two shapes.

Off the map as well: `commands/`, the five markdown files behind `/ccsaver:setup`, `/ccsaver:plug`, `/ccsaver:doctor`, `/ccsaver:saved` and `/ccsaver:handoff`: prompts for Claude, not code: they call subcommands and hold no logic.

There is one per flow that needs judgement, **never one per command**. `key set`, `worker set`, `fallback` and `launcher write` live inside `setup.md` because they need the warnings around them; `unplug` and `list` are a line each in `plug.md`; `price` lives inside `saved.md`, because a price with no report is meaningless; `bulk-read` and `code-write` are the skills' own. A new one earns its place by carrying what a summary would drop first: `saved` its band, `handoff` its eight parts and the size a `Read` takes. Each pays for its place in a description every session loads, ~266 tokens with the skill descriptions in `docs/measurements.md`.

Guard: `test/repo/skills.test.ts` pins that every `ccsaver …` a prompt of ours names is a command the CLI answers, reading the list out of `USAGE` in `src/ccsaver.cli.ts`, and that each file carries the description the plugin menu shows.

**2.2 ALWAYS import from the file that owns the symbol**, by relative path with the real extension. No barrel, no `export *`, no default export.
Guard: Biome `useImportExtensions`, `allowImportingTsExtensions`; barrels are *convention*.

**2.3 PREFER functions and plain data to classes.** The only class is `Refusal`, because `instanceof` is how the CLI tells a refusal from a bug. No interface with one implementation, no factory for one product, no option for a value that never changes.
Guard: *convention*.

**2.4 ALWAYS pass a dependency as a parameter.** The seams the tests use are a parameter (`worker` in `src/delegation/worker.client.ts` · `invokeExternal`), a default parameter (`src/state/log.store.ts` · `logFile` takes `now = new Date()`), an environment variable (`CCSAVER_HOME`, `CLAUDE_CODE_EXECPATH`) and a file in the state folder.

```ts
// ❌ reads its collaborator from a global registry
const answer = await container.get("worker").ask(message)
// ✅ `src/delegation/worker.client.ts` · `invokeExternal`
export const invokeExternal = async (mode: string, system: string, message: string, worker: Worker | undefined): Promise<string | undefined> => { … }
```

Guard: *convention*. Revisit when a test needs to replace something that no parameter, variable or state file reaches, or when a seam gets a second implementation.

**2.5 NEVER let a directory reach six files.** The sixth file is the signal to regroup by feature: what changes together lives together, the files everything imports go in a folder of their own, and the entry points stay where the launcher and the gate find them. A directory splits by feature the way a file splits by responsibility (1.8), and a new concept is still a new file on the map of 2.1. The root is excused: its files are the ones the tools look for there.
Guard: `test/repo/conventions.test.ts`.

**2.6 ALWAYS name a directory in kebab-case and a file `name.role.ts`.** Below the root a name is lowercase letters, digits, hyphens and dots; the root is excused as in 2.5, and so is `SKILL.md`. The name is the noun, the role is the kind of module: `store` for the reader and writer of one file of the state folder, `service` for a flow, `client` for a way out of the machine, `guard` for what refuses before anything leaves, `validator` for what checks an answer that came back, `model` for a shape, `reporter` for what a command prints, `cli` and `hook` for what `bin/ccsaver` and a hook launcher start, `helpers` for what the tests share and `test` for one behaviour, named after the behaviour and not the module. A new role lands here and in the guard in the same commit.
Guard: `test/repo/conventions.test.ts`.

## 3. Robustness

**3.1 ALWAYS end a stop the user can fix the same way:** one `Error: …` line on stderr, one `fail` event, exit code 1, nothing sent. That line leaves through `writeSync` and not through the stream (`src/delegation/worker.client.ts` · `said`), because `process.exit` drops what a stream has queued and Node queues a pipe on macOS. State code throws a `Refusal`, caught once at the bottom of `src/ccsaver.cli.ts`; the worker path calls `fail`, which returns `never` (`src/delegation/worker.client.ts` · `fail`); a command handed arguments it cannot take returns the complaint as a string instead of an exit code, and `src/ccsaver.cli.ts` · `mistake` prints it as the `Error:` line with the command's own row of the usage table under it, so the reason and the remedy arrive together. Anything else that throws is a bug and is recorded as a `crash`.

Every line a person reads goes through `src/state/state.store.ts` · `marked`, which puts a mark and a colour in front of it on a terminal and nothing at all on a pipe, `NO_COLOR` or `TERM=dumb`: the words carry the meaning, the paint only repeats it. Untrusted text is `scrubbed` first and painted second, because `scrubbed` would escape the paint. A command that finds its setting already so says `already` and returns 0 without writing or recording anything: `src/state/log.store.ts` · `setLog`, `src/delegation/worker.store.ts` · `setFallback`, `src/state/config.store.ts` · `plug` and their siblings answer whether anything changed, and the wording lives in `src/ccsaver.cli.ts`.
Guard: every `throw new` in `src/` throws a `Refusal`, by `test/repo/conventions.test.ts`; `test/state/log.test.ts` pins that a mistake on the command line is a `fail`, never a `crash`.

```ts
// ❌ a typo in an adapter name reads as a crash of ccsaver
throw new Error(`adapter ${name} not found`)
// ✅ `src/state/config.store.ts` · `loadAdapter`
throw new Refusal(`adapter ${name} not found in ${places.join(" or ")}`)
```

**3.2 ALWAYS turn an expected failure into a value, and NEVER a refusal.** A missing file is an answer, and the caller decides what it means; a `Refusal` is a decision already made, so `src/state/state.store.ts` · `attempt` lets it through instead of turning it into `undefined`. Swallowing one turns a stop into a default, which is 3.4 by another door.

```ts
// ❌ an inline try/catch at every call site, each free to swallow something else
let text
try { text = readFileSync(place, "utf8") } catch {}
// ✅ `src/state/state.store.ts` · `attempt`
const text = attempt(() => readFileSync(place, "utf8"))
if (text === undefined) continue
```

Guard: *convention*.

**3.3 ALWAYS validate at the boundary, by hand, and return a typed value built from the checked fields.** The boundaries are `worker.json` (`readWorker`), the `plugged` file (`src/state/config.store.ts` · `readPlugged`, which drops a line that is not an absolute path), an adapter file (`adapterOf`, which also rejects unknown keys), the hook's stdin (`src/read-gate.hook.ts` · `gate`), the tail of the session transcript Claude Code names on it (`src/state/config.store.ts` · `lastAssistantOf`, which reads whole JSON lines rather than matching text, so a model named in the conversation is not read as the one in force), the worker's HTTP response (`src/delegation/worker.client.ts` · `contentOf`), the fallback's stdout (`invokeClaude`), the month's own log lines when `doctor` adds it up (`src/doctor/spent.service.ts` · `into`) and when `ccsaver saved` adds up the whole log (`src/saved/saved.service.ts` · `tallied`, which reads every field through `numberAt`), `prices.json` (`src/saved/prices.store.ts` · `readPrices`) and `package.json` when it prints the version (`src/ccsaver.cli.ts` · `version`). Every `JSON.parse` lands in a `const` typed `unknown`, or goes through `parsed`.

```ts
// ❌ trusts the shape of a response from the network
const content = (await response.json()).choices[0].message.content
// ✅ `src/delegation/worker.client.ts` · `firstChoice`, the one guard `contentOf` opens the answer with
if (!isRecord(raw) || !Array.isArray(raw["choices"])) return undefined
const first: unknown = raw["choices"][0]
return isRecord(first) ? first : undefined
```

Guard: `test/repo/conventions.test.ts` for `JSON.parse`; `noPropertyAccessFromIndexSignature` forces the bracket on an unchecked key. No schema library: zero runtime dependencies is a promise (5.4). Revisit past 10 untrusted shapes or a shape nested more than 2 levels deep.

**3.4 NEVER read a broken config as an absent one.** Absent means defaults; present and malformed stops the call. `readWorker` once read a stray comma as "no worker", which quietly turned the paid fallback back on, and `writeLimits` once read a malformed adapter as none and wrote one limit over the `rules` and the `format` of a project. `src/state/config.store.ts` · `findAdapter` tells absent from broken, and only absent starts from `{}`. Unreadable belongs with broken, not with absent: `readWorker` asks `existsSync` before it reports no worker, the way `src/state/state.store.ts` · `keyIsStored` tells a key it cannot read from one never stored (3.5), `src/state/log.store.ts` · `textAt` asks it before handing back a month with no rows, because a month read as empty is a report that lies, `findAdapter` asks it before moving on to the bundled adapter, because a private one skipped in silence changes the rules and the limits, and `writeLimits` would write the bundled one over it, and `src/state/config.store.ts` · `readPlugged` asks it before handing back an empty list, because `plug` and `unplug` write it back and would replace every root you plugged with the one just typed. The hook never gets there: `hooks/gate` asks `[ -r ]` of the same file before Node starts.
Guard: `test/state/state.test.ts`, "a worker.json that is there but wrong is an error, never the same as no worker".

**3.5 NEVER let one failure hide another.** Name the cause. `fellOf` tells a timeout from a body that is not JSON from a dead host. `src/delegation/worker.client.ts` · `troubleOf` reads the `code` of a failed spawn: an `EPIPE` is a child that stopped reading and no error at all, an `ETIMEDOUT` is the 85 s running out and says so rather than showing `spawnSync claude ETIMEDOUT`. `invokeClaude` then reports the reason the child printed, which is all a spent budget leaves behind, before its exit and stderr. A key that is present but unreadable is told from a key that was never stored, in the note and in `doctor`, by `src/state/state.store.ts` · `keyIsStored`; reading the first as the second sent the call to the paid worker under a message that said the opposite. A worker's answer cut at an output limit falls as `length`, never as `incomplete`. Every fall to the paid worker says why on stderr first.

```ts
// ❌ past 64 KB of input the real error hides behind `spawnSync … EPIPE`
if (run.error) return fail(`fallback worker could not run: ${run.error.message}`)
// ✅ `src/delegation/worker.client.ts` · `invokeClaude`
const trouble = troubleOf(run.error)
if (trouble !== undefined) return fail(trouble)
const raw = parsed(run.stdout)
const reason = reasonOf(raw)
if (reason !== undefined) return fail(`fallback worker failed: ${reason.slice(0, 400)}`)
if (run.status !== 0) return fail(`fallback worker exited ${run.status ?? run.signal}: ${run.stderr.slice(0, 400)}`)
```

Guard: `test/delegation/transport.test.ts`.

**3.6 ALWAYS choose, per boundary, which way it fails.** Both hooks fail open: a crash inside the gate lets the `Read` through, one inside the handoff hook ends the turn silent, each leaving a `crash` event, because ccsaver must never block a session; an adapter it cannot load falls back to the default limits the same way, and `src/read-gate.hook.ts` · `adapterOrDefaults` records that crash too, so the `gate` line beside it is not read as those limits being the adapter's. Egress fails closed: a refused path, a secret or a malformed config stops the call before anything is sent. The event log changes nothing: a failed append is swallowed (`src/state/log.store.ts` · `record`).
Guard: `test/gate/events.test.ts`, `test/boundary/egress.test.ts`, `test/boundary/boundary.test.ts`.

**3.7 NEVER check and then act on a path in two steps.** Resolve each path once, so the file that is judged is the file that is read (`src/delegation/delegation.service.ts` · `fileBlock`). Create with `flag: "wx"`, so an existing target is refused by the write itself. Replace a state file by writing a temporary name and renaming it (`src/state/state.store.ts` · `writePrivate`). Keep a log line under 4,096 bytes, so appends from two processes stay whole lines. The one place the rule does not reach is two `plug` commands at the same instant: `src/state/config.store.ts` · `plug` reads the `plugged` file, filters it and writes it back, and although each write is atomic the three steps are not, so the later command wins and the earlier root is lost. It is typed by hand, one at a time, so it stays a known hole and not a lock.
Guard: `test/boundary/egress.test.ts`, `test/delegation/code-write.test.ts`, `test/state/log.test.ts`.

## 4. Performance and async

**4.1 PREFER synchronous file I/O.** One process serves one call and has nothing to interleave, so `src/` reads and writes with the `*Sync` calls and awaits only the network: one `fetch` site, `src/delegation/worker.client.ts` · `postJson`, which carries the headers, the timeout and `redirect: "error"` for both callers, `src/doctor/doctor.service.ts` · `probe` and `invokeExternal`.
Guard: *convention*. Revisit for a long-lived process or a call that gains from reading files in parallel.

**4.2 ALWAYS bound what waits or grows.** A `fetch` carries `AbortSignal.timeout` and `redirect: "error"`; a spawn carries `timeout` and `maxBuffer`; an answer takes at most 8,192 tokens; the paid fallback takes at most 400,000 characters, 85 s and 0.50 $. The worker's 30 s and the fallback's 85 s are `src/delegation/delegation.service.ts` · `BASH_BUDGET_MS`, 115 s, and the formatter takes what is left of it rather than a fixed minute, never less than `FORMAT_FLOOR_MS`, so the worst case stays inside the 120 s a Bash command gets. A log line takes at most 4,000 bytes.

```ts
// ❌ waits for ever, follows a redirect with the file in hand
const response = await fetch(worker.url, { method: "POST", body })
// ✅ `src/delegation/worker.client.ts` · `invokeExternal`
const response = await fetch(worker.url, { method: "POST", signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS), redirect: "error", body })
```

Guard: `test/delegation/transport.test.ts`, which also adds up the three waits; a new wait without a bound is *convention*.

**4.3 ALWAYS await or return every promise**, with `async`/`await` and no `.then` chains. `src/ccsaver.cli.ts` sets `process.exitCode` from `await main()`; the only `process.exit` lives inside `fail`.
Guard: Biome `noFloatingPromises`, `noMisusedPromises`, `useAwaitThenable`.

**4.4 ALWAYS treat a hook as the hot path: `read-gate` runs on every `Read`, `handoff` at the end of every turn.** The `sh` gate leaves an unplugged project, a switched-off warning, and, with the log off and no adapter, a ranged read or a file under the limits, before Node starts; `test/gate/gate.test.ts` holds it to the hook's answer. Otherwise the cost is Node's start-up, so `src/read-gate.hook.ts` imports the three stores of `src/state/`, `src/delegation/boundary.guard.ts` and `node:` built-ins, nothing else, and `src/handoff.hook.ts` the three stores and its own; it counts lines on the bytes. Touching a hook means measuring it before and after, as `docs/development.md` does: mean of 30 runs, spawn included. Each import costs about 0.85 ms of that, measured when `state.store.ts` became three files.
Guard: the import list by `test/repo/conventions.test.ts`; the measurement is *convention*.

**4.5 NEVER optimise, or claim a saving, without a number.** A number in the README or under `docs/` carries its sample size, and `docs/measurements.md` or `docs/development.md` carries the note.
Guard: *convention*.

## 5. Maintainability

**5.1 ALWAYS change the specification in the same commit as the behaviour.** The README and the pages it links under `docs/` are the specification, one page per subject, and `CLAUDE.md` has the map: when the specification and the code disagree, one of them is a bug. A reason written there is known, not inferred. Documents that outlive a commit cite a file and a symbol, never a line number.
Guard: `test/repo/skills.test.ts` ties the skills to the commands, and both manifests and the top of `CHANGELOG.md` to one version; `test/repo/conventions.test.ts` ties this file's examples to the code and every link between the pages to the file and the heading it names; the rest is *convention*.

**5.2 ALWAYS bring the test with the behaviour; a fix starts with the test that fails.** Tests run on `node --test` with no network: a fake server on `127.0.0.1`, a fake `claude` binary, and a throwaway `CCSAVER_HOME` per test file. A test's name is a sentence that states the behaviour. A flaky test is chased under load, three suites in parallel for six rounds, before anyone calls it fixed.
Guard: `pnpm test` starts from a state folder and a `HOME` that do not exist, so a forgotten `CCSAVER_HOME` or `HOME` cannot touch a real key or launcher.

**5.3 ALWAYS write the commit as `type: subject`, in English.** `feat` is behaviour a user can see, `fix` is behaviour corrected, and `docs`, `test`, `refactor`, `perf`, `build`, `ci` and `chore` change no behaviour; a breaking change adds `!`. The body, when there is one, is a bullet list of what changed and why.

The message is also the release note: the hook of `.githooks/` turns the type into the next version (`scripts/version.hook.ts` · `bump`) and the subject with its bullets into the entry of `CHANGELOG.md` (`scripts/version.hook.ts` · `sectionOf`), amends the commit and tags it (`scripts/version.hook.ts` · `tagged`). NEVER type a version, and NEVER edit a section of `CHANGELOG.md`: the hook rebuilds them from the parent commit. [docs/versions.md](docs/versions.md) has the behaviour case by case, the Node.js floors the hook needs, and what it does under them.
Guard: `test/repo/version.test.ts` for the hook, one throwaway repository per way of making a commit; `test/repo/skills.test.ts` for the one version; the wording of a message is *convention*.

```
fix: a malformed worker.json stops the call

- it used to be read as "no worker", which turned the paid fallback back on
```

**5.4 NEVER add a runtime dependency.** A plugin installed from GitHub never runs `pnpm install`, so `src/` imports `node:` built-ins and its own files. A development dependency needs numbers, the owner's approval and the 24-hour release cooldown of `pnpm-workspace.yaml`; CI installs with `--frozen-lockfile`.
Guard: `test/repo/conventions.test.ts`.

**5.5 ALWAYS leave CI read-only, with one named exception:** `permissions: contents: read`, actions pinned by commit SHA, Ubuntu and macOS on Node 22, 24 and 26, the oldest line `engines` supports and the two newest. `.github/dependabot.yml` opens one weekly pull request per action (`ci:`) and per development dependency (`build:`, after the day of `minimumReleaseAge` in `pnpm-workspace.yaml`, 5.4); `@types/node` stays on the major of the oldest Node `engines` supports, because newer types describe calls that minimum lacks, so its major bumps are ignored. A pull request is a proposal: it still needs the numbers and the approval of 5.4. The exception is `.github/workflows/release.yml`, whose single job takes `contents: write` to publish a GitHub release, kept apart from `ci.yml` so the everyday token stays read-only: it runs on a push to `main` and on `workflow_dispatch`, installs nothing, and its one command is `gh release create`, once per `v*.*.0` tag without a release, with the section `CHANGELOG.md` already carries ([docs/versions.md](docs/versions.md)).
Guard: *convention*.
