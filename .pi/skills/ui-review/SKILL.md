---
name: ui-review
description: After MIP frontend changes, render the affected page with CDP, read the PNG so the VL model sees pixels, compare to adjacent UI, and fix homogeneity gaps. Use when CSS, templates, or visual layout changed. Do not use Cursor browser MCP, Playwright, qwen_eye, or vision-proxy.
---

# UI review (pi)

After any frontend change. Do not stop after the first implementation.

Follow the global `frontend-visual` skill (`~/.pi/agent/skills/frontend-visual/SKILL.md`) for capture. MIP extras below.

## Capture

1. App at `http://localhost:4200` (`npm start` if down). Do not start Playwright.
2. `/home/kfilippopolitis/.agents/skills/computer-use/scripts/launch_cdp_chrome.sh`
3. `python3 /home/kfilippopolitis/.agents/skills/computer-use/scripts/cdp_browser.py screenshot /tmp/ui.png`
4. **`read` `/tmp/ui.png`**
5. `eval` / `text` for strings, computed colors, rects.

Reuse authenticated `:9222` (Keycloak). Fresh Chrome hits login — stop, do not type passwords. If studio data is missing, say so; a `file://` CSS harness is only valid for chrome, not live studio state.

Do not use Cursor `browser_*`, Playwright, Puppeteer, `qwen_eye.sh`, grim, or `:8001`.

## Check

typography, font weights/sizes, line heights, spacing rhythm, component density, colors, borders, radius, shadows, icon style, button/input treatment, hover/focus, empty/loading/error, responsive.

Ask: could a user believe this was designed by the same team as the surrounding interface?

If no: fix the 3 biggest inconsistencies, render again, repeat.

Use [DESIGN.md](../../../DESIGN.md) and `src/styles.css` `:root`. Tokens over new hex. Do not restyle unrelated surfaces. Sibling panels: variables, algorithm, statistic analysis.
