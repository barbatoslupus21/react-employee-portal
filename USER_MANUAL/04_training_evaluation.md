# 4. Training & Evaluation

## Overview

The Training module manages company-wide training programs. After attending a training, employees complete an evaluation form. The submission then goes through a multi-step approval workflow involving supervisors and HR.

---

## Training Workflow — Block Diagram

```
ADMIN/HR                   EMPLOYEE              SUPERVISOR            HR/FINAL
    |                          |                     |                    |
    | 1. Create training       |                     |                    |
    |    (Title, Date,         |                     |                    |
    |     Speaker, Survey)     |                     |                    |
    |    Set participants      |                     |                    |
    |         |                |                     |                    |
    |         +--------------->| 2. Employee receives|                    |
    |                          |    notification     |                    |
    |                          |                     |                    |
    |                          | 3. Employee fills   |                    |
    |                          |    out evaluation   |                    |
    |                          |    form (survey     |                    |
    |                          |    questions)       |                    |
    |                          |         |           |                    |
    |                          |         +---------->| 4. Supervisor      |
    |                          |                     |    writes:         |
    |                          |                     |    - Result/Impact |
    |                          |                     |    - Recommendation|
    |                          |                     |    - Assessment    |
    |                          |                     |    (1-5 rating)    |
    |                          |                     |         |          |
    |                          | 5. Employee confirms|         |          |
    |                          | <-------------------+         |          |
    |                          |    (reviews super-  |         |          |
    |                          |     visor feedback) |         |          |
    |                          |         |           |         |          |
    |                          |         +---------->|         +--------->|
    |                          |                     |                    | 6. Final
    |                          |                     |                    |    Approval
    |                          |                     |                    |    (+ optional
    |                          |                     |                    |    2nd Final)
    |                          |                     |                    |      |
    | 7. Training record                                                         |
    |    completed <---------------------------------------------------------+  |
```

---

## How to Submit a Training Evaluation (Employee)

### Step 1 — Find Your Training
1. Navigate to **Assessments > Training**.
2. You will see a list of trainings you have been assigned to.
3. Find the training with status **Pending Submission**.

### Step 2 — Open the Evaluation Form
Click the training title or the **Submit Evaluation** button.

### Step 3 — Answer the Questions
The form contains questions from the training's survey template. Question types include:
- Multiple choice / Single choice
- Rating scales
- Short and long text answers
- Yes/No questions

### Step 4 — Submit
Once all required questions are answered, click **Submit**. Your submission goes to your supervisor for review.

> **Note:** You cannot edit the submission after it has been submitted.

---

## How to Evaluate an Employee's Training (Supervisor)

1. Navigate to **Assessments > Training Approvals** or check your notification.
2. Find the pending evaluation in your queue.
3. Review the employee's answers.
4. Fill in the **Supervisor Evaluation** form:
   - **Result / Impact** — Describe the outcome of the training
   - **Recommendation** — Suggestions for the employee
   - **Overall Assessment** — Score from 1 (poor) to 5 (excellent)
5. Click **Submit Evaluation**.

If you need the employee to redo or supplement their evaluation, you can click **Return for Re-evaluation** and provide a reason.

---

## Training Submission Statuses

| Status | Meaning |
|--------|---------|
| **Pending Submission** | Employee has not yet submitted the evaluation |
| **Submitted** | Employee submitted; awaiting supervisor review |
| **Supervisor Review** | Supervisor is reviewing the submission |
| **User Confirmation** | Employee is reviewing supervisor's feedback |
| **Pending Final Approval** | HR/admin is reviewing |
| **Pending 2nd Final Approval** | Second approver is reviewing |
| **Completed** | Fully approved and closed |
| **Disapproved** | Rejected at some point in the process |

---

## How to Confirm Supervisor Feedback (Employee)

After your supervisor submits their evaluation, you may be asked to confirm that you have reviewed it.

1. You will receive a notification.
2. Go to **Assessments > Training**.
3. Find the training with status **User Confirmation**.
4. Review your supervisor's comments and rating.
5. Click **Confirm** to proceed to final approval.

---

## Training Routing Rules (Admin)

Administrators can set custom routing rules for the supervisor step based on:
- Employee **Position**
- Employee **Department**

A maximum of 3 routing steps can be configured per rule.

---

## Managing Trainings (Admin/HR)

### Creating a Training
1. Go to **Assessments > Training Management**.
2. Click **Create Training**.
3. Fill in:
   - Training title
   - Date and time
   - Speaker/trainer
   - Objective
   - Select a survey template (questions are copied from the template)
   - Set target participants (All employees or specific individuals)
4. Save.

### Monitoring Submissions
In the training detail view, you can see a list of all participants and their submission status (Complete / Incomplete).
