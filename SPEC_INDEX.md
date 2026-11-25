# Spec index

Select by task/requirement ID, then read only the relevant sections. This is a routing map, not a replacement for acceptance criteria. Module specs inherit the common contract. Current commands are in [AGENTS.md](AGENTS.md) and `package.json`.

| Spec file | Read for |
|---|---|
| [README](docs/spec/README.md) | Product overview, terminology, priorities and end-to-end acceptance walkthrough. |
| [Capability map](docs/spec/capability-map.md) | Five module boundaries, ownership and provider dependency direction. |
| [Implementation tasks](docs/spec/implementation-tasks.md) | 54 implementation task links (including split IDs), checkpoints, direct blockers and requirement mapping. |
| [Implementation priorities](docs/spec/implementation-priorities.md) | Six delivery priorities and permitted prerequisite work. |
| [Common contract](docs/spec/SPEC-common.md) | Shared engineering, persistence, validation, security and quality contracts (`COMMON-*`). |
| [Workspace foundation](docs/spec/SPEC-workspace-foundation.md) | Tenant authorization, installation, setup, AOs, database and durable runtime (`FOUND-*`). |
| [Configuration contract](docs/spec/configuration-contract.md) | Required setup, season/scoring settings and automatic-reply configuration (`CONFIG-*`). |
| [Entry ledger](docs/spec/SPEC-entry-ledger.md) | Entry identity, scoring, saves, duplicates, audit and season fences (`LEDGER-*`). |
| [Entry capture](docs/spec/SPEC-entry-capture.md) | Private manual/Modify editors, inline capture, retries and saved summaries (`CAPTURE-*`). |
| [Admin entry browser](docs/spec/admin-entry-browser.md) | Priority-5 admin listing, filters, sorting, private edits and locked-season viewing. |
| [F3 Slack ingestion](docs/spec/SPEC-f3-ingestion.md) | Preblast/Backblast parsing, matching, provenance and capture triggers (`INGEST-*`). |
| [Reporting](docs/spec/SPEC-reporting.md) | Points/cold-entry rankings, AO/personal reports, sharing and report providers (`REPORT-*`). |
| [Automated reports](docs/spec/automated-reports.md) | Priority-6 report definitions, recurrence, delivery and season cutoff. |
| [Deployment options](docs/spec/deployment-options.md) | DigitalOcean direction, budget, deployment, recovery and retention requirements. |
| [Decisions and open questions](docs/spec/decisions-and-open-questions.md) | Decision rationale, confirmed overrides and unresolved prerequisites. |
| [Source evidence](docs/spec/source-evidence.md) | External constraints and original sample evidence; load when validating an assumption. |

For execution sequencing only, consult the relevant section of [tasks/plan.md](tasks/plan.md). GitHub issue bodies hold detailed task acceptance criteria and verification steps; the local index provides direct links.

Example bounded lookup from the repo root:

```sh
rg -n '^### T11$|^### T12$' docs/spec/implementation-tasks.md
rg -n 'LEDGER-06|LEDGER-07|LEDGER-09|CAPTURE-14' docs/spec/SPEC-entry-ledger.md docs/spec/SPEC-entry-capture.md
```

Read surrounding paragraphs and linked contracts as needed; search matches alone are not the complete requirement.
