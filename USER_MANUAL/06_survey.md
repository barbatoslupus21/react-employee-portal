# 6. Survey System

## Overview

The Survey module allows HR and administrators to create and distribute surveys to employees. Surveys can be anonymous or attributed, and support a wide variety of question types.

---

## Survey Workflow — Block Diagram

```
ADMIN/HR                    EMPLOYEE
    |                           |
    | 1. Create Survey Template |
    |    (Add questions,        |
    |     configure options)    |
    |                           |
    | 2. Create Survey from     |
    |    template               |
    |    - Set title & status   |
    |    - Choose target users  |
    |      (All or Specific)    |
    |    - Set anonymous mode   |
    |                           |
    | 3. Activate Survey        |
    |    (Status: Active)       |
    |         |                 |
    |         +---------------->| 4. Employee receives
    |                           |    notification
    |                           |
    |                           | 5. Employee opens
    |                           |    and answers
    |                           |    the survey
    |                           |         |
    |                           |         | Submit
    |                           |         |
    | 6. Admin views            |         |
    |    responses <------------+---------+
    |
    | 7. Close Survey
    |    (Status: Closed)
```

---

## Survey Types

| Type | Purpose |
|------|---------|
| **Leadership Alignment** | Assess alignment with leadership direction |
| **Engagement** | Measure employee engagement and satisfaction |
| **Effectiveness** | Evaluate process or program effectiveness |
| **Experience** | Gather employee experience feedback |
| **Onboarding** | Feedback from newly onboarded employees |

---

## How to Answer a Survey (Employee)

### Step 1 — Find Your Survey
1. Navigate to **Assessments > Survey**.
2. Active surveys assigned to you are listed.
3. Surveys you have already completed show as **Submitted**.

### Step 2 — Open and Answer
Click the survey title to open it. Answer each question:

| Question Type | How to Answer |
|---------------|---------------|
| **Single Choice** | Select one option |
| **Multiple Choice** | Select one or more options |
| **Dropdown** | Choose from a dropdown list |
| **Rating** | Click the star or number rating |
| **Likert Scale** | Select your level of agreement |
| **Short Text** | Type a brief answer |
| **Long Text** | Type a detailed paragraph |
| **Yes/No** | Click Yes or No |
| **Number** | Enter a numeric value |
| **Date** | Pick a date from the calendar picker |
| **Linear Scale** | Drag or click on the scale |

> Some questions have an **"Other"** option — you can type a custom answer if none of the provided options fit.

### Step 3 — Submit
After answering all required questions, click **Submit**. You cannot edit your response after submission.

---

## Anonymous Surveys

If a survey is marked **Anonymous**, your identity will not be attached to your responses. The admin can only see aggregate data, not individual responses.

---

## Survey Statuses

| Status | Meaning |
|--------|---------|
| **Draft** | Survey is being prepared; not visible to employees |
| **Active** | Live and accepting responses |
| **Closed** | No longer accepting responses |

---

## Survey Templates (Admin)

### Creating a Template
1. Go to **Assessments > Survey Templates**.
2. Click **New Template**.
3. Add questions:
   - Set the question text
   - Choose the question type
   - Configure options (for choice-type questions)
   - Set rating scale configuration (for rating/Likert questions)
   - Mark as required or optional
   - Allow "Other" option if applicable
4. Use **Section** and **Subsection** types to organize long surveys.
5. Save the template.

### Creating a Survey from a Template
1. Go to **Assessments > Survey Management**.
2. Click **Create Survey**.
3. Select a template — questions are **copied** from the template into the survey.
4. Set the survey title, description, target users, and anonymous flag.
5. Set status to **Active** to publish.

> Editing the original template after a survey is created does **not** automatically update existing surveys.

---

## Viewing Survey Results (Admin/HR)

1. Go to **Assessments > Survey Management**.
2. Click on a survey.
3. View response counts and individual answers (if not anonymous).
