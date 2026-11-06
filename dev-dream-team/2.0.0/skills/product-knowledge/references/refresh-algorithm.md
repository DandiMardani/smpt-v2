# Incremental Refresh — Algorithm

The point of incremental refresh is **token economy**: never re-read a whole repo
when only a few files changed. Re-analyze only the features whose code moved.

## Step-by-step

1. **Locate the map** — `PRODUCT_KNOWLEDGE.md` (root) or `.dev-dream-team/knowledge/`.
   If none exists, stop and do a full build instead (Mode 1).

2. **Read provenance** — parse `last_refreshed_sha` (and `last_refreshed` date)
   from the header block. For the folder format, use per-file SHAs in `index.md`.

3. **Confirm the repo is a git repo and the SHA is reachable:**
   ```bash
   git rev-parse --is-inside-work-tree
   git cat-file -e <last_refreshed_sha>^{commit}
   ```
   If either fails, see "Fallbacks" below.

4. **List what changed since then:**
   ```bash
   git diff --name-only <last_refreshed_sha>..HEAD    # changed files
   git log --oneline <last_refreshed_sha>..HEAD       # context / intent
   ```
   If nothing changed → re-stamp the date only and report "no changes." Cheapest
   possible run.

5. **Map changed files → affected features.** For each changed path, find which
   feature(s) list it under **Key files / Flow / Entry points** in the map. Build
   the set of features to re-analyze. Also scan the diff for **new entry points**
   (added routes, pages, jobs, CLI commands, event handlers) → candidate new
   features; and **deleted entry points** → features to mark removed.

6. **Re-analyze only that set.** Read just those features' files (and their
   immediate collaborators) to refresh: flow steps, data touched, external calls,
   failure points, and test coverage. Do not open unrelated code.

7. **Propagate to global sections only if the diff implies it:**
   - New/removed dependency (manifest changed) → update Stack / Integrations.
   - New/removed env var (config/`.env.example` changed) → update Env & config.
   - Schema/migration file changed → update Data model + the owning feature.
   - Otherwise leave global sections as-is.

8. **Update the debugging index** entries that reference changed features; add
   entries for newly discovered failure modes.

9. **Re-stamp provenance** — set `last_refreshed` to today and `last_refreshed_sha`
   to the current `HEAD` (`git rev-parse HEAD`). In the folder format, update the
   per-file rows for the docs you touched. Record in `index.md` which sections were
   refreshed this run.

## Fallbacks & staleness

- **No git / detached SHA / shallow clone**: fall back to files with an mtime newer
  than `last_refreshed`, or ask whether to do a full rebuild.
- **Very stale map** (e.g. HEAD is hundreds of commits ahead, or > ~60% of source
  files changed, or the map is older than ~90 days): a full rebuild is cheaper and
  safer than a huge incremental diff — do Mode 1.
- **Merge/rebase weirdness**: if the stored SHA isn't an ancestor of HEAD, use the
  merge-base: `git merge-base <last_refreshed_sha> HEAD` as the diff origin.
- **Big refactor touching many features**: refresh them, but if the architecture
  itself changed, rebuild the overview/architecture section fully.

## Guardrails

- Prefer editing existing sections over rewriting the whole file — smaller, safer
  diffs and far fewer tokens.
- Never delete a human-added note; if a feature section has manual annotations,
  preserve them and update around them.
- If unsure whether a change affects a feature, flag that section as `(review)`
  rather than silently leaving it wrong.
- Keep the run bounded: report the number of features re-analyzed and the token
  cost stayed proportional to the diff, not the repo.

## Scheduled invocation (weekly)

A scheduled run should, per connected repo:
1. Check a repo is connected and is a git work tree; if not, stop immediately (no
   cost).
2. Run this incremental refresh.
3. Report a one-line summary per repo: features refreshed, new/removed features,
   and anything flagged for review.
