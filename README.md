# Plot

A BigBlueButton plugin for plotting functions in class. The teacher shares up to 10
formulas of the form `y = f(x)`. Students pick one, see its plot, and can edit it to see
how the curve changes.

## How it works

- **Teacher** = the presenter who is also a moderator. The teacher opens Plot from the
  **Apps Gallery**, types the formulas and clicks **Apply formulas**.
- **Teaching mode:** every student sees exactly what the teacher sees — the selected
  formula, the teacher's edits as they type, and the plot. Students can't change anything.
- **Student mode:** each student picks a formula, edits it, and clicks **Update plot** (or
  presses Enter). The teacher can pick a student under **Watch student** to see that
  student's latest formula and plot.
- When the teacher applies a new formula list, students go back to the teacher's formula.
- **Close Plot** removes Plot for everyone and deletes all shared data. The teacher or any
  other moderator can close it, so it can't get stuck open while a student is presenter.

Formulas use `x`, numbers, `pi`, `e`, `+ - * / ^`, brackets, and `sin cos tan log exp sqrt
abs pow`. Writing `y =` in front is optional. The plot covers x from −10 to 10; points where
the formula is undefined (such as `sqrt(x)` for x < 0) are left as gaps.

## Requirements

- BigBlueButton 4.0 with plugin SDK `1.0.0-beta.3` (checked on BBB `4.0.0` built
  2026-10-14). BBB refuses to load a plugin whose `requiredSdkVersion` in `manifest.json`
  doesn't match its SDK, and the browser console says so.
- Node.js 22 or later to build.

## Build and test

```bash
npm ci
npm test               # Jest unit and component tests
npm run lint
npm run build-bundle   # writes dist/Plot.js and dist/manifest.json
```

`npm start` serves the plugin at `http://localhost:4701/manifest.json` for development.

## Deploy

1. Copy `dist/Plot.js` and `dist/manifest.json` to the BBB server, into
   `/var/www/bigbluebutton-default/assets/plugins/plot/` (needs root; files mode 644).
   They are then served at `https://<your-bbb-host>/plugins/plot/manifest.json`.
2. Enable Plot per meeting with the `create` API parameter:

   ```
   pluginManifests=[{"url":"https://<your-bbb-host>/plugins/plot/manifest.json"}]
   ```

   It can also be enabled for every meeting on a server through bbb-web's
   `pluginManifests` setting.

## Data handling

Plot handles students' work, which can include children's data.

- A student's selected formula and edited text are sent **only to moderators**
  (data-channel `receivers` set to the moderator role). Other students never receive them —
  including a student who is made presenter.
- Who may write or clear the shared data is enforced by BBB from `manifest.json`: only
  moderators can write the session; students can add their own entries only.
- Data lives in BBB's data channels for the meeting and is deleted when Plot is closed.
  Nothing is written to recordings (`eventPersistence` is off). How long BBB keeps
  data-channel entries after a meeting ends has not been verified.
- Every moderator in the meeting can receive student work, not just the teacher.

## Known limitations

- If a moderator closes Plot while the teacher's last change is still in flight
  (about 300 ms plus network delay), Plot can reopen with the formulas. Student work stays
  deleted.
- Each student's confirmed edit is stored as a new entry until Plot is closed.
- The plugin bundle is about 1.7 MB (about 520 KB compressed), mostly plotly.js, and is
  downloaded by every participant when they join, even if Plot is never opened.
- The `y = …` caption under the plot can be cut off on short screens; scroll the panel.

## Project layout

```
manifest.json                 plugin manifest: SDK version, data channels and permissions
src/index.tsx                 entry point
src/plot-plugin/component.tsx Apps Gallery launcher and main-area registration
src/plot-plugin/channels.ts   data channels (session, student work)
src/plot-plugin/state.ts      pure logic: roles, formula list, who sees what
src/plot-plugin/math/         formula checking and evaluation (mathjs, allow-list)
src/plot-plugin/ui/           teacher and student panels, plot
tests/                        Jest tests; fakeSdk.ts models BBB's data channels
```

## License

MIT — see [LICENSE](LICENSE). Uses [plotly.js](https://github.com/plotly/plotly.js)
(MIT) and [math.js](https://github.com/josdejong/mathjs) (Apache-2.0).
