# FireMonkey conversion skill

`skills/fm-convert/SKILL.md` is the normal automatically discoverable skill entrypoint. It routes to focused references for conversion, exact evidence, configured management and optional evolution. It has no dependency on another skill or a coding host's question tool: the host must obtain the human review through its available interaction mechanism.

Use the source launcher after installing the repository's pinned dependencies and running `pnpm build`:

```sh
node "/absolute/path/to/my-userscripts/skills/fm-convert/scripts/fm.mjs" convert --input "input.user.js" --output "converted.user.js" --target firemonkey-3.9-firefox-157.0
```

Run from the directory that owns the input and desired output. The launcher preserves that workspace; `.fm/` captures, logs and reports belong there. All input/config/output paths remain within that workspace after resolving symlinks. This works for a local input in an unrelated project without moving it into this repository. A source invocation requires the repository-built runtime, while a portable bundle includes the complete dependency/runtime closure and does not require pnpm or global installation. Both require Node >=24.21.0 <25. See [portable packaging](portable.md) for bundle construction, integrity verification and placement.

Portable layout places `runtime/` beside the skill entrypoint. The launcher first checks regular internal nonalias bootstrap paths and the verifier bytes against its manifest using only Node built-ins, then loads that verifier and verifies the complete bundle before dynamically importing the CLI, and fails safely on missing, modified or added files/links. This detects an accidentally changed verifier before execution; manifest consistency is not authenticity against coordinated tampering. Source layout resolves to this repository runtime. Installation/discovery placement is a host operation; this change does not install the skill globally or alter existing host skills.

Quoted launcher/file arguments support paths containing spaces; replace placeholders with actual paths and retain shell quoting. For blocked runs, inspect the returned JSON manifest’s `result.findings`/`guidance`; the Markdown state summary alone is insufficient. Conversion success means pinned static checks passed. Compatibility requires deliberate exact-output fixture and actual FireMonkey browser observations; templates start pending. The real GreasyFork 454120 target remains pending runtime acceptance, and legacy-static files remain unchanged. [Verification](verification.md) describes receipt trust and stale bindings.

Self-evolution is needs-based, requires completed origin/replay evidence and a concrete human-approved report/patch, and remains source-workspace-only. Skill instruction proposals additionally require the trusted portable forward runner and independent behavioral observations. The skill never auto-approves or fills synthetic observations for a real script. Launcher/agent executable resources cannot evolve through instruction proposals. Scheduled CI and PR approval are deferred.

Validation uses the skill-creator `quick_validate.py`; that checks frontmatter/scaffolding rather than behavioral quality. Launcher and portable integration checks exercise the actual runtime. Independent forward review evaluates the skill against frozen raw requests separately from those machine checks.
