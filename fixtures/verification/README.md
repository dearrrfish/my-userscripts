# Synthetic fixture evidence

`packages/cli/test/verification/fixtures.test.mjs` constructs synthetic source/candidate bytes and observations in memory. It tests receipt binding, canonical digests, suite immutability, pending/failed status and merge preservation. Command descriptions deliberately contain shell syntax to demonstrate that they remain inert data. No observation here is a real browser or GreasyFork 454120 acceptance receipt.
