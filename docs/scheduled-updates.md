# Scheduled conversion review updates

The workflow `.github/workflows/fm-scheduled-updates.yml` checks configured upstream scripts weekly on Monday at 04:17 UTC and supports a manual run. It produces a review PR, not a published script. The default model mode is `off`; scheduling is inactive until the repository variable `FM_UPDATES_ENABLED` is exactly `true`.

The workflow and its code must be on the default branch. Manual runs also require the enable variable and default branch. Configure upstream projects in `config/scripts.example.json` and select their IDs, review directory and model settings in `config/scheduled-updates.example.json`. Use the existing repository-config schema for URL, local or pinned Git sources. Local source files must exist in the checkout; Git sources retain their explicitly pinned commit until you change it.

## Model configuration

The shipped example retains bounded request, response and timeout settings. Keep those fields when changing the model mode.

For free inference, set `provider.mode` to `openrouter-free`. Store an OpenRouter key in the repository Actions secret `FM_MODEL_API_KEY`. The endpoint is fixed to `https://openrouter.ai/api/v1/chat/completions` and model to `openrouter/free`; the workflow does not fall back to paid models. OpenRouter documents its [free router](https://openrouter.ai/collections/free-models/) and [API](https://openrouter.ai/docs/api-reference/overview). A free model still requires credentials and is subject to provider availability and rate limits. Enabling this mode sends bounded source snippets to that provider.

For a custom OpenAI-compatible provider, set `provider.mode` to `custom` and add `provider.baseUrl` and `provider.model`. The API key uses the same `FM_MODEL_API_KEY` secret. For example, DeepSeek documents the compatible base URL `https://api.deepseek.com` and model `deepseek-flash` in its [API introduction](https://api-docs.deepseek.com/). The runner appends `/chat/completions` to the base URL, so do not supply a full completions URL. Custom mode makes no promise about pricing.

Production endpoints require HTTPS without URL credentials, query or fragment. Keys belong in Actions secrets or the local process environment, never JSON, `.env` committed to Git, command arguments or script metadata. An enabled model without a key fails explicitly. With `off`, no model request is made. GitHub Models is not used: its current [official documentation](https://docs.github.com/en/github-models) states the inference API is unavailable.

Model output is data containing exact snippet replacement anchors. It has no shell tools or repository write access. Requests use bounded body context rather than the entire upstream script; large/minified lines or unsafe contexts can be skipped. Metadata and existing attribution/comments are protected. Invalid, oversized, redirected, unfinished or unsafe responses do not become trusted repairs. Accepted edits receive real parsing, converter and lint diagnostics; the userscript itself is never executed.

## Review and provenance

The existing CLI synchronizes exact sources and dependencies, then performs configured baseline conversion. Edited drafts cannot replace a synchronized source lock. They receive separate diagnostic checks with the actual profile and rules, retaining original manual obligations. Candidates under the configured review root are unaccepted code artifacts with structured reports and hashes. Upstream metadata and URLs remain intact; later upstream updates may replace a manually installed patch. Use the existing reviewed release process when you need distribution metadata.

Browser and fixture evidence stay pending. A blocked baseline or candidate remains blocked; CI cannot assert runtime compatibility, complete an evolution run, fabricate acceptance, apply rules/SKILL changes, merge its own PR or finalize a release. A PR review does not bypass the existing evolution backend's origin/replay and approval gates.

Stable bindings include source/dependency bytes, configuration, profile, rules, SKILL/tool and model settings. Timestamps and run IDs do not cause repeated model requests. The generation job reads prior review data from `automation/fm-updates`, validates it as data and uses it for unchanged detection. Modified or incomplete generated artifacts fail ownership checks. Resolve such collisions by reviewing the branch and generated files; the workflow does not force-push or silently overwrite hand edits. Existing automation branches receive ordinary new commits and can need a manual merge from the default branch if their base becomes stale.

The read-only generation job holds the provider secret only during conversion. Its artifact is a validated allowlist of reviewed files and the synchronized source lock. The PR job has repository write permissions but no provider secret. It validates hashes, paths, file types and current ownership before staging the allowed files. Commits use `chore: update FM conversion review candidates`. Only schedule and manual events are accepted; PR code is never run with these secrets.

Raw local audit records stay under ignored `.fm/`. They are not uploaded as workflow artifacts, committed, or pasted into PR bodies. The reviewed transfer artifact expires after seven days. PR reports use structured statuses and counts rather than raw provider replies, errors or prompts.

## Local checks and activation

Build with the repository's Node 24.21.0 and pnpm 12.3.4 pins, then run:

```sh
pnpm build
pnpm updates --repository-config config/scripts.example.json --updates-config config/scheduled-updates.example.json
pnpm test:updates
```

Local runs synchronize the configured sources; model requests occur only when explicitly configured and supplied a key. Local PR-helper tests do not create a GitHub PR.

Enable the repository setting allowing GitHub Actions to create pull requests, alongside the workflow's `contents: write` and `pull-requests: write` permissions. The workflow uses `GITHUB_TOKEN`, without a separate PAT. See GitHub's [workflow token documentation](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication) and [trigger behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow); token-created PR checks may require approval rather than running immediately.

Disable `FM_UPDATES_ENABLED` to stop subsequent scheduled/manual runs. There is no automatic release or active evolution to roll back; generated candidates remain reviewable on their branch.

# VERIFY: After merging the workflow to the default branch, enable repository PR permissions and FM_UPDATES_ENABLED, run once with model off, and inspect the allowlisted PR/source-lock hashes. Then configure the chosen model and secret and perform a bounded real provider run; verify rate-limit/failure status and retained pending browser/fixture gates. Local tests do not establish hosted GitHub or provider availability.
