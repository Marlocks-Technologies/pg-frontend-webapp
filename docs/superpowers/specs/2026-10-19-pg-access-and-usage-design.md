# PG access and usage design

## Purpose

P&G Legal AI is an internal research tool for at most ten provisioned people. An administrator controls invitations and can inspect current activity and AI usage. A regular user can ask questions and run deep research without changing the shared document corpus.

This design spans `pg-frontend-webapp` and `pg-serverless-rag`. It is implemented in two ordered phases: access and roles, then session and usage reporting. Phase two depends on authenticated user identity from phase one.

## Decisions

- The cap is ten enabled, provisioned accounts in production, not ten simultaneous connections. Disabled accounts release a slot; outstanding invitations occupy one.
- At most two enabled accounts have the `admin` role. Every enabled account has exactly one role: `admin`, `document_manager`, or `regular_user`.
- Cognito self-registration is disabled. Only the admin user-management API creates and changes accounts. The first admin is bootstrapped with an operator-only command after deployment; no email address is embedded in source control.
- The sign-in page follows the existing Raleway, charcoal and off-white design. Cognito handles password credentials and recovery. The app never stores passwords.
- Authentication applies to every production REST operation except health and CORS preflight, every WebSocket connection and message, and the Next.js research proxy. A browser route guard is for navigation; API authorization is the security boundary.
- Raw questions are visible only to admins in the dashboard. They are retained for 30 days. Session and token totals are retained for 90 days.

## Roles and permissions

| Capability | Regular user | Document manager | Admin |
| --- | --- | --- | --- |
| Sign in, ask questions, search, deep research, view own history and citations | Yes | Yes | Yes |
| View and download source documents or generated answers | Yes | Yes | Yes |
| Upload, capture, and delete corpus documents | No | Yes | Yes |
| Create or change accounts and roles | No | No | Yes |
| View activity, questions, and token usage across users | No | No | Yes |

Document generation from an answer is allowed for all roles because it does not alter the shared corpus. Document listings remain readable so users can verify cited sources; write controls are hidden for regular users and enforced by the API.

## Phase 1: identity and enforcement

Terraform provisions a Cognito user pool in `eu-west-1`, a public app client, and three groups. Sign-in uses Cognito's authorization-code flow with PKCE. The frontend receives a secure server session and routes authenticated API calls with the user's access token. Sign-out clears the app session and asks Cognito to revoke refresh credentials. No public signup route exists.

A small account registry in DynamoDB stores the canonical role and enabled state. Account creation, disable, and role changes use conditional or transactional writes so concurrent admin actions cannot exceed ten enabled accounts or two admins. Cognito creation/group changes are reconciled if the second system fails; the registry fails closed until reconciliation. Admin creation never trusts a role supplied by a browser without checking the caller's current registry state.

REST API Gateway verifies Cognito tokens. Lambda checks the registry role and the requested operation. WebSocket `$connect` uses a Lambda authorizer; chat messages recheck the identity and account state. The existing deep-research API key remains server-only and is required in addition to user authentication.

Chat sessions and research jobs gain an owner Cognito `sub`. Every request using a session or job ID verifies ownership. Existing unowned history is unavailable through the new authenticated API until explicitly migrated to an owner. Browser chat storage is namespaced by user so shared devices cannot show another person's local history.

The UI provides `/sign-in`, account recovery, sign-out, role-aware navigation, and clear access-denied states. The admin area includes account invitations, role changes, and disabling accounts. The regular user has no corpus mutation controls.

## Phase 2: activity and usage

The app records a login session at successful sign-in, sends a heartbeat while the app is in use, and records explicit sign-out. A session is *active* when its last heartbeat is within two minutes and it has no end time. Distinct active users are counted separately from active browser sessions. Login time, last activity, and elapsed duration are displayed in UTC with local-time formatting in the browser. Abrupt tab closure is represented by the last heartbeat, so duration and active status are estimates.

Authenticated chat, search, research, and document-generation requests write a usage event with user ID, app session ID, event time, request type, question when applicable, and input/output token counts when the model returns them. Missing model usage is stored as `unknown`, not zero. Research worker usage is attributed to the submitting user. Duplicate retries use an idempotency key to avoid double counting.

An admin-only API returns current session summaries, per-user totals, and paginated question events. The dashboard shows active users and sessions, login and last activity times, session duration, question history, and input/output/total tokens. It labels partial usage coverage where an upstream operation does not expose token counts. Raw questions expire after 30 days; aggregate usage and sessions expire after 90 days.

## Failure and security behavior

- Unauthenticated requests return 401; authenticated requests without permission return 403. Disabled users are denied even while a previously issued JWT remains within its expiry.
- Account creation fails with a clear capacity error at ten accounts or two admins. A failed Cognito call releases any reserved slot.
- API and WebSocket requests never trust a client-provided user ID or role.
- An admin cannot disable or demote the last enabled admin. A user cannot read another user's chat session or research job by guessing its ID.
- Admin endpoints do not expose refresh tokens, API keys, passwords, or full model prompts beyond the user question.
- Health remains public; CORS preflight remains open but grants no data access.

## Verification

Tests cover concurrent account-limit checks, role permissions at API boundaries, session/job ownership, frontend route and control visibility, login/logout flows, heartbeat active-state calculation, token attribution and deduplication, and admin-only dashboard responses. Terraform validation, frontend type checking/build, backend test suite, and targeted smoke checks precede deployment. Production deployment requires a plan review, an initial admin email supplied outside source control, and verification that unauthenticated direct API and WebSocket calls are rejected.
