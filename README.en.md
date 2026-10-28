# Security Workbench

Experimental review of **authorized** repository evidence. Target code is read as data and never executed. Detections start as candidates; human decisions remain separate from automated suggestions.

## Delivery states

- Public production v15 is preserved. A public repository or draft PR does not mean the website runs that code.
- Isolated QA runs exact commit `8ac53f9ad5a0ded0ea50242797f902d0756c0c42`, including sanitized attempt correlation. Both Workers were verified at 100% traffic. Jobs, metrics, logs, cron, Queue consumers, canary, pilot window and model calls remain off; no additional migration was applied.
- A and B login/catalog/metadata selection have been exercised at different times. Separate profiles, complete hosted negative tests, mobile and per-invocation CPU evidence remain open. Conditional Q2 authorization has not started a canary.
- The owner confirmed separate A/B profiles; hosted cross-account negatives remain unproven. This branch adds a manual, server-restricted closed-QA check using the existing session, CSRF, HTTP client and routes. It is locally tested, not deployed. Expected rejections retain their original HTTP contracts; unexpected responses stop the sequence. CPU collection capability is preflight, actual CPU is measured during a canary. Native capture privacy remains unproven. A new application SHA requires specific deployment approval and an explicit candidate update before conditional Q2 can apply. The draft PR chain is preserved; no merge or release is implied.

## GitHub access

Validated identity, App connection, discoverable metadata and permission to analyze are separate capabilities. The catalog lists the authenticated user × installation intersection, including repositories never analyzed. It reports partial coverage, pagination, errors and authorization requirements honestly. It does not infer inaccessible private names or a global total. Metadata selection does not resolve a commit or create a job. Only an explicit analysis action may revalidate access, pin a commit and reserve quota.

## Evidence and guidance

The scanner, versioned deterministic advisor and contextual model integration are different layers. Markdown contains candidates, evidence, current decisions, coverage and a portable prompt. It is not a verified patch. Contextual generation is disabled until provider, project, model, permitted data, retention and budget are separately approved. Suggestions never confirm vulnerabilities or apply fixes automatically.

Repeated native findings now have distinct review identities. Ambiguous legacy web findings keep the decision ledger unchanged and explicitly block ambiguous review/comparison. Old CLI data already lost by previous deduplication is not reconstructed or invented.

## Verification and limits

See the [current requirements matrix](docs/reconciliacao-entregas-2026-10-26.md) and [Q1 audit](docs/auditoria-cumulativa-q1-2026-10-26.md) for exact coverage, regressions and pending hosted tests. Synthetic tests, CI, visual inspection and real integration are reported separately. No complete security or production-readiness claim is made.

Automatic PR CI uses public standard Ubuntu runners and local/synthetic tests. Real GitHub acquisition smokes remain intact behind an explicit manual dispatch gate, off by default; a separate scope approval is required. No deployment, paid model, artifact upload or persistent cache is part of these workflows.

[Português and local CLI instructions](README.md) · [Security reporting](SECURITY.md) · [MIT license](LICENSE)

## Assisted review with Cloudflare methodology

The [versioned guide](docs/assisted-audit.md) organizes partial coverage and counterevidence for existing candidates while preserving human decisions. It includes offline notes validation and synthetic fixtures; it does not run the upstream audit, target code, AI, or patches. This increment depends on PR #47 and is not automatically deployed to QA or production.
