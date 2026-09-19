# Contributing to ccsaver

The rules of this repository, for a person or a model. The [README](README.md) says what ccsaver does; this file says how its code is written.

Each rule names its **guard**: the compiler switch (`tsconfig.json`), the Biome rule (`biome.json`) or the test that goes red when the rule is broken. A rule that no tool checks says *convention*: the reviewer is the guard. Examples cite a file and a symbol, like `src/state.ts` · `readWorker`, and `test/conventions.test.ts` fails when that symbol is gone.

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
// ✅ `src/state.ts` · `readWorker`: the field is there or it is not
return { url, model, ...(claude ? { claude } : {}) }
```

**1.2 NEVER `any`, NEVER `as T`, NEVER `!`.** Narrow with a guard that checks at run time; `as const` and `satisfies` are free.
Guard: Biome `noExplicitAny`, `noEvolvingTypes`, `noNonNullAssertion`; `as` by `test/conventions.test.ts`.

```ts
// ❌ blesses whatever the file holds
const worker = JSON.parse(text) as Worker
// ✅ `src/state.ts` · `readWorker`: unknown in, checked fields out
const raw = parsed(text)
const { url, model } = isRecord(raw) ? raw : {}
if (typeof url !== "string" || typeof model !== "string") throw new Refusal(`${workerFile()} is malformed`)
```

**1.3 ALWAYS an arrow const with an explicit return type.** `interface` for an object shape, `type` for a union, `T[]` for an array, named exports only.
Guard: Biome `useExplicitReturnType`, `useArrowFunction`, `useConsistentTypeDefinitions`, `useConsistentArrayType`; the `function` keyword and `export default` by `test/conventions.test.ts`.

```ts
// ❌
export default function fellOf(error) { … }
// ✅ `src/transport.ts` · `fellOf`
export const fellOf = (error: unknown): Fell => { … }
```

**1.4 PREFER a new value over a mutation.** `const` and expressions; a list changes by building the next one.
Guard: Biome `useConst`; the rest is *convention*.

```ts
// ❌
const entries = readPlugged()
entries.push(entry)
// ✅ `src/state.ts` · `plug`
writePlugged([...readPlugged().filter((other) => other.root !== root), entry])
```

Module-level mutable state exists twice, `secret` in `src/state.ts` and `delegation` in `src/transport.ts`, because one process serves one call. Both become parameters the day a process serves two.

**1.5 NEVER comment code.** Names carry the what, the README carries the why. The complete list of exceptions: the one-line attribution header on a file that holds adapted third-party material (Apache-2.0 asks for it; [NOTICE](NOTICE) names the files), and one line inside a `catch` that is empty on purpose, saying why (`src/state.ts` · `record`).
Guard: `test/conventions.test.ts`.

**1.6 NEVER leave dead code, PREFER the helper that exists.** `attempt` for a call whose failure is an expected answer, `parsed` for JSON text, `isRecord` to open an unknown object, `messageOf` for a caught error, `real` and `isUnder` for paths, `readKey` and `readWorker` as the only readers of their files.
Guard: `noUnusedLocals`, `noUnusedParameters`, Biome `noUnusedImports`, `noUnusedVariables`; an unused export and a duplicated helper are *convention*.

**1.7 PREFER a function a reader holds in their head: cognitive complexity 15 or less.**
Guard: *convention*, measured with `pnpm exec biome lint --only=complexity/noExcessiveCognitiveComplexity src test`. Three functions are over it and are the written exception: the flat command switch `main` in `src/cli.ts` (33), the linear `gate` in `src/hook.ts` (23) and the field-by-field guard `adapterOf` in `src/state.ts` (18). A new function over 15 is split before it lands; a fourth one puts the rule in `biome.json` as an error and brings all of them under it.

**1.8 ALWAYS keep every file readable whole under this project's own gate: 350 lines and 32 KB.** A file splits by responsibility before it gets there, the way `worker.ts` gave birth to `boundary.ts`, `answer.ts` and `transport.ts`. The one exception is `pnpm-lock.yaml`, which nobody reads whole.
Guard: `test/conventions.test.ts`.

## 2. Architecture

**2.1 ALWAYS respect the map.** Seven files, one reason to change each, arrows that never turn back.

| File | Owns | Imports |
| --- | --- | --- |
| `src/state.ts` | the state folder, the guards, `Refusal`, the event log | `node:` only |
| `src/answer.ts` | pure text work on the worker's answer | nothing |
| `src/boundary.ts` | what may leave the machine | `state` |
| `src/transport.ts` | the two ways out: `fetch` to the worker, spawn of the fallback | `state` |
| `src/worker.ts` | the `bulk-read` and `code-write` flows | `answer`, `boundary`, `state`, `transport` |
| `src/cli.ts` | arguments, `doctor`, the exit code | `state`, `transport`, `worker` |
| `src/hook.ts` | the `Read` gate | `state` |

Guard: Biome `noImportCycles`; the import list of `src/hook.ts` by `test/conventions.test.ts`, because it is the start-up cost of every `Read` (4.4).

Off the map: `scripts/version.ts`, the git hook of 5.3. It is no part of the product: nothing in `src/` imports it, and it imports `node:` built-ins and the guards of `src/state.ts`, by `test/conventions.test.ts`.

**2.2 ALWAYS import from the file that owns the symbol**, by relative path with the real extension. No barrel, no `export *`, no default export.
Guard: Biome `useImportExtensions`, `allowImportingTsExtensions`; barrels are *convention*.

**2.3 PREFER functions and plain data to classes.** The only class is `Refusal`, because `instanceof` is how the CLI tells a refusal from a bug. No interface with one implementation, no factory for one product, no option for a value that never changes.
Guard: *convention*.

**2.4 ALWAYS pass a dependency as a parameter.** There is no container and no service locator. The seams the tests use are a parameter (`worker` in `src/transport.ts` · `invokeExternal`), a default parameter (`src/state.ts` · `logFile` takes `now = new Date()`), an environment variable (`CCSAVER_HOME`, `CLAUDE_CODE_EXECPATH`) and a file in the state folder.

```ts
// ❌ reads its collaborator from a global registry
const answer = await container.get("worker").ask(message)
// ✅ `src/transport.ts` · `invokeExternal`
export const invokeExternal = async (mode: string, system: string, message: string, worker: Worker | undefined): Promise<string | undefined> => { … }
```

Guard: *convention*. Revisit when a test needs to replace something that no parameter, variable or state file reaches, or when a seam gets a second implementation.

**2.5 PREFER the flat `src/`.** It holds 7 files and about 1,250 lines. Folders and layers earn their place past 15 files or 3,000 lines; until then a new concept is a new file on the map of 2.1.
Guard: *convention*.

## 3. Robustness

**3.1 ALWAYS end a stop the user can fix the same way:** one `Error: …` line on stderr, one `fail` event, exit code 1, nothing sent. Two doors lead there. State code throws a `Refusal`, caught once at the bottom of `src/cli.ts`; the worker path calls `fail`, which returns `never` (`src/transport.ts` · `fail`). Anything else that throws is a bug and is recorded as a `crash`.
Guard: every `throw new` in `src/` throws a `Refusal`, by `test/conventions.test.ts`; `test/log.test.ts` pins that a mistake on the command line is a `fail`, never a `crash`.

```ts
// ❌ a typo in an adapter name reads as a crash of ccsaver
throw new Error(`adapter ${name} not found`)
// ✅ `src/state.ts` · `loadAdapter`
throw new Refusal(`adapter ${name} not found in ${places.join(" or ")}`)
```

**3.2 ALWAYS turn an expected failure into a value.** A missing file is an answer, and the caller decides what it means.

```ts
// ❌ an inline try/catch at every call site, each free to swallow something else
let text
try { text = readFileSync(place, "utf8") } catch {}
// ✅ `src/state.ts` · `attempt`
const text = attempt(() => readFileSync(place, "utf8"))
if (text === undefined) continue
```

Guard: *convention*.

**3.3 ALWAYS validate at the boundary, by hand, and return a typed value built from the checked fields.** The boundaries are `worker.json` (`readWorker`), an adapter file (`adapterOf`, which also rejects unknown keys), the hook's stdin (`src/hook.ts` · `gate`), the worker's HTTP response (`src/transport.ts` · `contentOf`) and the fallback's stdout (`invokeClaude`). Every `JSON.parse` lands in a `const` typed `unknown`, or goes through `parsed`.

```ts
// ❌ trusts the shape of a response from the network
const content = (await response.json()).choices[0].message.content
// ✅ `src/transport.ts` · `contentOf`
if (!isRecord(raw) || !Array.isArray(raw["choices"])) return undefined
const first: unknown = raw["choices"][0]
```

Guard: `test/conventions.test.ts` for `JSON.parse`; `noPropertyAccessFromIndexSignature` forces the bracket on an unchecked key. No schema library: zero runtime dependencies is a promise (5.4). Revisit past 10 untrusted shapes or a shape nested more than 2 levels deep.

**3.4 NEVER read a broken config as an absent one.** Absent means defaults; present and malformed stops the call. `readWorker` once read a stray comma as "no worker", which quietly turned the paid fallback back on.
Guard: `test/state.test.ts`, "a worker.json that is there but wrong is an error, never the same as no worker".

**3.5 NEVER let one failure hide another.** Name the cause. `fellOf` tells a timeout from a body that is not JSON from a dead host. `invokeClaude` reads an `EPIPE` for what it is, a child that stopped reading, and reports the reason the child printed, which is all a spent budget leaves behind, before its exit and stderr. A worker's answer cut at an output limit falls as `length`, never as `incomplete`. Every fall to the paid worker says why on stderr first.

```ts
// ❌ past 64 KB of input the real error hides behind `spawnSync … EPIPE`
if (run.error) return fail(`fallback worker could not run: ${run.error.message}`)
// ✅ `src/transport.ts` · `invokeClaude`
const stoppedReading = isRecord(run.error) && run.error["code"] === "EPIPE"
if (run.error && !stoppedReading) return fail(`fallback worker could not run: ${run.error.message}`)
const raw = parsed(run.stdout)
const reason = reasonOf(raw)
if (reason !== undefined) return fail(`fallback worker failed: ${reason.slice(0, 400)}`)
if (run.status !== 0) return fail(`fallback worker exited ${run.status ?? run.signal}: ${run.stderr.slice(0, 400)}`)
```

Guard: `test/transport.test.ts`.

**3.6 ALWAYS choose, per boundary, which way it fails.** The hook fails open: a crash inside the gate lets the `Read` through and leaves a `crash` event, because ccsaver must never block a session. Egress fails closed: a refused path, a secret or a malformed config stops the call before anything is sent. The event log changes nothing: a failed append is swallowed (`src/state.ts` · `record`).
Guard: `test/events.test.ts`, `test/egress.test.ts`, `test/boundary.test.ts`.

**3.7 NEVER check and then act on a path in two steps.** Resolve each path once, so the file that is judged is the file that is read (`src/worker.ts` · `fileBlock`). Create with `flag: "wx"`, so an existing target is refused by the write itself. Replace a state file by writing a temporary name and renaming it (`src/state.ts` · `writePrivate`). Keep a log line under 4,096 bytes, so appends from two processes stay whole lines.
Guard: `test/egress.test.ts`, `test/code-write.test.ts`, `test/log.test.ts`.

## 4. Performance and async

**4.1 PREFER synchronous file I/O.** One process serves one call and has nothing to interleave, so `src/` reads and writes with the `*Sync` calls and awaits only the network: two `fetch` sites, `src/cli.ts` · `probe` and `src/transport.ts` · `invokeExternal`.
Guard: *convention*. Revisit for a long-lived process or a call that gains from reading files in parallel.

**4.2 ALWAYS bound what waits or grows.** A `fetch` carries `AbortSignal.timeout` and `redirect: "error"`; a spawn carries `timeout` and `maxBuffer`; an answer takes at most 8,192 tokens; the paid fallback takes at most 400,000 characters, 85 s and 0.50 $, and its wait and the worker's add up to less than the 120 s a Bash command gets; a log line takes at most 4,000 bytes.

```ts
// ❌ waits for ever, follows a redirect with the file in hand
const response = await fetch(worker.url, { method: "POST", body })
// ✅ `src/transport.ts` · `invokeExternal`
const response = await fetch(worker.url, { method: "POST", signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS), redirect: "error", body })
```

Guard: `test/transport.test.ts`, which also adds up the two waits; a new wait without a bound is *convention*.

**4.3 ALWAYS await or return every promise**, with `async`/`await` and no `.then` chains. `src/cli.ts` sets `process.exitCode` from `await main()`; the only `process.exit` lives inside `fail`.
Guard: Biome `noFloatingPromises`, `noMisusedPromises`, `useAwaitThenable`.

**4.4 ALWAYS treat the hook as the hot path: it runs on every `Read`.** The `sh` gate leaves an unplugged project before Node starts. In a plugged one the cost is Node's start-up, so `src/hook.ts` imports `src/state.ts` and `node:` built-ins, nothing else; it counts lines on the bytes and skips measuring a ranged read while the log is off. Touching the hook means measuring it before and after, the README's way: mean of 30 runs, process spawn included.
Guard: the import list by `test/conventions.test.ts`; the measurement is *convention*.

**4.5 NEVER optimise, or claim a saving, without a number.** A number in the README carries its sample size.
Guard: *convention*.

## 5. Maintainability

**5.1 ALWAYS change the README in the same commit as the behaviour.** The README is the specification: when it and the code disagree, one of them is a bug. A reason written there is known, not inferred. Documents that outlive a commit cite a file and a symbol, never a line number.
Guard: `test/skills.test.ts` ties the skills to the commands, and both manifests and the top of `CHANGELOG.md` to one version; `test/conventions.test.ts` ties this file's examples to the code; the rest is *convention*.

**5.2 ALWAYS bring the test with the behaviour; a fix starts with the test that fails.** Tests run on `node --test` with no network: a fake server on `127.0.0.1`, a fake `claude` binary, and a throwaway `CCSAVER_HOME` per test file. A test's name is a sentence that states the behaviour. A flaky test is chased under load, three suites in parallel for six rounds, before anyone calls it fixed.
Guard: `pnpm test` starts from a state folder that does not exist, so a test that forgets its own `CCSAVER_HOME` cannot touch a real key.

**5.3 ALWAYS write the commit as `type: subject`, in English.** `feat` is behaviour a user can see, `fix` is behaviour corrected, and `docs`, `test`, `refactor`, `perf`, `build`, `ci` and `chore` change no behaviour; a breaking change adds `!`. The body, when there is one, is a bullet list of what changed and why.

The hook needs Node.js 24.2, the floor `package.json` declares: `scripts/version.ts` runs on `import.meta.main`, which 24.0 and 24.1 leave undefined, so on those it does nothing and says nothing.

The message is also the release note. The hook of `.githooks/` turns the type into the next version (`scripts/version.ts` · `bump`) and the subject with its bullets into the entry of `CHANGELOG.md` (`scripts/version.ts` · `sectionOf`), then amends the commit; the README's Versions section has the behaviour case by case. NEVER type a version, and NEVER edit a section of `CHANGELOG.md`: the hook rebuilds the sections from the parent commit, so a hand edit does not survive its own commit.
Guard: `test/version.test.ts` for the hook, one throwaway repository per way of making a commit; `test/skills.test.ts` for the one version; the wording of a message is *convention*.

```
fix: a malformed worker.json stops the call

- it used to be read as "no worker", which turned the paid fallback back on
```

**5.4 NEVER add a runtime dependency.** A plugin installed from GitHub never runs `pnpm install`, so `src/` imports `node:` built-ins and its own files. A development dependency needs numbers, the owner's approval and the 24-hour release cooldown of `pnpm-workspace.yaml`; CI installs with `--frozen-lockfile`.
Guard: `test/conventions.test.ts`.

**5.5 ALWAYS leave CI read-only:** `permissions: contents: read`, actions pinned by commit SHA, Ubuntu and macOS on Node 24 and 26.
Guard: *convention*.
