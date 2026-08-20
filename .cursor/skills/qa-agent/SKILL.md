---
name: qa-agent
description: Runs a pre-ship QA review of SAGE covering functionality vs intent, security, and UX/UI, then stamps a pass so commit and deploy can proceed. Use when the user asks to QA, test before commit, review before deploy, ship, or when a commit/deploy command is blocked by the QA gate.
---

# SAGE QA agent

Pre-ship review for this private family + sole-prop budgeting app. A Cursor hook blocks `git commit`, `git push`, and Vercel deploys until this skill writes a matching pass stamp.

Do not commit or deploy until this review **PASS**es. Do not auto-fix findings unless the user asked to fix. Do not set `QA_GATE_SKIP` unless the user explicitly requested a bypass.

## When to run

- User asks to QA, review, test, or verify before shipping
- User asks to commit, push, or deploy
- The QA gate denied a shell command and instructed you to follow this skill

If the user asked to commit or deploy, run this review first, then retry the original command only on PASS.

## Workflow

Copy and track:

```
QA Progress:
- [ ] 1. Scope + intent
- [ ] 2. Functionality vs intent
- [ ] 3. Security
- [ ] 4. UX / UI
- [ ] 5. Verdict + stamp
```

Product-specific checks: [checklist.md](checklist.md).

### 1. Scope + intent

From the conversation, `git status`, and `git diff HEAD` (include untracked files you will ship):

1. State the **intent** in one sentence (what the user wanted).
2. State the **story** in one sentence: UI → API/data → result.
3. List **touched surfaces** (routes, APIs, components, env, Prisma).

If intent is unclear, infer from the diff and say so. Do not block solely for an inferred intent that still matches the code.

Skip a full pass only when the change is purely docs/comments/chore with no runtime effect — still scan security for leaked secrets, then stamp if clean.

### 2. Functionality vs intent

Verify the change does what was asked and does not break adjacent SAGE behavior.

- Trace the story through UI, route handlers, and data. Missing `await`, wrong HTTP method, Zod/client shape mismatches, and demo vs real workspace forks are common breaks.
- Personal vs Business ledger: new money objects should follow the active ledger; reassignment should stay possible.
- Demo (`/demo`, demo cookie): sample data only — **no** Plaid Link, **no** invites, **no** mutating real workspace data.
- Auth: Clerk-gated app routes; invite-only join; `ALLOWED_EMAILS` empty is open only outside production.
- Run `npx tsc --noEmit --pretty false` when TypeScript/TSX changed. Run `npm run lint` when JS/TS/TSX changed.
- Before **deploy** (not every commit), run `npm run build` unless it already succeeded on this tree.
- If `localhost:3000` is already serving, walk the affected pages in the browser and capture evidence (screenshot or console). Do not start a long-running extra stack unless the user asked for live verification and no server is up.

Stop the functionality walk at the first confirmed broken boundary; report it as a blocker.

### 3. Security

Launch **exactly one** `security-review` subagent (`run_in_background: false`, `description: "Security Review"`) with:

```
Full Repository Path: <absolute path to this repository>
Diff: uncommitted changes
Custom Instructions: SAGE is invite-only family finance. Flag secrets in diffs, Plaid token handling, authz on /api/*, demo bypasses, webhook verification, and XSS/injection in money UI. Do not report theoretical issues without a concrete path in this diff.
```

Use `Diff: branch changes` instead when the user is shipping a branch (commit already made, reviewing before push/deploy).

Then yourself check [checklist.md](checklist.md) **Security**. Treat critical/high security findings as blockers. Never request exploit PoCs.

### 4. UX / UI

Review **touched** UI against SAGE’s existing visual system — do not invent a new aesthetic.

- Tokens: `--bg` `#122618`, `--surface` `#1c3828`, `--fg` `#eef5ea`, `--muted` `#8fb396`, `--border` `#2f5a3c`, `--accent`/`--gold` `#d4a857`, `--danger` `#d4655a`, `--positive` `#7ec07a`. Headlines use `font-display` (Bodoni); UI/wordmark use Outfit sans. Wordmark is geometric sans + wide tracking, never serif.
- Reuse `Card`, `PageHeader`, `Button`, `Input` from `src/components/ui.tsx` and `AppShell` patterns. New one-off colors, shadows, or radii are blockers unless the change is explicitly a brand update.
- Hierarchy, spacing, empty/loading/error states, and mobile (`md` sidebar vs drawer) on touched pages.
- Accessibility: controls have names; icon-only buttons have `aria-label`; contrast on muted-on-green; `prefers-reduced-motion` for new animation.
- Privacy: amounts must honor privacy mode. Demo banner must stay obvious on `/demo`.
- Excellent UI bar: the changed screen should look intentional in the forest theme, not a default-Tailwind overlay. Clutter, misaligned headers, or unreadable charts on touched UI are blockers.

If the browser is available and the surface is visual, snapshot the changed page at desktop and a narrow width.

### 5. Verdict + stamp

Report:

```
## QA report

**Intent**: …
**Story**: …

| Area | Verdict | Evidence |
|------|---------|----------|
| Functionality | PASS/FAIL | … |
| Security | PASS/FAIL | … |
| UX / UI | PASS/FAIL | … |

### Blockers
- …

### Warnings
- …

**Result**: PASS | FAIL
```

**PASS** only with zero blockers and no high/critical security issues.

On PASS:

```bash
node .cursor/hooks/qa-gate.mjs --stamp
```

Then proceed with the user’s commit/deploy if they asked for it. Do not include `.qa-stamp.json` in git (it is ignored).

On FAIL: do not stamp, do not commit/deploy, list blockers first. Wait for the user before fixing.

## Gate notes

- Stamp is valid only for the current working-tree fingerprint. Further edits require a new QA pass.
- After a successful `git commit`, the hook refreshes the stamp so an immediate push/deploy of that same tree does not need a second pass.
- Bypass (user-explicit only): prefix the command with `QA_GATE_SKIP=1`.
