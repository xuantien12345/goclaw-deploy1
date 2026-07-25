# SP-API Restricted Role — Appeal Answer Pack

Working document for re-submitting the Solution Provider Profile after the Restricted-role
rejection (case 20883436591). Amazon rejected nine control answers; this file holds a draft
answer for each, plus the evidence to attach and the gaps we must close **before** claiming a
control.

**Reference:** [Guidance to address key security controls in SP-API integration](https://developer-docs.amazon.com/sp-api/docs/guidance-to-address-key-security-controls-in-sp-api-integration)

## How to use this document

1. Answers must be **true statements about our organization**, not aspirations. Where a control
   is not yet implemented, close the gap first (see [Gap register](#gap-register)), then write
   the answer.
2. `[[FILL: ...]]` marks a fact only we can supply (vendor names, hostnames, role titles,
   frequencies). Every placeholder must be replaced before submission — an unfilled or vague
   answer is what triggers a second rejection.
3. Lines marked **Verified in code** cite this repository and can be backed with a code or
   config excerpt if the reviewer asks. Everything else needs a policy document or a console
   screenshot as evidence.
4. Reviewers grade on **specificity**: named tool, named owner, stated frequency, stated
   threshold. "We follow industry best practices" scores zero.
5. Answer scope is the **whole environment that touches Amazon Information** — production
   gateway, database, backups, CI/CD, and employee laptops — not just the application code.

---

## 1. Network Protection 1.1

> Describe the network protection controls used by your organization to restrict public access
> to databases, file servers, and desktop/developer endpoints.

**What the reviewer wants:** proof that no datastore is reachable from the public internet, a
default-deny perimeter, and a named path for administrative access.

**Draft answer:**

> All systems processing Amazon Information run in [[FILL: cloud provider / VPS provider and
> region, e.g. "a single-tenant VPS at Hetzner (eu-central)"]] behind a default-deny firewall
> ([[FILL: firewall product, e.g. "provider cloud firewall + host-level nftables"]]).
>
> **Databases.** PostgreSQL 18 is not published to any public interface. It runs on a private
> Docker bridge network and is reachable only by the gateway container on that network; port
> 5432 is not bound to a public address and is denied at the perimeter firewall. There is no
> public DNS record for the database host. Database credentials are unique per environment and
> are never shared with developer workstations.
>
> **Application ingress.** The only inbound ports open to the internet are 443/tcp
> (HTTPS/WSS) and [[FILL: 80/tcp for ACME redirect, if used]]. TLS is terminated at
> [[FILL: reverse proxy, e.g. "Caddy with automatic Let's Encrypt certificates, TLS 1.2 minimum"]].
> All other inbound traffic is dropped.
>
> **Administrative access.** Administrators reach hosts only over [[FILL: e.g. "a Tailscale
> (WireGuard) private network with device-level ACLs"]]; SSH is key-only, password
> authentication and root login are disabled, and the SSH port is not exposed to the public
> internet. The gateway itself supports being published exclusively on this private overlay
> rather than a public interface (`docker-compose.tailscale.yml`, `tsnet` build tag).
> Administrative HTTP endpoints additionally require a bearer token compared in constant time
> and are gated by role.
>
> **File servers.** We operate no public file server. Agent workspace files are stored on the
> application host under a per-agent, per-user directory and are served only through the
> authenticated gateway, which enforces a workspace boundary check plus a tenant-scope check on
> every path before serving (`internal/http/files.go`). Object storage buckets, where used, are
> private with public access blocked ([[FILL: bucket names / "not applicable"]]).
>
> **Developer endpoints.** Developer laptops have no inbound listening services exposed to the
> internet, run a host firewall in default-deny inbound mode ([[FILL: e.g. "macOS Application
> Firewall enforced by MDM"]]), and connect to production only through the private overlay
> network described above. No developer workstation holds a direct database credential for the
> production database.

**Evidence to attach:** network diagram; firewall rule export; `docker compose` port bindings
showing no public database bind; VPN/overlay ACL export; `sshd_config` excerpt.

**Verified in code:** private-overlay deployment option (`docker-compose.tailscale.yml`,
`tsnet` build tag); constant-time token comparison and CORS origin allowlist
(`docs/09-security.md` §Layer 1); two-layer file path isolation (`internal/http/files.go`).

---

## 2. Asset Management 2.3

> Describe the monitoring mechanism your organization uses to prevent employees to access
> Amazon Information from personal devices (USB flash drives, cellphones). Specify how your
> organization is alerted if such incidents occur.

**What the reviewer wants:** a technical control (not just a policy) that blocks unmanaged
devices and removable media, **plus a named alerting path**. The second half is where most
appeals fail — describe the alert, its recipient, and its response time.

**Draft answer:**

> Amazon Information may only be accessed from company-owned, company-managed endpoints. Our
> asset inventory is maintained in [[FILL: inventory system, e.g. "a Google Sheets asset
> register reviewed monthly" or an MDM console]] and records device owner, serial number,
> OS version, disk-encryption status, and enrollment date.
>
> **Blocking unmanaged devices.** All endpoints are enrolled in [[FILL: MDM, e.g. "Google
> Workspace endpoint management" / "Microsoft Intune" / "Jamf"]]. Access to the systems that
> hold Amazon Information (gateway admin console, database, source control, cloud provider
> console) is restricted by [[FILL: e.g. "Google Workspace context-aware access rules that
> require a managed, encrypted, screen-locked device"]], so an unenrolled personal laptop or
> phone cannot authenticate even with valid credentials. MFA is mandatory for every account.
>
> **Removable media.** USB mass-storage write access is disabled by MDM policy on all managed
> endpoints ([[FILL: exact policy name/setting]]). Full-disk encryption ([[FILL: FileVault /
> BitLocker]]) is enforced and its status is continuously reported by the MDM. Amazon
> Information is never exported to removable media; bulk export from the application requires
> an administrator role and is logged.
>
> **Monitoring and alerting.** [[FILL: describe the actual detection, e.g. "MDM raises a policy
> violation event on USB mass-storage attachment or on a device dropping out of compliance;
> Google Workspace alert-center rules raise an event on sign-in from an unmanaged device or an
> unusual location"]]. These events are delivered to [[FILL: destination, e.g. "the #security
> channel and security@<domain>, monitored by the <role> during business hours"]]. An alert is
> triaged within [[FILL: e.g. "one business day"]]; a confirmed violation follows the incident
> response process in control 1.6, and the device is remotely locked or wiped through the MDM
> if warranted.

> [!IMPORTANT]
> If we do not currently run an MDM, this control cannot be answered honestly and will be
> rejected again. See [Gap register](#gap-register) — this is the single most likely cause of
> the original rejection.

**Evidence to attach:** MDM enrollment list; USB-restriction policy screenshot; context-aware
access rule; a sample alert email/notification with recipients visible.

---

## 3. Encryption at Rest 2.4

> Describe how your organization stores Amazon information at Rest including: (a) encryption
> methods (AES-128, RSA-2048, etc.), and (b) key management systems.

**What the reviewer wants:** named algorithm **and** key size, applied at both the application
and storage layer, plus where keys live, who can read them, and how they rotate.

**Draft answer:**

> **(a) Encryption methods.**
>
> - *Application layer.* Sensitive values are encrypted with **AES-256-GCM** (authenticated
>   encryption) before being written to the database. Each record uses a fresh 96-bit random
>   nonce generated from the OS CSPRNG; the nonce is stored with the ciphertext and
>   authentication tag, and values carry an `aes-gcm:` prefix so unencrypted legacy values are
>   detected and logged. Implementation: `internal/crypto/aes.go`. This covers LLM provider API
>   keys, integration/MCP server credentials, custom tool environment variables, and webhook
>   signing secrets.
> - *Credential digests.* Our own API keys are never stored in recoverable form: only a
>   **SHA-256** digest and an 8-character display prefix are persisted, and the raw key is shown
>   to the user exactly once (`internal/crypto/apikey.go`).
> - *Storage layer.* The database volume and backup volume reside on
>   [[FILL: e.g. "LUKS-encrypted (AES-256-XTS) block storage" / "provider-managed AES-256
>   volume encryption"]]. Backups are encrypted at rest with [[FILL: method]] and stored at
>   [[FILL: location]] with [[FILL: retention period]].
> - *Endpoints.* All managed laptops use full-disk encryption ([[FILL: FileVault / BitLocker,
>   AES-256]]), enforced and monitored by MDM.
> - *In transit (for completeness).* TLS 1.2+ for all external traffic; the database is reached
>   only over the private network described in control 1.1.
>
> **(b) Key management.**
>
> - The application data-encryption key is a 32-byte key supplied as `GOCLAW_ENCRYPTION_KEY`
>   (accepted as 64 hex chars, 44-char base64, or 32 raw bytes — `crypto.DeriveKey`). It is
>   generated with a CSPRNG and never committed to source control; the repository's shell
>   guard additionally blocks commands that would echo this variable
>   (`internal/tools/shell_deny_groups.go`).
> - The key is stored in [[FILL: key store, e.g. "the provider's secret manager" / "an
>   0600-permission `.env.local` on the production host readable only by the service user" /
>   "1Password Secrets Automation"]] and injected into the process environment at start-up.
>   Access is limited to [[FILL: role/named individuals]] and is [[FILL: logged how]].
> - Rotation: the key is rotated [[FILL: frequency, e.g. "every 12 months and immediately on
>   suspected compromise or personnel change"]] via [[FILL: procedure — re-encrypt stored
>   secrets with the new key, then retire the old one]].
> - On desktop deployments, secrets are held in the operating-system keyring (`go-keyring`)
>   with a restricted-permission file fallback under `~/.goclaw/secrets/`.
> - Cloud/infrastructure keys ([[FILL: KMS, e.g. "AWS KMS with automatic annual rotation"]])
>   manage volume and backup encryption; we do not have access to the raw key material.

**Evidence to attach:** `internal/crypto/aes.go` excerpt; volume-encryption console screenshot;
secret-manager access policy; key-rotation runbook.

**Verified in code:** AES-256-GCM with random nonce (`internal/crypto/aes.go:20-98`); 32-byte
key derivation (`internal/crypto/aes.go:107-128`); SHA-256 API key digests
(`internal/crypto/apikey.go`); OS keyring on desktop (`CLAUDE.md` → Desktop Edition).

---

## 4. Logging and Monitoring 2.6

> Describe your organization's security logging and monitoring system, including monitoring
> mechanisms for suspicious activities, and incident investigation procedures.

**What the reviewer wants:** what is logged, where it is centralized, how long it is retained,
what triggers an alert, and how an investigator reconstructs an incident.

**Draft answer:**

> **What we log.** The gateway emits structured JSON logs (Go `log/slog`). Security-relevant
> events use a dedicated `security.*` event namespace and are emitted at WARN level or above,
> which makes them independently searchable and alertable. Categories include:
>
> | Category | Example events |
> |---|---|
> | Authentication / authorization | `security.api_key_revoke_forbidden`, `security.api_key_owner_override`, `security.backup_owner_denied` |
> | Tenant isolation | `security.cross_tenant_send_blocked` |
> | Transport / origin | `security.cors_rejected`, `security.cors_open` |
> | Path and file access | `security.files_path_denied`, `security.files_realpath_escape`, `security.broken_symlink_escape` |
> | Command execution controls | `security.credentialed_binary_denied`, `security.credentialed_binary_gate_error`, `security.credentialed_binary_wrapper_too_deep` |
> | Webhook authenticity | `security.facebook_webhook_signature_invalid`, `security.feishu_webhook_token_mismatch` |
> | Insecure configuration | `security.default_db_password`, `security.config_leak_stripped` |
>
> Each event carries the acting principal, tenant and agent identifiers, and the denied
> operation. Prompt-injection detection results are logged with the matched pattern class.
> Credential values are scrubbed from logs and tool output by static regex patterns (provider
> API keys, cloud access keys, connection strings, bearer tokens) and by runtime-registered
> dynamic scrubbing, so secrets do not enter the log stream. Every LLM call is traced with
> request metadata for later reconstruction (`internal/tracing`).
>
> Additional log sources: [[FILL: reverse proxy access logs, host auth logs (`sshd`), cloud
> provider audit log, GitHub organization audit log, MDM events]].
>
> **Centralization and retention.** Logs are shipped to [[FILL: destination, e.g. "Grafana Loki"
> / "Better Stack" / "CloudWatch Logs"]] and retained for [[FILL: e.g. "90 days hot, 12 months
> archived"]]. Log storage is append-only / write-restricted to [[FILL: who]].
>
> **Suspicious-activity monitoring.** Alert rules fire on [[FILL: e.g. "any `security.*` event
> at WARN or above", "repeated authentication failures from one source within 5 minutes",
> "cross-tenant access denials", "rate-limit saturation", "unexpected administrative
> configuration change", "health-check failure"]]. Alerts are delivered to [[FILL: channel and
> recipients]] and acknowledged within [[FILL: target time]]. Rate limiting (token bucket per
> user/IP) and request size limits provide inline abuse protection in addition to alerting.
>
> **Investigation procedure.** On an alert the on-call responder: (1) records the alert in
> [[FILL: ticket system]] with a timestamp; (2) queries the centralized logs by tenant, user,
> and API-key prefix to build a timeline; (3) determines scope — which tenants, which records,
> whether Amazon Information was involved; (4) preserves relevant logs and, where needed, a
> database snapshot as evidence before remediation; (5) executes containment per control 1.6;
> (6) records root cause and corrective actions in a written post-incident report reviewed by
> [[FILL: role]].

**Evidence to attach:** screenshot of the log platform showing `security.*` events; alert rule
definitions; retention setting; one redacted investigation write-up.

**Verified in code:** `security.*` slog event namespace (grep across `internal/`, 40+ distinct
events); credential scrubbing (`docs/09-security.md` §Layer 4); rate limiting
(`internal/gateway/ratelimit.go`); LLM tracing (`internal/tracing`).

---

## 5. Risk Management and Incident Response Plan 1.6

> Summarize the steps taken within your organization's incident response plan to handle
> database hacks, unauthorized access, and data leaks.

**What the reviewer wants:** a documented plan with named roles, ordered phases, and — critical
for Amazon — an explicit commitment to **notify Amazon within 24 hours** of a security incident
involving Amazon Information, as required by the Data Protection Policy.

**Draft answer:**

> Our incident response plan is documented at [[FILL: location, e.g. "docs/runbooks/incident-response.md,
> reviewed annually and after every incident"]] and owned by [[FILL: role, e.g. "the Security
> Lead"]]. It is tested [[FILL: frequency, e.g. "annually via a tabletop exercise simulating a
> database compromise"]]. Roles: Incident Commander [[FILL]], Technical Lead [[FILL]],
> Communications Lead [[FILL]].
>
> 1. **Detect and report.** Incidents are detected by the alerting described in control 2.6, or
>    reported by any employee to [[FILL: channel]]. Any suspected compromise is reported
>    immediately; there is no penalty for a false positive.
> 2. **Triage and declare.** The on-call responder classifies severity ([[FILL: SEV1–SEV3
>    definitions]]) within [[FILL: e.g. "30 minutes"]] and declares an incident, opening a
>    ticket and a dedicated channel. Any incident that may involve Amazon Information is
>    automatically at least [[FILL: severity]].
> 3. **Contain.** Immediate actions, in order of applicability: revoke and rotate the affected
>    credentials (SP-API refresh tokens, LLM provider keys, gateway API keys — each is revocable
>    individually and stored only as a hash or as AES-256-GCM ciphertext); disable the affected
>    user, agent, or tenant; block the source at the firewall/reverse proxy; isolate or stop the
>    affected container; take the service offline if containment requires it.
> 4. **Preserve evidence.** Snapshot the affected host and database, export the relevant log
>    window to immutable storage, and record a timeline before any remediation that would
>    destroy state.
> 5. **Assess scope.** Determine which data was accessed or exfiltrated, which tenants and
>    selling partners are affected, and whether Amazon Information (including PII) was in
>    scope, using the per-tenant, per-agent, per-user log attribution described in control 2.6.
> 6. **Notify.** If Amazon Information is involved, we notify Amazon **within 24 hours** of
>    discovering the incident, via [[FILL: the SP-API security incident contact process —
>    security contact on file / Solution Provider Portal case]], and provide updates until
>    closure. Affected selling partners and any regulator/data-subject notifications required by
>    applicable law are handled by [[FILL: role]] within the statutory deadline
>    ([[FILL: e.g. "72 hours where GDPR applies"]]).
> 7. **Eradicate and recover.** Remove the attacker's access and any persistence, patch the
>    exploited weakness, restore from a known-good encrypted backup where data integrity is in
>    question, verify integrity, then restore service. Restoration from backup is tested
>    [[FILL: frequency]].
> 8. **Post-incident review.** Within [[FILL: e.g. "five business days"]] we produce a written
>    root-cause analysis with corrective actions, each with an owner and a due date, tracked to
>    completion in [[FILL: ticket system]]. Findings feed back into the risk register, which is
>    reviewed [[FILL: frequency]].

**Evidence to attach:** the incident response plan document itself (Amazon frequently asks for
it); tabletop exercise notes; contact list; a redacted past post-mortem.

---

## 6. Credential Management 1.4

> How does your organization enforce password management practices for all the systems handling
> Amazon information as it relates to required length, complexity and expiration period?

**What the reviewer wants:** concrete numbers for length, complexity, and expiry, and the
mechanism that **enforces** them (not a policy PDF). Answer for both human accounts and machine
credentials.

**Draft answer:**

> **Human accounts.** Access to every system handling Amazon Information is federated through
> [[FILL: IdP, e.g. "Google Workspace SSO"]], so one enforced password policy covers all of
> them. Enforced settings: minimum [[FILL: e.g. "14"]] characters; complexity requiring
> [[FILL: e.g. "a mix of upper case, lower case, digits and symbols"]]; password reuse blocked
> for the last [[FILL: N]] passwords; expiration every [[FILL: e.g. "90"]] days; automatic
> lockout after [[FILL: N]] failed attempts. These are enforced by the identity provider's
> policy engine, not by convention — a non-compliant password cannot be set. Multi-factor
> authentication is mandatory for all accounts, including administrators. Passwords are
> generated and stored in [[FILL: password manager, e.g. "1Password"]]; sharing passwords over
> email or chat is prohibited, and shared/generic accounts are not permitted — every account
> maps to one named individual. Access is reviewed [[FILL: frequency, e.g. "quarterly"]] and
> revoked within [[FILL: e.g. "24 hours"]] of an employee's departure as part of the offboarding
> checklist.
>
> **Privileged access.** Production host access is key-based only (SSH password authentication
> and root login disabled); keys are per-person, [[FILL: key type, e.g. "ed25519"]], protected
> by a passphrase, and revoked on offboarding. Database superuser credentials are held by
> [[FILL: role]] only.
>
> **Machine and application credentials.** Application API keys are randomly generated
> (`crypto/rand`), transmitted once, and stored only as SHA-256 digests, so they cannot be
> recovered from the database (`internal/crypto/apikey.go`); every key is individually
> revocable and scoped by role (admin / operator / viewer — `internal/permissions/policy.go`)
> and by tenant. Third-party credentials (LLM providers, integrations, SP-API tokens) are stored
> AES-256-GCM encrypted (control 2.4), never in source control or configuration files committed
> to the repository; the deployment refuses to treat secrets as configuration and logs a warning
> if a default database password is detected (`security.default_db_password`). Machine
> credentials are rotated [[FILL: frequency]] and immediately on suspected exposure or
> personnel change.

**Evidence to attach:** IdP password policy screenshot showing the numeric settings; MFA
enforcement screenshot; offboarding checklist; password manager admin policy.

**Verified in code:** random API key generation and SHA-256-only storage
(`internal/crypto/apikey.go`); role model (`internal/permissions/policy.go:27-29`); default
password warning (`security.default_db_password`).

---

## 7. Secure Coding Practices 2.5

> How is Personally Identifiable Information (PII) protected during testing?

**What the reviewer wants:** an unambiguous statement that **production data / Amazon
Information is never copied into non-production environments**, and what is used instead.

**Draft answer:**

> Amazon Information and production PII are never copied into development, test, staging, or
> CI environments. This is a written rule in our engineering guidelines and is enforced by
> environment separation: test environments have no credential for the production database and
> cannot reach it over the network (control 1.1).
>
> **Test data.** Automated tests run against a disposable PostgreSQL container created per run
> and destroyed afterwards (`goclaw_test`), seeded exclusively with synthetic fixtures
> committed to the repository. Our CI configuration (`.github/workflows/ci.yaml`) starts this
> ephemeral database as a service container; it contains no customer data and is not reachable
> from outside the CI job.
> Where realistic data shapes are needed, we generate them synthetically rather than sampling
> production. [[FILL: if you ever need production-shaped data, describe the anonymization —
> e.g. "irreversible pseudonymization of identifiers and removal of all contact fields before
> export, performed by <role>"; if never, state "we do not export production data under any
> circumstances"]].
>
> **Local development.** Developers work against local databases seeded with the same synthetic
> fixtures. Screenshots, bug reports, and support tickets are redacted before being attached to
> issues; logs pasted into tickets pass through the same credential-scrubbing rules used in
> production.
>
> **Secrets in test.** No production secret is used in CI. CI uses throwaway credentials scoped
> to the ephemeral test database; real secrets are held in [[FILL: e.g. "GitHub Actions
> encrypted secrets, restricted to protected branches and to the deploy workflow"]] and never
> printed — workflow logs are scrubbed and secret masking is enabled.
>
> **Access to non-production environments** is limited to employees with a business need
> ([[FILL: how enforced]]), on managed devices only (control 2.3).
>
> **Supporting practices.** All changes go through pull request review before merge; direct
> pushes to protected branches are blocked; tenant-isolation tests run as blocking checks on
> every pull request (`tests/invariants/`), which prevents a change that would leak data across
> tenant boundaries from merging.

**Evidence to attach:** CI workflow file; engineering policy stating "no production data in
non-prod"; branch-protection settings screenshot.

**Verified in code:** ephemeral synthetic test database (`.github/workflows/ci.yaml`); blocking
tenant-isolation invariant tests (`tests/invariants/`, `make test-invariants`); credential
scrubbing (`docs/09-security.md` §Layer 4).

---

## 8. Vulnerability Management 2.7 — remediation tracking

> How does your organization track remediation progress of findings identified from
> vulnerability scans and penetration tests?

**What the reviewer wants:** a ticketed workflow with **severity-based SLAs**, a named owner,
and verification by re-scan. Give the numbers.

**Draft answer:**

> Every finding from an automated scan or a penetration test is recorded as an individual
> tracked issue in [[FILL: tracker, e.g. "GitHub Issues with a `security` label" / "Linear"]]
> with: source of the finding, affected component, CVSS severity, assigned owner, and due date.
> Findings are triaged within [[FILL: e.g. "two business days"]] by [[FILL: role]], who confirms
> or rejects (with written justification and compensating controls) each item.
>
> Remediation SLAs by severity:
>
> | Severity | Remediation SLA |
> |---|---|
> | Critical (CVSS 9.0–10.0) | [[FILL: e.g. 7 days]] |
> | High (7.0–8.9) | [[FILL: e.g. 30 days]] |
> | Medium (4.0–6.9) | [[FILL: e.g. 90 days]] |
> | Low (0.1–3.9) | [[FILL: e.g. next release cycle / 180 days]] |
>
> A finding is closed only after the fix is deployed **and** verified by a re-scan or a
> retest that no longer reproduces it; the verification evidence is attached to the ticket.
> Items approaching or breaching SLA are escalated to [[FILL: role]] and reviewed in a
> [[FILL: frequency, e.g. "monthly"]] security review, where open findings, ageing, and SLA
> compliance are reported. Risk acceptance for any finding not remediated within SLA requires
> written approval from [[FILL: role]] with an expiry date and a compensating control.
>
> Scans performed: [[FILL: e.g. "dependency and Go vulnerability scanning on every pull request
> and nightly on the default branch; container image scanning on every release build;
> infrastructure/external port scanning <frequency>; third-party penetration test <frequency,
> last performed <date> by <vendor>>"]].

**Evidence to attach:** screenshot of the security issue board with severities and due dates;
one closed finding showing the verification re-scan; the most recent penetration test report
and its remediation log.

---

## 9. Vulnerability Management 2.7 — code vulnerability remediation

> How does your organization remediate code vulnerabilities identified in the development
> lifecycle and during runtime?

**What the reviewer wants:** named tooling wired into CI, a gate that blocks vulnerable code
from shipping, and a patching cadence for what is already running.

**Draft answer:**

> **In the development lifecycle.** Every change is submitted as a pull request and requires
> review and approval by at least one other engineer before merge; direct pushes to the
> protected `main` and `dev` branches are blocked. Continuous integration runs on every pull
> request and must pass before merge (`.github/workflows/ci.yaml`): compilation for both
> supported database backends, `go vet` static analysis, the full unit test suite with the race
> detector enabled, blocking tenant-isolation invariant tests, and integration tests against a
> real database. Automated security scanning in the same pipeline comprises [[FILL: the tools
> actually enabled — e.g. "`govulncheck` against the Go vulnerability database, GitHub CodeQL
> static analysis, Dependabot alerts and automated dependency-update pull requests, `gosec`,
> Trivy image scanning on release builds"]]. Findings block the merge at [[FILL: e.g. "High and
> above"]]; anything not blocking is filed and tracked under the SLAs in the previous answer.
> Secret scanning with push protection is enabled on the repository, preventing credentials from
> being committed.
>
> The codebase applies secure-coding controls by construction, which are reviewed as part of
> code review: parameterized SQL only (no string-concatenated queries) to prevent injection;
> path canonicalization and workspace-boundary checks on every filesystem operation to prevent
> traversal; SSRF protection with DNS-pinning and private-IP-range blocking on all outbound
> fetches including redirect targets; command execution without a shell, with per-binary
> allow/deny patterns; request size limits, CORS origin allowlisting, and constant-time token
> comparison at the transport layer; credential scrubbing on all output. These are documented in
> `docs/09-security.md` and in `CONTRIBUTING.md`.
>
> **At runtime.** Production runs from immutable container images built by the release
> pipeline. Base images and dependencies are rebuilt and redeployed [[FILL: cadence, e.g.
> "at least monthly, and within the severity SLA for any Critical/High advisory affecting a
> component we ship"]]. Host operating systems receive [[FILL: e.g. "unattended security
> updates, with reboots applied during a weekly maintenance window"]]. Containers run as a
> non-root user with privilege separation, and agent-executed code runs in a hardened Docker
> sandbox (read-only root filesystem, all capabilities dropped, `no-new-privileges`, no network,
> memory/CPU/PID limits). Emergency patches bypass the normal release cadence and follow the
> incident response process. Rollback to the previous image is available if a patch regresses
> service.

**Evidence to attach:** CI workflow file; branch protection settings; screenshot of the
vulnerability scanning job output; Dependabot/CodeQL alert page; a sample dependency-bump PR
merged within SLA.

**Verified in code:** CI gates — dual-backend build, `go vet`, race-enabled tests, blocking
invariant tests (`.github/workflows/ci.yaml`); parameterized SQL rule and tenant-scope guards
(`CLAUDE.md`, `CONTRIBUTING.md`); SSRF/path/shell controls and sandbox hardening
(`docs/09-security.md` §Layer 3, §Layer 5).

---

## Gap register

Items below are **not** currently supported by evidence in this repository. Each must be closed
(or the corresponding claim removed) before submitting the appeal.

| # | Control | Gap | Suggested action |
|---|---|---|---|
| G1 | 2.7 | No vulnerability scanning in CI — no `govulncheck`, CodeQL, `gosec`, or container scan job in `.github/workflows/`. | Add a `security` job running `govulncheck ./...` on every PR plus nightly; enable CodeQL. |
| G2 | 2.7 | No `.github/dependabot.yml` — dependency updates are not automated for Go, pnpm, GitHub Actions, or Docker. | Add Dependabot config for all four ecosystems; enable Dependabot security alerts. |
| G3 | 2.7 | Release images are not scanned. | Add Trivy (or Grype) scanning to the release workflow, failing on High/Critical. |
| G4 | 1.6 | No incident response plan document exists in the repository. | Write `docs/runbooks/incident-response.md` covering the eight steps in answer 5, including the 24-hour Amazon notification. Amazon may request the document. |
| G5 | — | No `SECURITY.md` / vulnerability disclosure contact. | Add `SECURITY.md` with a reporting address and response commitment. |
| G6 | 2.3 | No evidence of MDM, USB restriction, or device-based access control. | This is organizational, not code. Without an MDM the control cannot be claimed truthfully — evaluate Google Workspace endpoint management (likely already available) as the minimum. |
| G7 | 1.4 | No documented password policy artifact. | Export the IdP policy settings and record the numbers in a short policy document. |
| G8 | 2.6 | Logs appear to be local/stdout only; no evidence of centralization, retention, or alert rules. | Ship `security.*` events to a log platform and define at least one alert rule; retention ≥ 90 days. |
| G9 | 1.1 | `security.cors_open` exists because an empty `allowed_origins` allows all origins for backward compatibility. | Set an explicit `allowed_origins` allowlist in production config before submitting; reviewers do check for permissive CORS. |
| G10 | 2.7 | No penetration test on record. | Even a scoped external test, or a documented internal assessment, materially strengthens answers 8 and 9. |

## Submission checklist

- [ ] Every `[[FILL: ...]]` placeholder replaced with a specific, true fact
- [ ] Gaps G1–G10 either closed or the related claim removed from the answers
- [ ] Incident response plan document written and dated
- [ ] Password policy numbers confirmed against the actual IdP settings
- [ ] Evidence files collected per section (screenshots, exports, policy documents)
- [ ] Answers re-read against the Key Security Control Guidance page for wording alignment
- [ ] New case opened via the Solution Provider Portal — **do not reopen case 20883436591**;
      submit updated Solution Provider Profile responses at
      https://solutionproviderportal.amazon.com/developer/register
