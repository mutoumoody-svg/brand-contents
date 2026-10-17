# Unified Creation Center

Entry: `/workspace.html`. Keep the responsive web application for shared team access; no desktop installation is required.

## Modes

- `external`: requires a pasted reference. Learn communication logic, not competitors' facts or personal testimony.
- `aspiration`: current situation, desired identity/lifestyle and perspectives inform both planning and writing. No automatic viral references are selected.
- `brand`: requires a brand and reference. Pick an existing brand content record or paste a published sample. Performance context is manually supplied and is not evidence of causality.

All modes reuse persistent jobs, per-piece generation, editing, feedback and text-overlap checks. Source samples and historical drafts are compared; this is not a semantic originality guarantee.

Existing API clients without a mode retain legacy behavior. Existing tasks and tables are preserved.

## Shared Workbench

All eleven legacy module addresses now redirect into `/workspace.html?module=...`. The workbench loads each same-origin module in a titled iframe on demand and retains its document when switching away, preserving form inputs during that browser session. This integrates existing functions without mixing their global scripts or changing storage APIs.

The module theme removes duplicate navigation and large legacy page headers, and applies shared typography, colors and responsive layouts. Desktop navigation is persistent; mobile navigation wraps above the module.

Refresh, closing the browser or logging out does not preserve unsaved legacy forms. The reload command explicitly warns about this. Persistent writing jobs remain server-backed. User-management visibility follows the role returned by authentication; backend authorization remains authoritative.

Login/recovery navigation and generated-job redirects inside a module are promoted to the top-level page to avoid nested login/workbench windows. New browser tabs also resolve back to the workbench.

## Verification

Run `npm run check`, `npm test`, and `node tests/ui-smoke.js` with Playwright available. Browser tests use mock AI/API fixtures, not a paid generation call.

Local changes require server deployment and process restart before production users see them. Back up data and configuration before deployment. Never upload `brand.env` to GitHub.
