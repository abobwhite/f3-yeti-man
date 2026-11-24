# Admin entry browser — V1

Status: confirmed product scope from the focused interview; implementation details remain part of the proposed V1 specification. Owned by `entry-capture` for Slack UI and `entry-ledger` for authorized queries/mutations. This is an **implementation priority 5** capability, not a new module or report type.

## Objective and access

BROWSE-01: Designated Yeti Man admins can privately browse their region's retained entries in Slack App Home and open an entry's existing private editor. “Bulk” means viewing/searching many entries and editing **one at a time**; no multi-row selection or shared update operation. Non-admins cannot open or query this browser. Existing PAX permissions to modify an individual entry through other authorized paths remain unchanged.

BROWSE-02: Default to the current configured season using the same region-local season-resolution rules as manual reports, and show the selected season explicitly. Offer each retained past/configured season and **All seasons**. No option queries outside the installed workspace/region. If there is no resolvable default, ask for a season selection rather than inventing a season or silently broadening the query. A season's end date does not hide its entries; historical review is available year-round.

## Filters, sorting and presentation

BROWSE-03: Support an optional configured **AO** filter, optional **PAX** filter using a stable Slack user ID, and both together. With both selected, an entry must reference that AO **and** contain that PAX in its credited attendance. Clearing either removes only that condition; Clear filters restores unrestricted AO/PAX selection within the selected season/status scope. Match IDs rather than display names. Retain inactive AOs and previously credited inactive Slack users as historical filter options; unresolved attendees without stored Slack IDs are warnings, not PAX filter identities. Reject foreign/invalid IDs rather than dropping the filter and returning a broader list.

BROWSE-04: Provide **Active / Archived / All** status selection, defaulting to **Active**. Archived entries remain retained and inspectable, without contributing to competition totals. All-status results clearly label each row; an archive is not a hard delete. Season selection, AO/PAX filters and status conditions combine in one server-side query before sorting/pagination.

BROWSE-05: Sort by the **referenced workout date/start time**, newest first by default, with a visible **Newest first / Oldest first** control. Do not sort by entry creation, latest modification or archive timestamp. Use the stored reference UTC start instant (`workoutReference.startAtUtc`) for chronological order and render date/time in the recorded region/season timezone. Break equal instants deterministically by stable entry ID, in the corresponding direction. Two entries at different AOs with the same start time must not disappear or duplicate across pages.

BROWSE-06: Show a bounded, paginated private list/table containing referenced workout date/time/timezone, AO, temperature, points per PAX, attendance summary, Active/Archived status and season/lock status. Show enough credited-PAX context to identify a record, with a full detail view when a roster is too large for a row. Offer View/Modify, or read-only/Restore controls as allowed by current state. Show active filter/sort values, the selected season/status scope and page context; empty results explain the current filters and offer clearing them. Pagination must provide access to all matching entries, not just a permanently truncated first page.

## Individual editing and retained browser state

BROWSE-07: Modify opens the existing actor-private entry editor, preserving the current browser season, AO/PAX/status filters and sort direction. The Home browser is a non-AO origin: AO can be corrected through the same authorized selectable-AO rule, rather than being fixed because a summary happens to live in an AO channel. Reuse all setup, AO/PAX identity, temperature/scoring/date, future-start, duplicate-key, version and season-lock validations; there is no privileged bypass or separate bulk-write path.

BROWSE-08: On Save or Cancel, return/refresh the browser with its filters and sorting preserved and current committed values. Cancel changes no entry or public summary. Successful Save updates one entry, audit, derived reports and AO-channel summaries through existing providers/outbox. If an edit moves the entry outside the current filters or changes its sort position, explain that it was saved but moved/no longer matches; do not clear filters, show stale values as current or pretend the update failed. Retain page position when its cursor remains valid; otherwise refresh to a valid matching page while retaining the query controls.

BROWSE-09: Locked-season entries remain viewable and **read-only**. Disable Modify/Archive/Restore for them and enforce the lock again on mutation, including stale rows/modals opened before locking. The browser does not unlock a season automatically; existing separate admin season controls remain the only unlock path. Archived entries are inspectable but not ordinarily editable; allow a designated admin to Restore one in an unlocked season using the confirmed confirmation/audit workflow. Per-entry Archive in an unlocked season follows the same protections. Scoring-update fences remain enforced while browsing can still display a complete, clearly labeled published generation.

BROWSE-10: Keep browser state per tenant and admin, not in a shared global Home selection. Recheck current admin status and tenant access on every query, pagination, detail and action. Expired/tampered/foreign cursors fail closed with refresh guidance. Paginate deterministically with a cursor bound to tenant/admin, selected seasons/status, AO/PAX filters, sort direction and last start-instant/entry-ID boundary. Refresh after writes and concurrent changes; do not promise a frozen browser indefinitely or cache away new lock/revocation state. Read-only browsing itself awards no points and changes no entries.

## Provider contract and ownership

The capture module registers the admin Home panel through foundation's existing extension mechanism and calls ledger providers; it never queries the MongoDB entry collection directly. The ledger owns admin authorization, filtering, stable ordering and cursor validation, including all-season and archived access. Reuse entry detail, Save/Archive/Restore and audit contracts.

```text
listAdminEntries(context, {
  season: current | seasonId | all,
  aoId?,
  paxUserId?,
  status: active | archived | all,
  sort: newest | oldest,
  cursor?
}) → AdminEntryPage
openAdminEntryBrowser(context, savedBrowserState?) → PrivateHomeView
```

`AdminEntryPage` contains current matching entry summaries, visible query scope/order, cursor/page information and current eligibility/lock state. Index/query design begins with tenant predicates and supports season/status, AO/PAX and chronological access; use measured query plans rather than loading all entries into the Slack process to filter/sort. Browser state is disposable UI state, not a source of truth or stored authority to edit.

## Acceptance criteria

- BROWSE-A1: Admin Home opens the current-season Active list newest-workout-first; past-season and All seasons selections access the complete matching history through pagination.
- BROWSE-A2: AO-only, PAX-only, combined AO-and-PAX, clearing one/both filters and Active/Archived/All each produce exact expected rows. Renamed labels, historical inactive identities, empty results and foreign IDs are handled without broadening access.
- BROWSE-A3: Reversing sort reverses workout chronology, not creation/modification order. Equal timestamps and multiple AOs remain stable across page boundaries.
- BROWSE-A4: Save/Cancel via a private single-entry editor retains all browser controls. Entries that move position/leave filters show correct feedback, and public summaries change only after commit.
- BROWSE-A5: Locked seasons remain readable but reject all mutations, including lock/role changes during an open edit. Archive/Restore applies to one unlocked entry with the existing audit and duplicate protections.
- BROWSE-A6: A non-admin/foreign-region/tampered-cursor attempt fails; two admins' filter state cannot leak or overwrite each other. Concurrent edits/recalculation preserve version/freshness guarantees.
- BROWSE-A7: No multi-entry update/delete control, new scoring side effect, scheduled-report registry entry or F3 Nation workout mutation is introduced. This complete browser is delivered at priority 5, independent of scheduling priority 6.

## Boundaries

Bulk listing and individual correction are in scope. Multi-entry batch changes, hard deletion, CSV export, cross-region access and bypassing locked seasons remain excluded. Bounded page size and exact Slack table/list layout are implementation choices within the existing accessibility/surface-validation requirements.
