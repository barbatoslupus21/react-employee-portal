# 3. Finance & Payroll

## Overview

The Finance module gives employees access to their financial records: payslips, loans, allowances, deductions, and savings. Administrators manage all financial data through the admin finance panel.

---

## What Employees Can View

| Section | Description |
|---------|-------------|
| **Payslips** | PDF payslips uploaded by accounting/admin |
| **Allowances** | Current allowances (transportation, meal, etc.) |
| **Loans** | Active loans, balances, and deduction history |
| **Deductions** | One-time or recurring deductions |
| **Savings** | Accumulated savings with withdrawal records |

---

## How to View Your Payslip

1. Navigate to **Finance** in the sidebar.
2. Select **Payslips**.
3. A list of your payslips sorted by date will appear.
4. Click on a payslip to **open/download** the PDF.

> Payslips are uploaded by the accounting or admin team. If you do not see a payslip for a period, contact HR or Accounting.

---

## OJT Payslips

OJT (On-the-Job Training) employees have a separate payslip view that shows a detailed breakdown:

- Basic allowance
- Overtime pay
- Night differential
- Holiday pay
- Total deductions
- Net pay

OJT payslips are managed separately by administrators in the OJT section.

---

## Finance Data Structure — Block Diagram

```
+-------------------+
|    EMPLOYEE       |
+-------------------+
         |
         |---- ALLOWANCES
         |       - Type (Transportation, Meal, etc.)
         |       - Amount
         |       - Effective Date
         |
         |---- LOANS
         |       - Loan Type (Emergency, Educational, etc.)
         |       - Principal Amount
         |       - Balance Remaining
         |       - Deduction Schedule (cut-off/monthly/quarterly/yearly)
         |       - Deduction Records (history)
         |
         |---- DEDUCTIONS
         |       - Type
         |       - Amount
         |       - Date
         |
         |---- SAVINGS
         |       - Type
         |       - Accumulated Amount
         |       - Withdrawal Records
         |
         +---- PAYSLIPS
                 - Payslip Type (Regular, 13th Month, etc.)
                 - Pay Period
                 - PDF File
```

---

## How to View Your Loan Details

1. Navigate to **Finance > Loans**.
2. Active loans are listed with:
   - Loan type name
   - Original amount
   - Current balance
   - Deduction frequency
   - Deduction history (dates and amounts deducted)
3. Click a loan row to expand details.

---

## How to View Your Savings

1. Navigate to **Finance > Savings**.
2. Each savings type shows:
   - Total accumulated amount
   - Withdrawal records (if any)

---

## Finance Administration (Admin Only)

Administrators manage finance records through the Admin Finance panel:

### Adding an Allowance to an Employee
1. Go to **Admin Finance > Allowances**.
2. Select the employee.
3. Choose the allowance type.
4. Enter the amount and effective date.
5. Save.

> If the allowance type is configured as **"replace on upload"**, uploading a new allowance of the same type replaces the previous one. Otherwise, it accumulates.

### Adding a Loan
1. Go to **Admin Finance > Loans**.
2. Select the employee and loan type.
3. Enter the principal amount.
4. Set the deduction frequency.
5. Save.

> Loan types may be configured as **non-stackable** — meaning only one active loan of that type is allowed per employee at a time.

### Uploading a Payslip
1. Go to **Admin Finance > Payslips**.
2. Select the employee.
3. Choose the payslip type and pay period.
4. Upload the PDF file (maximum 5MB).
5. Save.

---

## Financial Rates by Office

Each office may have different rates for:

| Rate Type | Description |
|-----------|-------------|
| OJT Allowance Rate | Daily rate for trainees |
| Night Differential | Extra pay for night shift hours |
| Overtime Rate | Multiplier for overtime hours |
| Regular Holiday Rate | Pay rate on regular holidays |
| Special Holiday Rate | Pay rate on special/non-working holidays |

These rates are configured by administrators per office and are applied automatically to payroll calculations.
