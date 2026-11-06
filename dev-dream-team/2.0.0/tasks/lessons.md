# Lessons — DDT v2 Refactor

## 2026-09-16 — Session 1

### Pattern: a copied skill folder is not the complete plugin bundle

Resolve shared attachments and helpers from one canonical bundle before a
dependent phase. A failed relative path must stop durable knowledge work; it is
not permission to recreate `.ddt` JSON manually. Verify the active skill path
against the source bundle and keep their entrypoint hashes aligned.

### Pattern: HEAD does not prove dirty behavior

Never stamp an unstaged, staged, or untracked observation with `HEAD`. Keep it
task-local until a commit contains every cited current-code path. Legacy evidence
also keeps its original SHA/date until each claim is reverified.

### Pattern: frontmatter boilerplate removal in YAML SKILL.md files

When removing a `metadata:` block from a YAML frontmatter that uses
`description: >` (folded block scalar), the description text can wrap over
many lines and end on a line that LOOKS unrelated to `metadata:`. To remove
the metadata block safely, match ONLY the contiguous 3 lines:

```
metadata:
  version: "2.0.0"
  role: "<X>"
```

Do NOT include the description block or the trailing `---` in the same
old_string match — it's easy to miscount line endings and accidentally
delete the description.

**Why:** I lost the description block on `backend-engineer/SKILL.md` once
because my old_string included the description content; Edit reported
success but the description was gone.

**How to apply:** For future YAML frontmatter edits, prefer the smallest
unique anchor (the 3 metadata lines), not the entire block including
boundary markers. Always re-read the file after the edit and confirm the
description block is intact.

### Pattern: Edit tool's old_string with `---` markers

In YAML files with `---` delimiters appearing multiple times (frontmatter
boundary + inside the body as horizontal rules), Edit's old_string match
is exact but humans easily miscount blank lines. Always re-Read after the
edit to confirm.

### Pattern: parallel Edit safety

When batching 14 Edit calls in one message, 5 of them failed because the
description's last line was different from what I assumed (the `description: >`
folded scalar wraps differently per file). Recovery: re-do those edits
with a smaller anchor (the 3 metadata lines, nothing else).

**Why:** Folded YAML scalars wrap unpredictably; copying my assumed line
from one file to another fails because the line break differs.

**How to apply:** For YAML frontmatter edits across many files, always
use the unique 3-line `metadata:` block as old_string — never a
multi-line wrap.

### Pattern: code-reviewer preamble removal must preserve the fresh-context review contract

The plan's Phase 5 said "remove the entire `## DDT v2 composition`
subsection" — but in `code-reviewer`, the preamble block ALSO contained the
**fresh-context review contract** (Independent Review vs Confirmation Review,
gap-registry G-13). A naive deletion removes contractual behavior, not just
boilerplate.

**Symptom:** After deleting the preamble, gap-registry G-13 has no skill that
knows what an Independent Review requires (fresh isolated task context, no
implementation transcript, no prior verdict).

**Fix:** Restore the fresh-context review content as a new host-agnostic
section (e.g. `## Fresh-context review`), titled without the "DDT v2" prefix
to avoid re-creating the redundancy, AND replace the `fork_turns: 'none'`
Claude-Code primitive with "the runtime's equivalent context-isolation
mechanism" in the same edit.

**Why:** Plan phases are interdependent; Phase 5 (preamble removal) and
Phase 8 (Claude-Code primitive strip) both touch the same block. Sequencing
them as separate edits and forgetting the contract is a real risk.

**How to apply:** Before deleting a "boilerplate" section from a skill body,
scan it for any non-trivial contractual behavior (Independent Review,
Confirmation Review, escalation rules, evidence-ledger rules, etc.).
If the section contains both boilerplate AND contract, split it: delete
boilerplate, preserve + rephrase contract.

### Pattern: append single-line footnote to satisfy test-preservation literals

`tests/test_ddt_structure.py:25` asserts every role SKILL.md contains the
literal `"role-composition.md"`. After removing the preamble (where this
literal lived), restore it via a single trailing line:

```
Composition contract and required attachments live in `ddt/role-composition.md` and `ddt/attachments.json`.
```

Append at end of file using the file's unique last-line anchor. Same pattern
works for `"attachments.json"` in workflow files (though the 3 workflow files
already had the literal in body — no edit needed).

**Why:** Test assertions on literal strings survive minimal structural
changes if you anchor the literal in a small, durable place (the trailing
footnote). The footnote is purely declarative and adds ~10 tokens per file;
negligible token cost.

**How to apply:** When a plan deletes the only occurrence of a test-required
literal, append a one-line footnote to the file (or to a related artifact
that the test scans). Re-run tests after to confirm.
