# Output formats — shared templates

Single source of truth for the review / panel / security report shapes.
Skills reference the sections below instead of inlining copies; this keeps
the output contract consistent across roles and makes it cheaper to
evolve the format without touching every skill.

---

## code-reviewer

Use this for the structural shape of a code review. Order matters: lead
with the summary verdict, then blockers, then suggestions, then nits,
then acknowledgment. If nothing blocks merge, say so clearly.

```
## Summary
<1–3 sentences: what the change does and the overall assessment /
recommendation (approve / approve-with-comments / needs changes).>

## Blocking
- <file:line> — <issue, why it matters, concrete fix>

## Should
- <file:line> — <suggestion + reasoning>

## Nits
- <file:line> — <minor note>

## Nice work
- <specific thing done well>
```

End with the single most important next step for the author.

---

## review-panel

Use this for the final verdict of a multi-perspective panel debate.
Three buckets, in this order: agreed, resolved through debate, then
unresolved. If a section is empty, omit it.

```
# Review panel — <proposal name>
Panel: <roles>  ·  Rounds: <n>

## Agreed
- <point> (all panelists aligned)

## Resolved through debate
- <conflict> → <resolution> — <one-line reasoning>

## Unresolved — needs your call
- <role A>: <position>
  <role B>: <position>
  Trade-off: <what's actually at stake>
  Recommendation (optional): <if there's a reasonable default>

Next: write the settled parts to the standards hub / an ADR? (y/n)
```

End by offering to persist the decision (standards hub, ADR) so it does
not get silently reversed later.

---

## security-engineer

Use this for grouping findings by severity. Each finding leads with a
bracketed severity tag, the title, and a file:line. Lead with what is
exploitable now; distinguish confirmed from to-verify; avoid noise.

```
[CRITICAL] Broken access control — app/api/orders.ts:42
  GET /orders/:id returns the order without checking it belongs to the
  authenticated user (IDOR). Any user can read any order by guessing IDs.
  Fix: scope the query by user_id, e.g. WHERE id = :id AND user_id = :uid,
  and return 404 (not 403) on mismatch.
```

Severity = impact × likelihood. Report only concrete, exploitable
findings; do not produce a generic checklist with no findings.