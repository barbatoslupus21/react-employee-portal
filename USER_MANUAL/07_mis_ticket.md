# 7. MIS Ticket System (IT Support)

## Overview

The MIS (Management Information Systems) Ticket module is the IT helpdesk system. Employees can report hardware, software, and network issues, request assistance, or use the AI chat to get immediate guidance.

---

## Ticket Lifecycle — Block Diagram

```
EMPLOYEE                          MIS/IT TEAM
    |                                  |
    | 1. Submit ticket                 |
    |    (Category, Priority,          |
    |     Description, Device)         |
    |    [Ticket No. generated:        |
    |     TK-YY-NNN]                   |
    |         |                        |
    |         +------------------------> 2. IT team sees
    |                                  |    new ticket
    |                                  |
    |                                  | 3. IT assigns
    |                                  |    technician
    |                                  |    Status: "In Progress"
    |                                  |
    | 4. Employee notified <-----------+
    |    of status change              |
    |                                  | 5. IT diagnoses:
    |                                  |    - Technician notes
    |                                  |    - Parts needed
    |                                  |    - Recommendations
    |                                  |    - Immediate action flag
    |                                  |
    |                                  | 6. Issue resolved
    |                                  |    Status: "Resolved"
    |                                  |
    | 7. Employee acknowledges <-------+
    |    or provides feedback          |
    |                                  | 8. Ticket closed
    |                                  |    Status: "Closed"
```

---

## How to Submit an IT Support Ticket

### Step 1 — Open MIS Ticket
Navigate to **MIS Ticket** in the sidebar.

### Step 2 — Click "New Ticket"
Click the **Create Ticket** or **New Request** button.

### Step 3 — Fill the Ticket Form

| Field | Description |
|-------|-------------|
| **Category** | Type of issue (see categories below) |
| **Priority** | Urgency level |
| **Subject** | Brief title of the issue |
| **Description** | Detailed explanation of the problem |
| **Device** | Select the affected device (if applicable) |

**Categories:**

| Category | Examples |
|----------|---------|
| Hardware | Computer won't turn on, broken keyboard, monitor issues |
| Software | Application crashes, license problems, installation |
| Network | No internet, slow connection, Wi-Fi issues |
| Account/Access | Cannot login, password reset needed |
| Printer/Scanner | Paper jam, driver issues, scanning errors |
| Email | Cannot send/receive email, account setup |
| Request for Parts | Need replacement mouse, cable, etc. |
| Other | Anything not listed above |

**Priority Levels:**

| Priority | When to Use |
|----------|------------|
| Low | Minor inconvenience, workaround exists |
| Medium | Affects work but not blocking everything |
| High | Significantly impacts productivity |
| Critical | Complete work stoppage, data loss risk |

### Step 4 — Submit
Click **Submit**. A **ticket number** in the format `TK-YY-NNN` is generated (e.g., `TK-25-001`).

---

## Tracking Your Ticket

1. Navigate to **MIS Ticket > My Tickets**.
2. View the current status, diagnosis notes, and technician assignments.

**Ticket Statuses:**

| Status | Meaning |
|--------|---------|
| **Open** | Submitted and awaiting assignment |
| **In Progress** | Technician is working on it |
| **Resolved** | Issue has been fixed; awaiting closure |
| **Closed** | Ticket fully completed |

---

## AI Chat Support

The MIS module includes an **AI Chat** feature for immediate assistance before filing a ticket.

### How to Use AI Chat
1. Navigate to **MIS Ticket > Chat Support**.
2. Type your question or describe your issue.
3. The AI assistant will provide:
   - Step-by-step troubleshooting guidance
   - Suggestions for common solutions
   - Option to **create a ticket** directly from the chat if the issue cannot be resolved

> Your chat is a private, one-on-one session. The IT team can review chat history to better understand reported issues.

---

## Device Registry (Admin/MIS)

The MIS team maintains a device registry. Registered devices can be linked to tickets for better tracking.

**Device Types Supported:**
- Desktop Computer
- Laptop
- Printer
- Scanner
- Phone
- Router
- Monitor
- Projector
- UPS (Uninterruptible Power Supply)
- Network Equipment
- Peripheral
- Other

---

## Ticket Diagnosis (MIS Team)

After investigating, the IT technician fills in a diagnosis:
- **Technician Notes** — What was found during investigation
- **Recommendations** — Suggested long-term fix
- **Parts Recommendations** — Components that need replacement
- **Immediate Action Required** — Flag for urgent resolution

This diagnosis is visible to the employee once submitted.
