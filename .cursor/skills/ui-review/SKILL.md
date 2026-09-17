---
name: ui-review
description: After frontend changes in MIP, render the affected page in the Cursor IDE browser MCP (not Playwright), compare it to adjacent existing UI, and fix homogeneity gaps before stopping. Use when CSS, templates, or visual layout changed.
---

Canonical instructions: [`.pi/skills/ui-review/SKILL.md`](../../../.pi/skills/ui-review/SKILL.md).

Cursor: IDE browser MCP (`browser_navigate` / `browser_lock` / `browser_snapshot` / `browser_take_screenshot` / `browser_click`). Unlock when done. Do not use Playwright unless asked.

Pi: follow that file (CDP + `read` PNG). Do not use Cursor `browser_*`.
