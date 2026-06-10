# 15. System Features & Capabilities

## Overview

This document describes the key features, functions, and security capabilities built into the RepConnect HRMS. It covers what the system can do, how data is protected, and the technical behaviors users and administrators should be aware of.

---

## Table of Contents

1. [Core Functional Features](#1-core-functional-features)
2. [Multi-Level Approval Workflows](#2-multi-level-approval-workflows)
3. [Notification System](#3-notification-system)
4. [Security Features](#4-security-features)
   - 4.1 Authentication & Session Security
   - 4.2 Account Lockout & Brute Force Prevention
   - 4.3 Token Rate Limiting
   - 4.4 CSRF Protection
   - 4.5 Input Validation
   - 4.6 Race Condition Prevention
   - 4.7 Idempotency Keys
   - 4.8 File Upload Security
   - 4.9 SQL Injection Prevention
   - 4.10 XSS Prevention
   - 4.11 HTTP Security Headers
   - 4.12 CORS
   - 4.13 Password Security
   - 4.14 Payslip Data Security
   - 4.15 Sensitive Data Protection
   - 4.16 IP & MAC Address Logging
   - 4.17 Environment & Secrets Management
   - 4.18 System Error Logging & Monitoring
5. [Audit & Activity Logging](#5-audit--activity-logging)
6. [Access Control & Permissions](#6-access-control--permissions)
7. [Data Integrity & Reliability](#7-data-integrity--reliability)
8. [File Management](#8-file-management)
9. [AI-Assisted Support](#9-ai-assisted-support)
10. [System Configuration & Flexibility](#10-system-configuration--flexibility)

---

## 1. Core Functional Features

The system is organized into integrated modules that cover the complete employee lifecycle:

```
+----------------------------------------------------------+
|                  REPCONNECT CORE FUNCTIONS               |
+----------------------------------------------------------+
|                                                          |
|  PEOPLE          OPERATIONS         DEVELOPMENT          |
|  --------        ----------         -----------          |
|  Employee        Leave Mgmt         Training             |
|  Profiles        PRF System         Evaluations          |
|  Directory       Finance            Surveys              |
|  Timelogs        MIS Tickets        Certifications       |
|                  Calendar                                |
|                  Announcements                           |
|                                                          |
+----------------------------------------------------------+
```

### Feature Summary by Module

| Module | Key Functions |
|--------|--------------|
| **Login & Auth** | ID-based login, account lockout, forced password change, avatar management |
| **Employee Profile** | Personal info, work info, address, education, family, skills, emergency contact |
| **Leave Management** | Multi-step approval routing, leave balance tracking, cancellation window, Sunday exemptions |
| **Finance & Payroll** | Payslip delivery by email (regular) / in-system (OJT), loans, allowances, deductions, savings |
| **Training Evaluation** | Survey-based training assessments, multi-step supervisor review, routing rules |
| **Employee Evaluation** | Quarterly performance reviews, task scoring, star ratings, audit timeline |
| **Survey** | Configurable surveys with 11 question types, anonymous mode, template system |
| **MIS Ticket** | IT helpdesk with ticket tracking, AI chat, device registry |
| **PRF** | 22 document/benefit request types with admin approval workflow |
| **Calendar** | Company event calendar with repetition, scope control, event view tracking |
| **Announcements** | Company news feed with media, reactions, and threaded comments |
| **Certifications** | PDF certificate management with "New" badge and view history |
| **Feedback** | Monthly system feedback (1–5 stars) and What's New release notes |
| **Activity Logs** | Immutable audit trail of all actions across the system |
| **Notifications** | In-app real-time notifications for all major events |

---

## 2. Multi-Level Approval Workflows

Several modules use configurable multi-step approval chains. This ensures proper review, accountability, and compliance.

### Leave Approval Flow

```
Employee Submits
      |
      v
[Step 1] Clinic Review -----> Approve/Disapprove
      |
      v
[Step 2] IAD Review ---------> Approve/Disapprove
      |
      v
[Step 3] Manager(s) ---------> Approve/Disapprove
   (1 or more, configurable)
      |
      v
[Step 4] HR Final Approval --> Approve/Disapprove
      |
      v
   COMPLETED
```

### Training Evaluation Flow

```
Employee Submits Evaluation
      |
      v
[Step 1] Supervisor Review
         - Writes result/impact, recommendation, 1-5 rating
         - Can return for re-evaluation
      |
      v
[Step 2] User Confirmation
         - Employee reviews supervisor's feedback
      |
      v
[Step 3] Final Approval (HR/Admin)
      |
      v
[Step 4] Second Final Approval (optional)
      |
      v
   COMPLETED
```

### Employee Evaluation Flow

```
Evaluation Period Opened by Admin
      |
      v
[Step 1] Employee Self-Evaluation
      |
      v
[Step 2] Supervisor Review
         - Task scores, star ratings, written feedback
         - Optional training request
      |
      v
[Step 3] User Confirmation
      |
      v
[Step 4] Final Approval
      |
      v
[Step 5] Second Final Approval (optional)
      |
      v
   COMPLETED (Immutable timeline recorded)
```

### PRF Flow

```
Employee Submits PRF
      |
      v
Admin Reviews
      |
      +----> Approved (with remarks)
      |
      +----> Disapproved (with mandatory remarks)
```

---

## 3. Notification System

The system has a built-in, real-time in-app notification system.

### Events That Trigger Notifications

| Event | Who Gets Notified |
|-------|------------------|
| Leave approved/disapproved at any step | Employee |
| PRF status changed | Employee |
| New certificate uploaded | Employee |
| Training assigned | Employee |
| Training evaluation step completed | Next approver |
| Employee evaluation step completed | Next approver |
| MIS ticket status changed | Employee |
| Finance event (payslip, loan update) | Employee |
| New system update (What's New) | All users |

### Notification Scopes

| Scope | Description |
|-------|-------------|
| **User-specific** | Sent only to the directly affected employee |
| **General** | Sent to all users or a relevant group |

### Notification Behavior
- Unread notifications show a count badge on the bell icon.
- Clicking a notification navigates directly to the related record.
- Read/unread status is tracked per user.

---

## 4. Security Features

RepConnect implements a **defense-in-depth** security architecture — multiple independent layers are stacked so that a bypass of one layer does not compromise the system. The sections below document every security hardening measure present in the application.

---

### 4.1 Authentication & Session Security

#### Login Flow

```
USER SUBMITS CREDENTIALS
        |
        v
   Employee ID + Password checked
        |
        +---> FAIL ---> Increment failed_login_attempts counter
        |                       |
        |               Max attempts reached?
        |                       |
        |               YES --> Account LOCKED (admin must unlock)
        |               NO  --> Return error, allow retry
        |
        +---> PASS ---> Reset failed_login_attempts to 0
                        Issue JWT access token (15 min lifetime)
                        Issue JWT refresh token (7 days lifetime)
                        Both stored in HttpOnly, Secure cookies
                        Redirect to dashboard
```

| Feature | Detail |
|---------|--------|
| **ID-Based Login** | Employees log in with their Employee ID number, not their email — reduces personal data exposure at the login prompt |
| **HttpOnly Cookie Storage** | JWT tokens are stored in HttpOnly cookies, not localStorage — JavaScript cannot read them, preventing XSS-based token theft |
| **Secure Cookie Flag** | Cookies are marked `Secure=True` in production — tokens are never transmitted over plain HTTP |
| **SameSite Cookie Policy** | `SameSite=Strict` (HTTPS) / `SameSite=Lax` (HTTP dev) — limits cross-site cookie sending, mitigating CSRF attempts |
| **Short-Lived Access Token** | Access tokens expire after **15 minutes** — limits exposure window if a token is intercepted |
| **Refresh Token Rotation** | Every time the refresh token is used to get a new access token, the old refresh token is **immediately blacklisted** and a new one is issued |
| **Refresh Token Blacklisting** | Used or revoked refresh tokens are recorded in the blacklist table — replayed tokens are rejected even within their expiry window |
| **Logout Blacklisting** | On logout, the refresh token is explicitly blacklisted — the user's session is fully invalidated server-side |
| **Forced Password Change** | Admins can flag `change_password = True` on any account — the user is forced to set a new password before accessing any module |
| **Inactive Session Expiry** | Inactive sessions expire automatically when the access token lifetime ends with no refresh |

---

### 4.2 Account Lockout & Brute Force Prevention

The system combines two layers to block brute force attacks:

**Layer 1 — Per-Account Failed Attempt Counter**
- Every failed login increments a `failed_login_attempts` counter on the account.
- When the counter reaches the configured maximum (default: 5, configurable 1–20), the account is **locked**.
- A locked account cannot log in regardless of whether the password is correct.
- An admin must manually unlock the account.
- On a successful login, the counter resets to 0.

**Layer 2 — IP + User Rate Limiting**
- Failed attempts are also tracked per (IP address, user) pair with a **15-minute sliding window**.
- This prevents bypassing the per-account lock by creating many test attempts from different accounts on the same IP.

**Configurable Lockout Policy (Admin)**

| Setting | Default | Range |
|---------|---------|-------|
| Max failed login attempts | 5 | 1–20 |
| Account lockout enabled | Yes | On/Off |
| Password expiry days | 90 | 1–3650 days |

---

### 4.3 Token Rate Limiting

In addition to lockout, the system enforces **request rate limits** on sensitive endpoints:

| Endpoint | Limit |
|----------|-------|
| Token refresh | 30 requests / minute |
| AI Chat (MIS) | 20 requests / minute |
| Anonymous API access | 500 requests / hour |
| Authenticated API access | 2,000 requests / hour |

Requests exceeding the limit receive a `429 Too Many Requests` response.

---

### 4.4 CSRF Protection

Cross-Site Request Forgery (CSRF) is blocked at two levels:

**Level 1 — Django CSRF Middleware**
- All non-safe HTTP methods (POST, PUT, PATCH, DELETE) require a valid CSRF token in the request header.
- The CSRF token is set in a browser cookie by the `ensure_csrf_cookie` endpoint on initial page load.
- All state-changing API views are additionally decorated with `@csrf_protect`.

**Level 2 — Cookie-JWT Hybrid Enforcement**
- The custom `CookieJWTAuthentication` class enforces a CSRF check **before** accepting the JWT token for non-safe requests.
- A valid JWT alone is not sufficient — the CSRF token must also be present and match.
- GET, HEAD, and OPTIONS requests are exempt (read-only, no state change).

**CSRF Cookie Settings**

| Setting | Value |
|---------|-------|
| SameSite | `Lax` (HTTP dev) / `Strict` (HTTPS prod) |
| Secure | `True` in production |
| HttpOnly | `False` (browser JavaScript must read and send it in headers) |

---

### 4.5 Input Validation

All user-submitted data passes through multiple layers of validation before being accepted:

**Serializer-Level Field Validation**

| Validation | Applied To |
|------------|-----------|
| `max_length` on all text fields | All text inputs (e.g., username max 150, password max 128) |
| Username character whitelist (`^[\w.@+-]+$`) | Login username field — blocks injection characters |
| No special characters validator (blocks `<>{}[]\|^~"`) | Name and profile text fields |
| Philippine contact number format (`+63` or `0` prefix, 10 digits) | Contact number fields |
| Email format validation (RFC-compliant) | All email fields, including bulk import |
| Regex validators for first/last name fields | Name fields |

**Password Complexity Validation**
All passwords are validated against a configurable `PasswordPolicy`:

| Requirement | Default | Configurable |
|-------------|---------|-------------|
| Minimum length | 8 characters | 6–128 |
| Uppercase letter required | Yes | On/Off |
| Lowercase letter required | Yes | On/Off |
| Digit required | Yes | On/Off |
| Special character required | Yes | On/Off |

**Django Built-in Password Validators (Additional Layer)**

| Validator | What It Blocks |
|-----------|---------------|
| `UserAttributeSimilarityValidator` | Passwords too similar to the employee's username or name |
| `MinimumLengthValidator` | Passwords shorter than the minimum |
| `CommonPasswordValidator` | Known common/breached passwords |
| `NumericPasswordValidator` | All-numeric passwords |

**Model-Level Validation**
Critical data models enforce consistency rules at the database layer through `clean()` methods (e.g., snapshot group counts cannot exceed the total headcount).

---

### 4.6 Race Condition Prevention

Concurrent database operations that could cause data corruption are protected with pessimistic locking and atomic transactions:

| Protection | Where Applied |
|------------|--------------|
| `select_for_update()` row-level locks | Employee status updates, password resets — prevents two requests from modifying the same record simultaneously |
| `@transaction.atomic` view decorator | Admin status view, password reset view — all-or-nothing execution |
| `with transaction.atomic()` block | Bulk employee import — ensures partial imports are fully rolled back on error |
| `transaction.atomic()` on snapshots | Daily employee snapshot creation/update — prevents duplicate or partial snapshots |
| `transaction.on_commit()` for audit logs | Activity log writes are deferred until after the transaction commits — logs are never written for rolled-back operations |

---

### 4.7 Idempotency Keys

Admin operations that must not be executed twice (e.g., locking an account, resetting a password) support an **idempotency key**:

- The client sends a unique `X-Idempotency-Key` header with the request.
- The server caches the key for **60 hours**.
- If the same key is sent again within that window, the server returns the cached response instead of re-executing the operation.
- This prevents duplicate mutations caused by network retries or double-clicks.

---

### 4.8 File Upload Security

All uploaded files are validated before being stored:

| Upload Type | Validations Applied |
|-------------|-------------------|
| **Profile Photo** | File type: JPG/PNG only; image content verified with Pillow (prevents MIME spoofing — a renamed `.exe` won't pass); max size: 2 MB |
| **OJT Payslip PDF** | Extension: `.pdf` only; max size: 5 MB |
| **Certificate PDF** | Extension: `.pdf` |
| **Announcement Media** | Extensions: jpg, jpeg, png, gif, webp, mp4, webm, ogg; MIME type checked against actual file content; max size: 50 MB |
| **Employee Import** | File type: `.xlsx`, `.xls`, or `.csv` only (case-insensitive) |
| **Global Upload Limit** | `DATA_UPLOAD_MAX_MEMORY_SIZE`: 52 MB; `FILE_UPLOAD_MAX_MEMORY_SIZE`: 5 MB — protects against memory exhaustion from oversized uploads |

**MIME Spoofing Prevention**
Profile photos are opened and verified with the **Pillow** image library. If the file content does not match a valid image format (even if the extension says `.jpg`), the upload is rejected.

---

### 4.9 SQL Injection Prevention

The system is entirely protected from SQL injection:

- All database operations use the **Django ORM** (QuerySet API: `filter()`, `exclude()`, `annotate()`, `values()`, etc.).
- The ORM **automatically parameterizes** all user-supplied values — they are never interpolated directly into SQL strings.
- No raw SQL queries (`Manager.raw()` or `cursor.execute()`) exist in any application view or model.
- MySQL **Strict Mode** (`STRICT_TRANS_TABLES`) is enabled — invalid data values are rejected at the database level rather than silently truncated.

---

### 4.10 XSS (Cross-Site Scripting) Prevention

| Measure | Description |
|---------|-------------|
| **API-only backend** | The backend serves only JSON responses — there are no server-rendered HTML templates, eliminating server-side XSS |
| **JSON-only renderer** | DRF is configured with `JSONRenderer` only — no browsable API HTML in production |
| **HttpOnly JWT cookies** | Tokens stored in HttpOnly cookies cannot be accessed by injected JavaScript |
| **Content-Security-Policy** | HTTP response headers restrict which scripts the browser is allowed to execute |
| **SECURE_CONTENT_TYPE_NOSNIFF** | `X-Content-Type-Options: nosniff` header prevents browsers from MIME-sniffing responses into an executable type |
| **Write-only password fields** | All password fields in serializers are `write_only=True` — they are never included in API responses |
| **Admin panel escaping** | Django admin uses `conditional_escape()` for any HTML output |

---

### 4.11 HTTP Security Headers

The following security headers are set on all responses:

| Header | Value | Protection |
|--------|-------|-----------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing attacks |
| `X-Frame-Options` | `DENY` | Prevents clickjacking via iframes |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer URL leakage to other sites |
| `Strict-Transport-Security` (HSTS) | Configurable (production: enabled with subdomain coverage + preload) | Forces HTTPS for all future requests |
| `Cache-Control` | `no-store, private` on all `/api/*` routes | Prevents browsers and proxies from caching sensitive API responses |
| `Pragma` | `no-cache` on all `/api/*` routes | Legacy cache prevention for older clients |

**HSTS Configuration**
- In development: disabled (seconds = 0) to prevent accidental lockout.
- In production: `includeSubDomains=True`, `preload=True` — eligible for browser HSTS preload lists.

---

### 4.12 CORS (Cross-Origin Resource Sharing)

| Setting | Value |
|---------|-------|
| Allowed origins | Whitelist configured via environment variable — only known frontend origins accepted |
| Credentials | `CORS_ALLOW_CREDENTIALS = True` — required for cookie-based JWT to work cross-origin |
| Middleware position | Placed first in middleware stack — CORS headers are evaluated before any authentication |

Requests from unlisted origins receive a CORS error and are blocked by the browser before reaching the API.

---

### 4.13 Password Security

| Measure | Description |
|---------|-------------|
| **PBKDF2 Hashing** | Django uses PBKDF2+SHA256 (salted) for all stored passwords — plain-text passwords are never stored |
| **Write-only password fields** | Password values are never returned in any API response |
| **Admin password reset safety** | Password reset responses return only the employee ID and reset status — the new password is never echoed back |
| **Self-targeting prevention** | Admins cannot lock or reset their own account through the admin panel |
| **Privileged account protection** | Admin, HR, and Accounting accounts cannot be modified via the standard employee admin endpoints |

---

### 4.14 Payslip Data Security

Regular employee payslips are delivered exclusively via email and are **never stored or displayed inside the system**. This ensures that salary information remains inaccessible even if an employee's session or device is compromised.

```
Regular Payslip Delivery:
Accounting prepares payslip
        |
        v
System sends directly to employee's registered email address
        |
        v
Employee receives payslip in their private inbox
(No copy stored in-system; not accessible through any UI or API)
```

OJT payslips (training allowance breakdowns) are stored in-system as they contain non-sensitive training compensation data.

---

### 4.15 Sensitive Data Protection

| Measure | Applied To |
|---------|-----------|
| `write_only=True` on all password fields | Login, password change, password reset serializers |
| Read-only user serializer | The base `UserSerializer` marks all fields `read_only` — no user data can be overwritten via an API response payload |
| Payslips delivered by email | Salary data never stored in-system for regular employees |
| Stack traces hidden from non-admins | System error logs show stack traces only to admin users |

---

### 4.16 IP & MAC Address Logging

Every authenticated request is recorded with network-level identifiers for security investigation:

- **IP Address** — Extracted from `X-Forwarded-For` header in production (behind a reverse proxy), or `REMOTE_ADDR` in development. The forwarded header is only trusted in production to prevent IP spoofing in development.
- **MAC Address** — Captured from a custom request header or derived from the server's network interface where available.

These values are stored in the immutable activity log and are available to administrators for forensic analysis.

---

### 4.17 Environment & Secrets Management

All sensitive configuration values are loaded from environment variables — no credentials, keys, or secrets are hardcoded in the source code.

| Secret | How It's Handled |
|--------|-----------------|
| `SECRET_KEY` | Loaded from environment variable |
| Database credentials | All DB settings (engine, name, user, password, host, port) from environment |
| JWT signing key | From environment |
| CORS allowed origins | From environment |
| SSL/HTTPS settings | From environment (production flags default to secure values) |
| External webhook URLs | From environment; missing value raises `ImproperlyConfigured` at startup |

**Secure defaults** are used for all production security settings:
- `DEBUG` defaults to `True` (safe for dev; explicitly set to `False` in production)
- `JWT_COOKIE_SECURE` defaults to `not DEBUG` (automatically `True` when DEBUG is off)
- `SECURE_HSTS_SECONDS` defaults to `0` (prevents accidental HSTS lockout in dev)

---

### 4.18 System Error Logging & Monitoring

All application errors are captured in a structured, searchable log:

| Error Type | Captured |
|------------|---------|
| 4xx Client Errors | Yes (bad requests, unauthorized, not found) |
| 5xx Server Errors | Yes (exceptions, misconfigurations) |
| Validation Errors | Yes (serializer and model-level) |
| Unhandled Exceptions | Yes, with full stack trace |

Log entries include: error type, HTTP method, endpoint, timestamp, and stack trace. Stack traces are visible only to admin users in the UI — regular users see a generic error message.

**Structured JSON Logging**
All server logs are output as machine-readable JSON. Rotating file handlers keep up to 5 backup files of 10 MB each, ensuring logs do not grow unbounded. Log level and output directory are configurable via environment variables.

---

### Security Architecture Summary

```
REQUEST ARRIVES
      |
      v
+---------------------+
| CORS Check          |  <-- Blocks unknown origins
+---------------------+
      |
      v
+---------------------+
| HTTPS / SSL         |  <-- Encrypts transit (production)
+---------------------+
      |
      v
+---------------------+
| Security Headers    |  <-- HSTS, X-Frame, MIME sniff, cache
+---------------------+
      |
      v
+---------------------+
| Rate Limiting       |  <-- Throttles brute force & spam
+---------------------+
      |
      v
+---------------------+
| CSRF Check          |  <-- Blocks cross-site mutations
+---------------------+
      |
      v
+---------------------+
| JWT Authentication  |  <-- HttpOnly cookie, rotation, blacklist
+---------------------+
      |
      v
+---------------------+
| Permission Check    |  <-- Role flags, object ownership
+---------------------+
      |
      v
+---------------------+
| Input Validation    |  <-- Serializer, regex, file type/size
+---------------------+
      |
      v
+---------------------+
| ORM / Transactions  |  <-- Parameterized SQL, atomic ops, locks
+---------------------+
      |
      v
+---------------------+
| Audit Log           |  <-- Immutable, IP+MAC, on_commit only
+---------------------+
      |
      v
  RESPONSE RETURNED
```

---

## 5. Audit & Activity Logging

### Immutable Activity Log

Every action taken by an authenticated user is recorded in an **append-only activity log**. These records cannot be modified or deleted.

Each log entry captures:

| Field | Description |
|-------|-------------|
| **User** | Who performed the action |
| **Module** | Which part of the system was used |
| **Action** | What was done (create, update, approve, delete, etc.) |
| **HTTP Method** | GET, POST, PUT, DELETE |
| **Endpoint** | The specific API route called |
| **IP Address** | Network address of the user's device |
| **MAC Address** | Hardware address (where available) |
| **Timestamp** | Exact date and time of the action |

### Evaluation Timeline (Append-Only)

Employee evaluations have a dedicated **Timeline** tab that records every status change, approval, and confirmation with the actor and timestamp. This timeline is read-only and serves as the official record of the evaluation process.

### Use Cases for Audit Logs

- Investigating unauthorized access attempts
- Tracing who approved or modified a record
- Compliance and HR audit requirements
- Resolving disputes about actions taken in the system

---

## 6. Access Control & Permissions

The system uses a flat permission flag model. Each user can be assigned one or more roles simultaneously.

### Role Definitions

| Role Flag | Module Access |
|-----------|--------------|
| **admin** | Full system access — all modules, configuration, and data management |
| **hr** | Employee management, leave configuration, evaluation management, payroll |
| **hr_manager** | Senior HR access; acts as an additional approval layer |
| **clinic** | Leave approval (Clinic step) |
| **iad** | Leave approval (IAD step) |
| **accounting** | Finance and payroll records |
| **mis** | MIS ticket management and resolution |
| **news** | Create and publish announcements |

### Permission Behavior

```
User logs in
      |
      v
System loads permission flags for this user
      |
      v
Each page/action checks: "Does this user have the required flag?"
      |
      +---> YES: Action allowed, data returned
      |
      +---> NO:  Action blocked, 403 Forbidden response
```

- Employees with **no special flags** have standard access (view own data, file leave/PRF, submit evaluations).
- Permission flags are assigned and managed by the **admin** role only.
- A user can hold multiple roles (e.g., an employee can also be a supervisor with the `hr_manager` flag).

---

## 7. Data Integrity & Reliability

### Control Number Generation

All major transactions are assigned unique, system-generated control numbers:

| Module | Format | Example |
|--------|--------|---------|
| Leave Request | `LR-XXXXXX` | LR-000123 |
| PRF Request | `PR-XXXXXX` | PR-000456 |
| MIS Ticket | `TK-YY-NNN` | TK-25-001 |

Control numbers are auto-generated, sequential, and cannot be manually edited.

### Daily Employee Snapshots

The system takes a daily snapshot of the employee headcount, preserving:
- Total number of employees
- Regular employee count
- Probationary employee count
- OJT trainee count
- Male/female breakdown

These snapshots ensure historical accuracy even as employees are added or removed.

### Soft Deletion / Data Preservation

When related records are removed, foreign key references are preserved using **set null** behavior rather than cascading deletion. This prevents accidental loss of historical records (e.g., a deleted position does not erase historical work information tied to it).

### Singleton Settings

Modules like Evaluation Settings, Feedback Settings, and Update Settings use a **singleton pattern** — only one configuration record exists for the entire system. This ensures consistent, system-wide configuration.

---

## 8. File Management

### Supported File Types

| Feature | File Type | Size Limit |
|---------|-----------|-----------|
| Profile Photo | JPG, PNG | Standard image size |
| Certificate | PDF | No explicit limit |
| Payslip (OJT) | PDF | 5 MB maximum |
| Announcement Media | Images (JPG, PNG, GIF), Videos | Browser-reasonable size |

### File Storage

Uploaded files are stored on the server. File names are tracked internally, and the original filename is preserved for reference. Certificates record both the stored file name and the original upload name.

---

## 9. AI-Assisted Support

The MIS Ticket module includes an **AI Chat** feature that provides:

### Capabilities
- Answers common IT questions immediately (no wait for a technician)
- Guides users through step-by-step troubleshooting
- Suggests solutions for hardware, software, and network issues
- Allows users to **escalate to a formal ticket** directly from the chat if the issue cannot be resolved

### How It Works

```
Employee opens Chat Support
      |
      v
Types question or describes problem
      |
      v
AI responds with guidance
      |
      +---> Issue resolved? --> YES --> No ticket needed
      |
      +---> Issue not resolved?
                  |
                  v
            "Create a Ticket" option shown
                  |
                  v
            Ticket auto-created from chat context
```

### Privacy
Each employee has a **private, one-on-one chat session**. Chats are not visible to other employees. The MIS/IT team can review chat history to better understand reported issues.

---

## 10. System Configuration & Flexibility

Administrators can configure many system behaviors without code changes:

### Leave Configuration
- Define new **Leave Types** (name, deductibility, default entitlement)
- Set up **Leave Reasons and Sub-reasons**
- Configure **Routing Rules** per position/department (which approvers are required)
- Add **Sunday Exemptions** for specific leave types

### Finance Configuration
- Create **Allowance Types** (replace-on-upload vs. cumulative)
- Define **Loan Types** (stackable or non-stackable)
- Configure **Savings Types**
- Set **Payslip Types** (Regular, 13th Month, etc.)
- Define **per-office financial rates** (overtime, night differential, holiday pay, OJT rates)
- Set **loan deduction frequencies** (per cut-off, monthly, quarterly, yearly)

### Evaluation Configuration
- Set **evaluation frequency** (quarterly or monthly)
- Define **fiscal year start month**
- Assign **task lists per employee**

### Training Configuration
- Create **Survey Templates** (reusable question sets for training evaluations)
- Configure **routing rules** for supervisor assignment (by position/department, up to 3 steps)

### Survey Configuration
- Build **survey templates** with any combination of 11 question types
- Set surveys as **anonymous** or attributed
- Target **all employees** or **specific individuals**

### General Settings
- Manage **Shifts** (name, start/end time)
- Manage **Offices** with assigned shifts
- Manage **Departments**, **Lines**, **Positions**, and **Employment Types**

### Feedback & Updates
- **Enable or disable** the feedback modal globally
- Publish **What's New** version notes to announce updates

---

## Feature Interaction Map

```
+----------------+     files leave      +------------------+
|   EMPLOYEE     |-------------------->  | LEAVE MODULE     |
|                |     submits PRF       +------------------+
|                |-------------------->  | PRF MODULE       |
|                |     opens ticket      +------------------+
|                |-------------------->  | MIS TICKET       |
|                |     completes survey  +------------------+
|                |-------------------->  | SURVEY MODULE    |
|                |     views calendar    +------------------+
|                |-------------------->  | CALENDAR         |
+----------------+                       +------------------+
        |                                        |
        | All actions                            |
        v                                        v
+------------------+                   +------------------+
| ACTIVITY LOG     |                   | NOTIFICATIONS    |
| (Immutable)      |                   | (Real-time)      |
+------------------+                   +------------------+
        |
        v
+------------------+
| ADMIN / HR       |
| REVIEW           |
+------------------+
```
