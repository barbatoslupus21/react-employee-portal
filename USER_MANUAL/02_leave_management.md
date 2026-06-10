# 2. Leave Management

## Overview

The Leave Management module allows employees to file leave requests, track their leave balances, and follow the approval process. Approvers (Clinic, IAD, Managers, HR) can review and act on leave requests from their respective approval queues.

---

## Leave Filing Process — Block Diagram

```
EMPLOYEE                CLINIC          IAD           MANAGER(S)        HR
   |                      |              |                |               |
   | 1. Fill leave form   |              |                |               |
   |    (type, dates,     |              |                |               |
   |     reason)          |              |                |               |
   |                      |              |                |               |
   | 2. Submit request    |              |                |               |
   |    [Control No.      |              |                |               |
   |     generated]       |              |                |               |
   |         |            |              |                |               |
   |         +----------->| 3. Clinic    |                |               |
   |                      |    reviews   |                |               |
   |                      |    (approve/ |                |               |
   |                      |    disapprov)|                |               |
   |                      |      |       |                |               |
   |                      |      +------>| 4. IAD         |               |
   |                      |              |    reviews     |               |
   |                      |              |    (approve/   |               |
   |                      |              |    disapprov)  |               |
   |                      |              |      |         |               |
   |                      |              |      +-------->| 5. Manager(s) |
   |                      |              |               |    review      |
   |                      |              |               |    (approve/   |
   |                      |              |               |    disapprov)  |
   |                      |              |               |      |         |
   |                      |              |               |      +-------->| 6. HR final
   |                      |              |               |               |    review
   |                      |              |               |               |    (approve/
   |                      |              |               |               |    disapprov)
   |                      |              |               |               |      |
   | 7. Notified of                                                              |
   |    final status <---------------------------------------------------+
   |
```

> **Note:** Approval routing may vary by department and position. Some steps may be skipped based on configured routing rules.

---

## How to File a Leave Request

### Step 1 — Open the Leave Module
Navigate to **Leave** in the sidebar. You will see your leave history and current leave balances at the top.

### Step 2 — Click "File a Leave"
Click the **File Leave** or **New Request** button.

### Step 3 — Fill the Leave Form

| Field | Description |
|-------|-------------|
| **Leave Type** | Select the type (e.g., Sick Leave, Vacation Leave, Emergency Leave) |
| **Date From** | Start date of the leave |
| **Date To** | End date of the leave |
| **Number of Days/Hours** | Auto-calculated or manually entered |
| **Reason** | Select a reason from the dropdown |
| **Sub-reason** | Select a sub-reason if applicable |
| **Remarks** | Optional additional explanation |

### Step 4 — Submit
Click **Submit**. A **control number** (format: `LR-XXXXXX`) is automatically generated and displayed.

### Step 5 — Track Your Request
You can monitor the status of your request in the Leave module under **My Requests**. Each approval step is displayed in sequence.

---

## Leave Request Status Meanings

| Status | Meaning |
|--------|---------|
| **Pending** | Awaiting the current approver's action |
| **Approved** | Request has passed the current step |
| **Disapproved** | Request was rejected at a specific step |
| **Cancelled** | Employee cancelled the request |
| **Completed** | HR has given final approval |

---

## How to Cancel a Leave Request

You may cancel an approved leave request **within 3 days** of HR's final approval.

1. Go to **Leave > My Requests**.
2. Find the request you want to cancel.
3. Click **Cancel Request**.
4. Confirm the cancellation.

> **Important:** After the 3-day cancellation window has passed, you can no longer cancel the request through the system. Contact HR directly.

---

## How to Approve a Leave Request (Approvers Only)

### For Clinic, IAD, Managers, and HR

1. Navigate to **Leave > Pending Approvals** (or your approval queue).
2. Find the leave request assigned to your approval step.
3. Click on the request to view the details.
4. Review:
   - Employee name, department, and position
   - Leave type and dates
   - Reason and sub-reason
   - Previous approval steps
5. Click **Approve** or **Disapprove**.
6. If disapproving, enter a **reason/remark**.
7. Confirm your action.

The employee will receive a notification of your decision.

---

## Leave Balance

Your leave balance is shown at the top of the Leave module. It displays:

- **Leave Type** — The category (e.g., Sick, Vacation)
- **Entitled** — Total days allotted for the period
- **Used** — Days consumed by approved leave requests
- **Remaining** — Available leave days

> Some leave types are **non-deductible** (they do not reduce your balance). Your HR team configures this.

---

## Block Diagram — Leave Balance Deduction

```
Leave Request Filed
        |
        v
  Is Leave Type   ---YES---> Leave Balance NOT deducted
  Non-Deductible?             (Informational only)
        |
       NO
        |
        v
  HR Final Approval
        |
        v
  Leave Balance Deducted
  (Entitled - Days Used = Remaining)
```

---

## Sunday Exemptions

If a leave request spans a Sunday, the system can be configured to **exclude Sundays** from the leave day count. This is managed by HR and applied automatically based on your leave type configuration.

---

## Leave Routing Rules

HR administrators configure routing rules that determine which approvers are required for each leave request. Rules are based on:

- **Employee Position**
- **Employee Department**

If no specific rule matches, the default approval chain is used.
