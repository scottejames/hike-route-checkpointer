---
name: update-project-artifacts
description: Use this immediately after completing a significant feature, architecture change, or notable bug fix in this project (Hike Route Checkpointer) — before telling the user the work is done. Also invocable directly as /update-project-artifacts. Walks through verifying the change, updating CHANGELOG.md, README.md, and the designs/ folder, and confirming new files are actually tracked by git, so no project artifact silently falls out of sync with what was actually built. Skip for genuinely trivial edits (typo fixes, comment-only changes, formatting) — this is for anything you would otherwise describe to the user as "I added/changed/fixed X."
---

# Keep project artifacts current

Adapted from Beth's Gang's skill of the same name. Treat this checklist as part of
finishing the task, not an optional extra pass at the end.

## 1. Verify the change actually works

- [ ] Run `npm run verify` (oxlint + Amplify backend typecheck + build + Vitest). Don't
      report something as done on the strength of "the code looks right."
- [ ] If the change touches the UI, actually look at it — drive the dev server with a
      headless Chromium (Playwright) and screenshot it, rather than trusting your mental
      model of the CSS or Leaflet's rendering.
- [ ] If the change touches `src/lib/` (grid reference math, GPX parsing, the schedule
      engine, export formats), add or update a unit test against a known fixture rather
      than only eyeballing the numbers — see `CODING_GUIDELINES.md` §6 for why this is
      the highest-value testing surface in this app.
- [ ] If you find yourself testing something by hand more than once, write it down as a
      real test instead.

## 2. Update CHANGELOG.md

- [ ] Add an entry under today's date (`## YYYY-MM-DD` — start a new heading if the date
      has rolled over since the last entry; otherwise append to the existing day's
      section).
- [ ] File it under `### Added` / `### Changed` / `### Fixed`, whichever actually applies.
- [ ] Say *why*, not just *what*, wherever the reason isn't obvious from the words alone.

## 3. Update README.md — only if this changed

This project has no separate OPERATE.md/TODO.md — README.md covers stack, run/verify/
deploy instructions, and the feature list all in one place.

- [ ] A new dependency or stack change → update the "Stack" section.
- [ ] A new npm script, a new prerequisite, a new "how to run/build/deploy this" step →
      update "Run"/"Verify"/"Deploy".
- [ ] A new or changed user-facing feature → update the "Features" list.
- [ ] A new caveat or limitation worth a future reader knowing → add it to "Notes".

## 4. Update CODING_GUIDELINES.md — only if this changed something normative

- [ ] Did this establish a new pattern worth reusing, or reveal that an existing
      guideline is wrong or missing an example? Update the relevant section rather than
      letting the lesson live only in this conversation.
- [ ] Skip this step for changes that don't reflect a convention decision worth
      remembering later.

## 5. Update the designs/ folder — only if this changed something design-worthy

`designs/README.md` indexes the set; `designs/architecture-overview.md` holds the
foundational patterns. Neither should drift from what was actually built — a stale
design doc actively misleads instead of just being silent.

- [ ] Did this introduce a new architectural decision, reject a real alternative, get
      shaped by a bug, or ship a meaningfully new feature/service? Add or update the
      relevant document in `designs/` — most changes extend `architecture-overview.md`
      (check `designs/README.md`'s table for the closest match) rather than needing a
      new document.
- [ ] Does this confirm, refine, or contradict an existing decision recorded there?
      Update that entry with what actually happened, not just the abstract principle,
      rather than leaving it to only live in this conversation.
- [ ] If this is a genuinely new topic large enough to deserve its own document (not
      just a paragraph added to `architecture-overview.md`), add it as a new file and
      add a row to `designs/README.md`'s index table so it's discoverable.
- [ ] Skip this step for changes that don't reflect a design decision worth remembering
      later — same "genuinely trivial" bar as the rest of this skill. A refactor with no
      new trade-off, or a bug fix that doesn't change any documented behavior, doesn't
      need an entry.

## 6. Confirm git actually has everything

- [ ] Run `git status --short` and read it — don't assume. New files show as `??` until
      staged; a commit that references a file which was never added will build locally
      (it's on disk) and break for anyone else who clones the repo.
- [ ] Scan the diff for anything that shouldn't be committed before handing back — a
      quick `git diff --cached | grep -iE "api[_-]?key|secret|token"` costs nothing, and
      check `amplify_outputs.json` specifically stays out (it's gitignored on purpose —
      it's per-environment, generated by `ampx sandbox`/`pipeline-deploy`).

## 7. Hand back to the user

- [ ] Don't commit or push unless asked — this project's user runs git themselves. End
      by summarizing what changed and asking whether they want it committed/pushed.
