# Rule seeds

Rules are JSON data validated by @fm/contracts. Scope selection requires the
exact target profile; script scope additionally requires script ID, name and
namespace. Source-specific guidance also requires the exact input hash.
Neither seed references an executable transform. Shared rule diagnosis is
based on official match-pattern documentation; script guidance is a review
trigger, not a proven defect or repaired conversion.

`metadata.match.http-star-scheme` diagnoses a parsed @match value whose scheme
is literally http*. It does not match include patterns or arbitrary source
text. The self-owned fixtures demonstrate intended positive and negative
selection; they contain no upstream excerpts. Nothing is automatically
rewritten. `greasyfork-454120.storage-grant-review` offers guidance for the
pinned v98 mixed storage-grant/initGM design, preserving both API families
until an observed baseline failure supports a specific change.

Finite query vocabulary implemented by the converter (unrecognized identifiers
must fail closed; no eval, regex strings or user-supplied executable code):

| Kind | Query | Exact meaning |
| --- | --- | --- |
| metadata | match.http-star-scheme | At least one parsed @match value starts with the case-sensitive scheme http*://. |
| metadata | grant.storage-dual-alias | For at least one of getValue, setValue, deleteValue, listValues, both GM.method and GM_method occur in parsed @grant values. |
| ast | binding.initGM.storage-fallback | Top-level function initGM contains modern GM.getValue and legacy GM_getValue references, and an inner lexical GM binding is initialized by an initGM call. Parse the source AST; comments/strings do not count. |
| inputHash | lowercase 64-character SHA256 | Exact bytes of source match the pinned hash; no normalized-text hash. |
| ast | review.storage-semantics-preserved | Evidence-gated review postcondition: storage results, Promise timing, serialization, permissions and fallback behavior are preserved under the recorded static and browser checks. This is not an automatic syntactic proof; a runner must keep it pending until evidence exists. |

The script matcher and AST condition are necessary but insufficient: identity
and input hash must also match. A reduced synthetic snippet cannot satisfy
the source-hash condition and must never stand in for the locked source's
browser acceptance. Evidence includes immutable upstream file URLs/hashes
and the source-lock digest. Rule ranges use exact =3.9 and =157.0 pins.

The converter tests cover finite matchers, positive/negative selection,
explicit transform opt-in and byte idempotence. The two files listed in
`fixtures/rules/cases.json` also pass their expected matcher results and
repeated diagnosis stability. These static checks do not establish storage
postconditions or browser compatibility.
Any unknown/evidence-gated postcondition must block a success claim rather
than be considered true. Evolution requires validated results plus human
approval of the precise report/patch; these seeds confer no such approval.
