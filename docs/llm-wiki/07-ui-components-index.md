# UI Components Index

Use for component behavior, templates, CSS, charts, tables, and export UI.

## Read Order

| Task | Read first |
|---|---|
| TypeScript behavior | component `.ts`, service, model |
| template binding | component `.ts`, then `.html` |
| styling/layout | `DESIGN.md`, then `.html`, component `.css`, then `src/styles.css` `:root` |
| chart rendering | visualisation component, chart builder/registry |
| result table | algorithm schema, auto renderer/table registry |
| export/PDF | dashboard/detail component, export service |

## Ownership

| Area | Path |
|---|---|
| app shell | `src/app/app.component.*` |
| Experiment Studio | `src/app/pages/experiment-studio/` |
| Dashboard | `src/app/pages/experiments-dashboard/` |
| account/terms/notebook | corresponding page folder |
| shared layout | `src/app/pages/shared/` |

Header notebook pill: discover glow (`header-nav-link--discover`) until first `/notebook`
visit; persisted in `localStorage` key `mip.notebook.nav.seen` via `NotebookNavService`.

## Rules

- Search by visible text, selector, CSS class, or component class before opening
  folders.
- Prefer component-local CSS for feature layout.
- Use `src/styles.css` only for global behavior.
- Check output schema before changing result renderers.
- Do not edit unrelated CSS/templates in the same pass.
