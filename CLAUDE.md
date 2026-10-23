# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Plot is a BigBlueButton 4.0 HTML5-client plugin: a teacher shares up to 10 `y = f(x)` formulas,
students pick/edit them and see a plotly.js plot. README.md covers user-facing behaviour, deploy
and data handling.

## Commands

```
npm ci
npm test                                         # Jest (jsdom), all tests
npx jest tests/state.test.ts                     # one file
npx jest tests/plugin.test.tsx -t "multiline"    # one test by name
npm run lint                                     # eslint (airbnb + typescript)
npx tsc --noEmit -p .                            # type check (not part of lint or build)
npm run build-bundle                             # dist/Plot.js + dist/manifest.json
npm start                                        # dev server, http://localhost:4701/manifest.json
```

## SDK version must match the server

`bigbluebutton-html-plugin-sdk` is pinned to `1.0.0-beta.3` and `manifest.json` declares
`requiredSdkVersion: "~1.0.0-beta.3"`. BBB refuses to load a plugin whose range doesn't match its own
SDK (the console says `system SDK version [...] does not satisfy plugin requirement`). The SDK
README maps 0.1.x to BBB 4.0, but BBB 4.0.0 actually ships 1.0.0-beta.3. A test in
`tests/plugin.test.tsx` fails if `package.json` and `manifest.json` drift apart; change both together.

## Architecture

**Two React roots.** `src/index.tsx` renders `PlotPlugin` (`component.tsx`), which renders nothing
itself: it registers the Apps Gallery launcher and, while a session is open, a
`GenericContentMainArea` whose `contentFunction` creates a *separate* React root for `PlotPanel`.
State is not shared between the roots; each calls `BbbPluginSdk.getPluginApi(uuid)` and its own SDK
hooks.

**All shared state is in two data channels** (`channels.ts`, permissions in `manifest.json`):
- `plot-session`: the whole `SessionState` (formulas, mode, teacher's view), read with
  `LATEST_ITEM`. Only moderators may write or clear it. "Plot is open" means this channel has an
  entry; closing wipes both channels with `RESET_DATA_CHANNEL`.
- `plot-student-state`: each student's `{index, expr}`, pushed with `receivers: [{role: MODERATOR}]`
  so other students never receive it. Only `TeacherPanel` subscribes with `ALL_ITEMS`; everyone else
  uses `LATEST_ITEM` just to get a push function. The sender is identified by the server-set
  `createdBy`, never by the payload, and payloads are validated (`isStudentState`) because any
  client can push.

**Roles** (`state.ts`): teacher = presenter **and** `role === 'MODERATOR'`; any moderator gets
Close Plot. `PlotPanel` picks `TeacherPanel` or `StudentPanel` from these. Code that decides access
or stores student data carries `[REVIEW REQUIRED]` comments; keep adding them.

**Pure logic lives in `state.ts`** (who sees what, formula-list parsing, reselection after edits)
and `math/evaluator.ts`; UI components stay thin. The evaluator builds a minimal mathjs instance and
rejects any expression-tree node outside an allow-list (numbers, `x`/`pi`/`e`, `+ - * / ^`, eight
functions), so ranges, matrices, assignments and property access can't run. Don't swap in
`math.evaluate` or a full `create(all)` instance.

**SDK behaviours the code depends on:**
- `pushEntry` is `undefined` on the first render and arrives later (`data-channel/hooks.js` in the
  SDK). Push wrappers guard against it, and the launcher's `onClick` reads the latest push function
  through a ref.
- The server echo of a push arrives late. `TeacherPanel` keeps its own copy of the session
  (`local` state + `sent` ref), renders from it and builds every push on it. Never read
  `session.*` (the echo) when building a push; that reintroduces the select-then-type race.
- Plotly writes into the layout object it is given, so `PlotView` builds a fresh layout per call.

## Tests

`tests/fakeSdk.ts` replaces the SDK (wired by `jest.mock` in `plugin.test.tsx`) with an in-memory
server that models what the plugin relies on: per-user visibility from `receivers`, push/delete
permissions read from the real `manifest.json`, `pushEntry` arriving after the first render, and
`server.holdPushes`/`flush()` for slow-network races. Each fake user is a separate "browser";
`syncMainArea()` mounts or unmounts the main-area root the way BBB does. jsdom doesn't hide
collapsed `<details>` content, so visibility bugs there need an explicit `open` assertion.
`plotly.js-basic-dist-min` is mapped to `tests/__mocks__/plotly.ts`.

Tests are Given/When/Then and are written before the implementation.
