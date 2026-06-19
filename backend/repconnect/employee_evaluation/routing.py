"""
Employee Evaluation approval routing engine.

Builds the sequential EvaluationApprovalStep records for an EvaluationEntry.

Logic mirrors training/routing.py exactly, but operates on:
  - EvaluationEntry  (instead of TrainingSubmission)
  - EvaluationApprovalStep (instead of TrainingApprovalStep)
  - EvaluationRoutingRule filtered by module='employee_evaluation'
"""
from __future__ import annotations

import logging

from django.utils import timezone
from rest_framework.exceptions import ValidationError

logger = logging.getLogger(__name__)

MAX_CHAIN_DEPTH: int = 10
MANAGER_LEVEL_THRESHOLD: int = 99


def _walk_approver_chain_default(employee) -> list:
    """
    Walk upward through workInformation.approver FK, capped by level_of_approval.
    Used for the DEFAULT (no matching rule) path.
    """
    from userProfile.models import workInformation

    chain = []
    visited: set[int] = {employee.pk}
    current = employee
    depth = 0

    while depth < MAX_CHAIN_DEPTH:
        work_info = (
            workInformation.objects
            .select_related('approver')
            .filter(employee=current)
            .first()
        )
        if not work_info or not work_info.approver:
            break

        approver = work_info.approver
        if approver.pk in visited:
            logger.warning(
                'employee_evaluation.routing: approver cycle at user_id=%d for employee_id=%d',
                approver.pk, employee.pk,
            )
            break

        visited.add(approver.pk)

        try:
            approver_work = (
                workInformation.objects
                .select_related('position')
                .filter(employee=approver)
                .first()
            )
            if approver_work and approver_work.position:
                if approver_work.position.level_of_approval > MANAGER_LEVEL_THRESHOLD:
                    break
        except Exception:
            pass

        chain.append(approver)
        current = approver
        depth += 1

    if depth >= MAX_CHAIN_DEPTH:
        logger.error(
            'employee_evaluation.routing: MAX_CHAIN_DEPTH exceeded for employee_id=%d',
            employee.pk,
        )

    return chain


def _build_full_approver_chain(employee) -> list:
    """
    Full upward walk WITHOUT level_of_approval threshold.
    Used for the rule-based path.
    """
    from userProfile.models import workInformation

    chain: list = []
    visited: set[int] = {employee.pk}
    current = employee
    depth = 0

    while depth < MAX_CHAIN_DEPTH:
        work_info = (
            workInformation.objects
            .select_related('approver')
            .filter(employee=current)
            .first()
        )
        if not work_info or not work_info.approver:
            break

        approver = work_info.approver
        if approver.pk in visited:
            break

        visited.add(approver.pk)

        if not approver.is_active:
            current = approver
            depth += 1
            continue

        chain.append(approver)
        current = approver
        depth += 1

    return chain


def _resolve_rule_middle_steps(employee, rule, full_chain: list) -> list[tuple]:
    """
    Resolve each EvaluationRoutingRuleStep to a concrete approver.
    Returns list of ('manager', approver_instance) tuples.

    All steps are bypassable: if a step's target positions are not found
    in the approver chain, it is silently skipped (logged at WARNING for
    step 1, INFO for steps 2+). The empty-chain guard in
    build_evaluation_approval_chain() catches the case where every step
    is bypassed and raises a clear ValidationError.

    A step with NO target_positions configured is always a hard error
    (admin misconfiguration, not an org-chart gap).
    """
    from userProfile.models import workInformation

    chain_position_ids: list[int | None] = []
    for member in full_chain:
        work_info = (
            workInformation.objects
            .select_related('position')
            .filter(employee=member)
            .first()
        )
        chain_position_ids.append(
            work_info.position_id if (work_info and work_info.position_id) else None
        )

    rule_steps = list(rule.steps.prefetch_related('target_positions').order_by('step_order'))
    resolved: list[tuple] = []
    chain_start_idx = 0

    for step in rule_steps:
        target_ids: set[int] = set(step.target_positions.values_list('id', flat=True))
        if not target_ids:
            raise ValidationError(
                f'Evaluation routing rule "{rule.description}" step {step.step_order} '
                'has no target positions configured.'
            )

        matched = False
        for i in range(chain_start_idx, len(full_chain)):
            if chain_position_ids[i] is not None and chain_position_ids[i] in target_ids:
                resolved.append(('manager', full_chain[i]))
                chain_start_idx = i + 1
                matched = True
                break

        if not matched:
            pos_names = ', '.join(step.target_positions.values_list('name', flat=True))
            # Step 1 bypass is logged at WARNING so org-chart gaps are visible
            # in ops logs even though the submission still proceeds.
            log = logger.warning if step.step_order == 1 else logger.info
            log(
                'employee_evaluation.routing: step %d [%s] not found in approver chain '
                'for employee_id=%d (rule_id=%d) — step bypassed',
                step.step_order, pos_names, employee.pk, rule.pk,
            )
            # chain_start_idx intentionally NOT advanced: the next step
            # searches from the same position so it can pick up where
            # the bypassed step left off.

    return resolved


def build_evaluation_approval_chain(entry):
    """
    Build and persist EvaluationApprovalStep records for an EvaluationEntry.
    Must be called inside @transaction.atomic.

    - Uses EvaluationRoutingRule (module='employee_evaluation').
    - Falls back to single direct approver if no rule matches.
    - Raises ValidationError if the chain is empty.
    - Steps not found in the chain are bypassed (WARNING logged for step 1).
    """
    from training.models import EvaluationRoutingRule
    from employee_evaluation.models import EvaluationApprovalStep
    from userProfile.models import workInformation

    employee = entry.employee

    # ── Resolve employee work info ─────────────────────────────────────────
    emp_work = (
        workInformation.objects
        .select_related('position', 'department')
        .filter(employee=employee)
        .first()
    )

    if not emp_work:
        raise ValidationError(
            'Your work information record is missing. '
            'Please contact HR before submitting an evaluation.'
        )

    employee_position_id   = emp_work.position_id if emp_work.position_id else None
    employee_department_id = emp_work.department_id if emp_work.department_id else None

    # ── Find matching EvaluationRoutingRule (module=employee_evaluation) ──
    matching_rule = None
    if employee_position_id is not None:
        # Priority 1: position + department match
        if employee_department_id is not None:
            matching_rule = (
                EvaluationRoutingRule.objects
                .filter(
                    is_active=True,
                    module=EvaluationRoutingRule.MODULE_EMPLOYEE_EVALUATION,
                    positions__id=employee_position_id,
                    departments__id=employee_department_id,
                )
                .prefetch_related('steps__target_positions')
                .order_by('pk')
                .first()
            )

        # Priority 2: position-only (rule has no departments → all depts)
        if matching_rule is None:
            matching_rule = (
                EvaluationRoutingRule.objects
                .filter(
                    is_active=True,
                    module=EvaluationRoutingRule.MODULE_EMPLOYEE_EVALUATION,
                    positions__id=employee_position_id,
                    departments__isnull=True,
                )
                .prefetch_related('steps__target_positions')
                .order_by('pk')
                .first()
            )

    steps: list[tuple] = []

    if matching_rule is not None:
        logger.info(
            'employee_evaluation.routing: rule-based path (rule_id=%d) for entry_id=%d',
            matching_rule.pk, entry.pk,
        )
        full_chain = _build_full_approver_chain(employee)
        middle_steps = _resolve_rule_middle_steps(employee, matching_rule, full_chain)
        steps.extend(middle_steps)
    else:
        logger.info(
            'employee_evaluation.routing: default path for entry_id=%d',
            entry.pk,
        )
        chain = _walk_approver_chain_default(employee)
        for approver in chain:
            steps.append(('manager', approver))

    # ── Guard: empty chain ────────────────────────────────────────────────
    if not steps:
        raise ValidationError(
            'No approval chain could be built for your position. '
            'Please ensure your work information has an approver assigned, '
            'or contact HR to configure a routing rule.'
        )

    # ── Deduplicate consecutive identical approvers ───────────────────────
    deduped: list[tuple] = []
    for step in steps:
        if deduped and step[1] and deduped[-1][1] and step[1].pk == deduped[-1][1].pk:
            continue
        deduped.append(step)

    # ── Persist approval steps ────────────────────────────────────────────
    created: list[EvaluationApprovalStep] = []
    now = timezone.now()

    for seq, (role_group, approver) in enumerate(deduped, start=1):
        step = EvaluationApprovalStep.objects.create(
            entry=entry,
            approver=approver,
            sequence=seq,
            status='pending',
            activated_at=now if seq == 1 else None,
        )
        created.append(step)

    logger.info(
        'employee_evaluation.routing: created %d approval steps for entry_id=%d',
        len(created), entry.pk,
    )
    return created


def can_act_on_evaluation_step(step, user) -> bool:
    """
    Return True if `user` is the current active approver on `step`.
    """
    first_active = (
        step.entry.approval_steps
        .filter(status='pending', activated_at__isnull=False)
        .order_by('sequence')
        .first()
    )
    if not first_active:
        return False
    if first_active.pk != step.pk:
        return False
    if step.approver_id != user.pk:
        return False
    return True
