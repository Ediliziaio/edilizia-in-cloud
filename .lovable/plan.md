

# Fix: `get_dashboard_kpis` type mismatch

## Root Cause
The function declares all date variables as `TIMESTAMPTZ`, but `company_costs.due_date` and `orders.expected_date` are `DATE` columns. PostgreSQL cannot implicitly compare `DATE <= TIMESTAMPTZ` in all contexts, producing `"operator does not exist: date <= text"`.

## Fix
Create a new migration with `CREATE OR REPLACE FUNCTION` that casts all TIMESTAMPTZ variables to `::date` when comparing against `due_date` or `expected_date` columns. Specifically:

- `cc.due_date BETWEEN v_month_start AND v_month_end` → `cc.due_date BETWEEN v_month_start::date AND v_month_end::date`
- `o.expected_date BETWEEN v_now AND v_week_end` → `o.expected_date BETWEEN v_now::date AND v_week_end::date`
- `cc.due_date < v_now` → `cc.due_date < v_now::date`
- `o.expected_date < v_now` → `o.expected_date < v_now::date`
- All similar occurrences in CASH FLOW, URGENT ITEMS, FINANCIAL ALERTS, WEEKLY DEADLINES, and AGING RECEIVABLES sections

## File
Single migration SQL file replacing the function with corrected casts.

