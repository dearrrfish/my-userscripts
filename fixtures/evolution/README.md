# Evolution regression fixtures

`packages/evolution/test/evolution.test.mjs` generates isolated synthetic projects under ignored `.fm/evolution-tests/`. Each explicit candidate includes an exact JSON regression suite with positive changed-rule match, negative nonmatch and byte idempotence cases. The generated source uses only an original minimal Test userscript; it is parsed/linted, never executed. Those human observation records are synthetic and cannot validate GreasyFork 454120.
