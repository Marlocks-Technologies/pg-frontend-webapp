# PG Usage Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins reliable visibility into app sessions, questions, and available AI token usage.

**Architecture:** Authenticated app heartbeats update session records. Backend request and worker paths write idempotent usage events. Admin-only read endpoints aggregate summaries for a dedicated dashboard.

**Tech Stack:** Next.js 15, Python Lambda, DynamoDB, Bedrock usage metadata, Terraform.

**Spec:** `../specs/2026-10-19-pg-access-and-usage-design.md`

## Global Constraints

- Active means last heartbeat within two minutes and no explicit end time.
- Distinct active users and active sessions are separate measures.
- Raw questions expire after 30 days; session and aggregate usage after 90 days.
- Unknown token usage is shown as unknown, not zero.
- All cross-user data endpoints are admin-only.

## Review Focus

- Browser closure without sign-out should age a session out of active status.
- Multiple tabs for one login should not inflate distinct-user count.
- Research worker retries should not double-count tokens.
- Missing upstream token metadata should not appear as zero usage.
- Pagination must not drop or duplicate question events.

---

### Task 1: Session and usage stores

**Files:** Create backend session/usage stores and tests; add DynamoDB tables with TTL and read indexes.

**Interfaces:** `start_session`, `heartbeat`, `end_session`, `record_usage`, `list_active`, `list_questions`, `totals_by_user`.

- [ ] Write failing tests for activity cutoff, distinct counts, expiry, deduplication, unknown tokens, and pagination.
- [ ] Run tests and confirm expected failures.
- [ ] Implement conditional/idempotent writes and bounded reads.
- [ ] Run focused and full backend tests; validate Terraform.
- [ ] Commit the deliverable.

### Task 2: Instrument app and model paths

**Files:** Modify sign-in callback/sign-out, heartbeat route, chat/research/document handlers, and research worker.

**Interfaces:** Every event carries authenticated `sub`, app session ID, request ID, event type, timestamps, and token counts where available.

- [ ] Write failing tests for login, heartbeat, logout, question capture, and worker attribution.
- [ ] Run tests and confirm expected failures.
- [ ] Instrument paths, preserving unknown token status.
- [ ] Run frontend and backend suites.
- [ ] Commit the deliverable.

### Task 3: Admin API and dashboard

**Files:** Create admin summary/questions endpoints and `/admin` dashboard; add UI tests.

**Interfaces:** Admin API returns active users/sessions, per-user durations, question pages, and input/output/total token summaries with coverage labels.

- [ ] Write failing tests for admin-only access, active counts, duration, token totals, and question pagination.
- [ ] Run tests and confirm expected failures.
- [ ] Implement API, dashboard, and time formatting.
- [ ] Run frontend tests, type check, build, and backend suite.
- [ ] Commit and deploy; verify live authenticated dashboard and direct non-admin denial.
