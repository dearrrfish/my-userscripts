# Needs-based evolution and deliberate approval

Consider evolution only when completed, verified usage demonstrates a reusable rule or instruction improvement. Keep a script-specific condition narrow when its evidence is specific; promote shared rules only with matching positive and nonmatching negative evidence. No draft means no proposal; do not manufacture changes after every run.

Active evolution runs in the source repository workspace with its trusted runner. Portable bundles and unrelated output directories can convert but cannot mutate active rules/skill. Rule, skill and both scopes require a complete origin and distinct complete replay plus converter positive, negative and idempotence regressions. A draft explicitly supplies reason, scope, full text files, regression fixtures and expectations. Executable changes, deletion and arbitrary paths are rejected. Rules live in `rules/`; skill evolution may change only `skills/fm-convert/SKILL.md` or references Markdown, leaving launcher/agent code unchanged.

Skill/both scopes additionally require the trusted portable runner and independent forward observations for its frozen raw requests. Create a behavior template when supported:

```sh
node "<skill-directory>/scripts/fm.mjs" evolve behavior-template --run "COMPLETE_RUN" --draft ".fm/draft.json" --replay-run "OTHER_COMPLETE_RUN"
```

The host freezes candidate resources and machine test bindings. Give an independent evaluator the candidate skill, raw requests and minimum artifacts without intended answers. Record real qualitative outcomes and full artifact/report bytes in the behavioral evidence. Machine CLI invariants alone do not prove instruction quality; pending templates cannot propose. If the required runner/evidence is unavailable or rejected, report that scope as gated rather than inventing success. Any changed candidate, runner or binding invalidates old behavior observations.

```sh
node "<skill-directory>/scripts/fm.mjs" evolve propose --run "COMPLETE_RUN" --draft ".fm/draft.json" --replay-run "OTHER_COMPLETE_RUN"
node "<skill-directory>/scripts/fm.mjs" evolve approval-template --proposal "PROPOSAL"
```

Present the full immutable report, complete patch, regression/behavior evidence and all exact proposal/report/patch hashes to the human. The template is only a pending approval record; do not replace its placeholder actor or assert approval automatically. Apply only after the human deliberately confirms the full concrete report and exact hashes, with unchanged fresh verification:

```sh
node "<skill-directory>/scripts/fm.mjs" evolve apply --proposal "PROPOSAL" --approval ".fm/human-approval.json"
node "<skill-directory>/scripts/fm.mjs" evolve reject --proposal "PROPOSAL"
```

Changed proposals require renewed approval. Output or runtime obligation changes require fresh actual browser evidence; same-output replay alone proves no new runtime behavior. Approval records are a local human trust boundary, not authenticated identity. Apply preserves immutable history, rechecks bases and rolls back ordinary transaction failures. Do not bypass stale locks or ownership failures. CI PR approval, scheduled updates and configurable LLM providers remain deferred; no current command authorizes them. Record only approved summaries in versioned documentation, retaining raw audit/evidence in ignored `.fm/`.
