# 5. Employee Evaluation (Performance Review)

## Overview

The Employee Evaluation module handles quarterly performance reviews. Employees complete a self-evaluation based on their assigned task lists, while supervisors provide scores and qualitative feedback across multiple categories. The process follows a structured multi-step approval flow.

---

## Evaluation Workflow — Block Diagram

```
HR/ADMIN               EMPLOYEE            SUPERVISOR           FINAL APPROVER
    |                      |                    |                     |
    | 1. Create            |                    |                     |
    |    Evaluation Period |                    |                     |
    |    (Fiscal Year,     |                    |                     |
    |     Quarter)         |                    |                     |
    |         |            |                    |                     |
    |         +----------->| 2. Employee        |                     |
    |                      |    reviews task    |                     |
    |                      |    list and fills  |                     |
    |                      |    self-evaluation |                     |
    |                      |         |          |                     |
    |                      |         +--------->| 3. Supervisor fills |
    |                      |                    |    quarterly scores:|
    |                      |                    |    - Task scores    |
    |                      |                    |    - Star ratings   |
    |                      |                    |      (5 categories) |
    |                      |                    |    - Comments &     |
    |                      |                    |      feedback       |
    |                      |                    |         |           |
    |                      | 4. Employee        |         |           |
    |                      |    confirms <------+         |           |
    |                      |    feedback        |         |           |
    |                      |         |          |         |           |
    |                      |         +--------->|         +---------->| 5. Final
    |                      |                    |                     |    Approval
    |                      |                    |                     |    (+ optional
    |                      |                    |                     |    2nd final)
    |                      |                    |                     |      |
    | 6. Evaluation                                                          |
    |    Completed <---------------------------------------------------------+
```

---

## Fiscal Year & Quarters

The evaluation system follows a **May–April fiscal year**:

| Quarter | Months Covered |
|---------|---------------|
| Q1 | May, June, July |
| Q2 | August, September, October |
| Q3 | November, December, January |
| Q4 | February, March, April |

---

## How to Complete Your Self-Evaluation (Employee)

### Step 1 — Open the Evaluation
1. Navigate to **Assessments > Employee Evaluation**.
2. Find your active evaluation period with status **Pending**.
3. Click **Start Evaluation**.

### Step 2 — Review Your Task List
Your task list has been pre-assigned by HR or your supervisor. You will see your assigned tasks for the quarter.

### Step 3 — Submit
After reviewing, click **Submit** to send to your supervisor for scoring.

> You cannot modify your submission after it is sent.

---

## Supervisor Scoring (Supervisor)

After the employee submits, the supervisor fills in:

### Task Scores
Each task on the employee's task list receives a **decimal score** per quarter.

### Star Ratings (per quarter)
The supervisor rates the employee 1–5 stars in five behavioral categories:

| Category | Description |
|----------|-------------|
| **Cost Consciousness** | Mindfulness of company resources and costs |
| **Dependability** | Reliability and consistency in work |
| **Communication** | Clarity and effectiveness of communication |
| **Work Ethics** | Professionalism and integrity |
| **Attendance** | Punctuality and attendance record |

### Qualitative Feedback (per quarter)

| Field | Description |
|-------|-------------|
| **Strengths** | What the employee does well |
| **Weaknesses** | Areas that need improvement |
| **Training Required** | Recommended training or development |
| **Comments** | Supervisor's general remarks |
| **Employee Comments** | Space for the employee's own comments |

### Training Request (Optional)
The supervisor can request a training for the employee for a specific quarter by providing:
- Training objective
- Preferred date

---

## Evaluation Statuses

| Status | Meaning |
|--------|---------|
| **Pending** | Waiting for employee to start/submit |
| **Supervisor Review** | Supervisor is filling in scores |
| **User Confirmation** | Employee is reviewing supervisor's feedback |
| **Pending Final Approval** | Under final review |
| **Pending 2nd Final Approval** | Under second review |
| **Completed** | Fully approved |
| **Disapproved** | Rejected; may be returned for revision |

---

## How to Confirm Your Evaluation Feedback (Employee)

1. You will receive a notification when your supervisor completes their review.
2. Navigate to **Assessments > Employee Evaluation**.
3. Open the evaluation in **User Confirmation** status.
4. Review:
   - Your task scores per quarter
   - Star ratings in all five categories
   - Written feedback (strengths, weaknesses, comments)
5. Click **Confirm** to acknowledge and send to final approval.

---

## Timeline / Audit Log

Every evaluation has a **Timeline** tab that shows a timestamped history of all actions:
- When it was submitted
- When each approval step occurred
- Who took each action

This log is **read-only** and cannot be modified.

---

## Evaluation Settings (Admin)

Administrators configure:
- **Evaluation Frequency** — Quarterly or Monthly
- **Fiscal Year Start** — Default is May

These settings apply globally to all evaluations.
