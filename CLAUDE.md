# CLAUDE.md — velox-site-v9

## Worktree rule for parallel sessions — MANDATORY

Multiple Claude sessions (and Declan's own terminal) often work in this repo
at the same time. On 12 Sep 2026 this destroyed work three ways in one hour:
one session's staged files were swept into another session's unrelated
commit; that session then `git reset --hard`-ed its mistake away, deleting
the first session's files from disk; and two sessions raced each other on
push. Hence:

1. **If your work will create commits, enter a worktree first** — use the
   `EnterWorktree` tool at the start of the task (or `git worktree add`).
   Do all staging and committing there.
2. **The main checkout (this directory) belongs to Declan's terminal.**
   Never run `git reset --hard`, `git checkout .`, `git stash drop`, or
   `git commit -a` here. If you find files staged that you didn't stage,
   leave them alone — they are another session's work.
3. **Stage only files you created or edited, by name.** Never `git add -A`
   or `git add .`.
4. **Before every commit**, check `git status` and confirm every staged
   file is yours.
5. If a push is rejected, `git pull --rebase` and push again — never force.

## Repo facts that bite

- **Pushing `main` deploys to production** (Vercel). There is no staging
  branch.
- **Vercel freezes the function at `res.end()`** — any in-flight `fetch`
  dies. Always `await` outbound calls *before* responding. (This silently
  lost analytics data once and is regression-tested in
  `scripts/test/track-integration-test.js`.)
- The static site lives in `output/` — 200 baked HTML pages. Shared JS is
  `output/assets/js/core.js`; serverless functions in `/api`; shared server
  code in `/lib`.
- Tests: `npm test` runs everything — the Meta pixel/CAPI suite (dedup,
  privacy, freeze-bug regression) plus `compliance-test.js`.
  `npm run compliance` lints `output/` for content violations.
- Research-use-only compliance: no health claims, no dosing, no human-use
  language anywhere on the site or in generated content. The rules engine is
  `lib/compliance.js`, shared by the pre-deploy lint, the weekly live-site
  audit agent, and the marketing autopilot. **It is deliberately
  conservative**: the site must be able to publish research-framed education
  (negated disclaimers, comparison tables, FAQ questions, reporting on other
  sellers' lawsuits, and citation titles it cannot rewrite). Every exemption
  in there exists because a real page tripped it. If you loosen a rule, add
  the matching both-directions assertions to `scripts/test/compliance-test.js`
  — §1 proves real violations still fail, §3 proves the exemption can't be
  used as a loophole.
