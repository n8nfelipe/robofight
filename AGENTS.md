# Repository Guidelines

## Project Structure & Module Organization

RoboRinha is a dependency-free browser application with a flat structure:

- `index.html`: page structure, controls, editors, dialog, and canvas.
- `styles.css`: visual tokens, responsive layout, and animations.
- `app.js`: robot API, workers, simulation, persistence, and Canvas rendering.
- `README.md`: user-facing setup, gameplay, and API documentation.

There are currently no dedicated asset, build, or test directories. Prefer browser-native APIs and avoid adding generated files to the repository.

## Build, Test, and Development Commands

No build or dependency installation is required. Serve the repository over HTTP because Web Workers may fail under `file://`:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` and inspect the browser console after changes. Document any new automation or dependencies here and in `README.md`.

## Coding Style & Naming Conventions

Use two-space indentation in HTML, CSS, and JavaScript. Follow the existing JavaScript style: `const`/`let`, semicolons, single-quoted strings, camelCase functions and variables, and PascalCase classes such as `RobotRunner`. Use kebab-case for CSS classes and camelCase for element IDs. Keep UI selectors grouped in `ui`, simulation logic separate from drawing functions, and shared numeric rules easy to locate. Add comments only where strategy or geometry is not self-evident.

There is no configured formatter or linter; match surrounding code.

## Testing Guidelines

No automated test suite currently exists. Manually verify both desktop and narrow layouts, battle start/pause/reset/rematch, speed selection, editor persistence after reload, valid and invalid robot code, timeout handling, damage, victory, and turn-limit draws. Test through a local HTTP server in a modern browser. If tests are introduced, place them in `tests/` and name them after the behavior under test, for example `robot-runner.test.js`.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout. Use short, imperative commit subjects, optionally following Conventional Commits, for example `fix: stop workers when resetting battle`. Keep each commit scoped to one concern. Pull requests should explain the user-visible effect, list manual verification steps, link related issues, and include screenshots or a short recording for interface changes. Call out any changes to robot API behavior or persisted `localStorage` keys.

## Security & Compatibility

Robot code executes in browser Web Workers but should still be treated as untrusted input. Do not introduce secrets, remote credentials, or privileged endpoints. Preserve support for current Chromium, Firefox, and Safari releases, and keep the application usable when Google Fonts is unavailable.
