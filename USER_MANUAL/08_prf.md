# 8. Personnel Request Forms (PRF)

## Overview

The PRF (Personnel Request Form) module allows employees to request official documents, process government and bank transactions, and apply for company-provided financial benefits such as emergency loans and medicine allowances.

---

## PRF Workflow — Block Diagram

```
EMPLOYEE                              ADMIN/HR
    |                                     |
    | 1. Select PRF type                  |
    |    (Government / Banking /          |
    |     HR & Payroll)                   |
    |                                     |
    | 2. Fill the form                    |
    |    (details depend on type)         |
    |                                     |
    | 3. Submit                           |
    |    [Control No. generated:          |
    |     PR-XXXXXX]                      |
    |         |                           |
    |         +---------------------------> 4. Admin reviews
    |                                     |    the request
    |                                     |
    |                                     | 5. Admin action:
    |                                     |    Approve / Disapprove
    |                                     |    (with remarks)
    |                                     |
    | 6. Employee notified <--------------+
    |    of status
    |
    | 7. If cancelled (before processing):
    |    Employee cancels own request
```

---

## PRF Categories & Types

### Government Documents
| Type | Description |
|------|-------------|
| PAG-IBIG Loan | Housing/multi-purpose fund loan request |
| SSS Sickness Benefit | SSS sick pay claim |
| SSS Maternity Benefit | SSS maternity leave pay claim |
| SSS Disability Benefit | Disability benefit claim |
| SSS Retirement Benefit | Retirement claim |
| BIR 2316 | Certificate of Compensation |
| BIR 1902 | Employee registration form |
| PHILHEALTH | Philhealth membership/benefit requests |

### Banking & Finance
| Type | Description |
|------|-------------|
| RCBC Bank | RCBC account-related requests |
| Bank Deposit Slip | Request for deposit processing |

### HR & Payroll
| Type | Description |
|------|-------------|
| Payroll Adjustment | Corrections to pay computations |
| ID Replacement | Request for replacement company ID |
| Certificate of Employment | Official employment certification |
| Certificate of Employment with Compensation | Employment + salary certification |
| Service Record | Record of employment service |
| Clearance | Pre-departure/resignation clearance |
| Emergency Loan | Company emergency financial assistance |
| Educational Loan | Company support for educational expenses |
| Medical Loan | Company support for medical expenses |
| Cooperative Loan | Cooperative loan facilitation |
| Medicine Allowance | Medicine reimbursement request |
| Uniform | Uniform request or replacement |
| Others | Any other HR-related request |

---

## How to File a PRF

### Step 1 — Open PRF Module
Navigate to **PR Form** in the sidebar.

### Step 2 — Click "New Request"
Click the **File Request** or **New PRF** button.

### Step 3 — Select Category and Type
1. Choose the category (Government, Banking/Finance, HR & Payroll).
2. Select the specific PRF type.

### Step 4 — Fill the Form
Provide all required information. Fields vary by PRF type.

**For Emergency Loan:**

| Field | Description |
|-------|-------------|
| Loan Amount | Choose from predefined amounts (₱2,000 – ₱5,000) |
| Deduction Cut-off | When to start the salary deduction |
| Reason | Brief reason for the emergency loan |

**For Medicine Allowance:**

| Field | Description |
|-------|-------------|
| Coverage Start Date | Start of coverage period |
| Coverage End Date | End of coverage period |
| Details | Description of medicine/illness |

### Step 5 — Submit
Click **Submit**. A **control number** (format: `PR-XXXXXX`) is assigned to your request.

---

## Tracking Your PRF

1. Navigate to **PR Form > My Requests**.
2. View the status and any admin remarks.

**PRF Statuses:**

| Status | Meaning |
|--------|---------|
| **Pending** | Submitted and awaiting admin review |
| **Approved** | Request has been processed and approved |
| **Disapproved** | Request was denied (see admin remarks) |
| **Cancelled** | Request was cancelled by the employee |

---

## How to Cancel a PRF

You can cancel a PRF request while it is still **Pending**.

1. Go to **PR Form > My Requests**.
2. Find the pending request.
3. Click **Cancel**.
4. Confirm the cancellation.

> Once a request has been Approved or Disapproved, it cannot be cancelled.

---

## Admin PRF Processing

Administrators review all pending PRFs from the admin panel:

1. Go to **Admin > PR Form Management**.
2. Find the pending request.
3. Review the request details.
4. Click **Approve** or **Disapprove**.
5. Add **Admin Remarks** — especially required when disapproving.
6. Save.

The employee receives a notification of the outcome.
