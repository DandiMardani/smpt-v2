# Ponytail Policy

Understand the affected flow before choosing the smallest correct change. For each new mechanism, stop at the first sufficient option:

1. Does it need to exist for a current requirement?
2. Does the repository already solve it?
3. Does the standard library solve it?
4. Does the framework or platform solve it natively?
5. Does an installed dependency solve it?
6. Can a small local change solve it?
7. Introduce a new abstraction, dependency, configuration surface, or infrastructure component only when the earlier options are insufficient.

Never simplify away correctness, authorization, security, data integrity, error handling, accessibility, or explicit requirements.

Three similar implementations are a review trigger, not an automatic extraction rule. Flag architecture pressure when evidence shows unrelated responsibilities accumulating, repeated changes for independent features, same-reason-to-change duplication, rising coupling, or a disproportionate diff. Escalate to architecture reasoning only when that evidence creates a present decision.
