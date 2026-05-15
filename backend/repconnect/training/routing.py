"""
Training approval routing engine.

Builds the sequential approval chain for a TrainingSubmission.

KEY DIFFERENCES from leave routing:
  - Clinic, IAD, and HR steps are NEVER included.
  - Only the manager chain (approver FK walk) is used.
  - Rule-based path reuses LeaveRoutingRule and LeaveRoutingStep.
  - If no routing rule matches, the single designated approver is the chain.
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
    Returns list of approver instances in ascending order.
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
                'training.routing: approver cycle at user_id=%d for employee_id=%d',
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
        logger.error('training.routing: MAX_CHAIN_DEPTH exceeded for employee_id=%d', employee.pk)

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
    Resolve each EvaluationRoutingRuleStep in `rule` to a concrete approver.
    Returns list of ('manager', approver_instance) tuples.
    Raises ValidationError if a step cannot be resolved.
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
            raise ValidationError(
                f'Training submission cannot be processed: routing rule "{rule.description}" '
                f'step {step.step_order} requires a position [{pos_names}] in the approver chain '
                f'of {employee}, but no matching person was found. '
                'Please contact the system administrator.'
            )

    return resolved


def build_training_approval_chain(submission):
    """
    Build and persist TrainingApprovalStep records for a TrainingSubmission.
    Must be called inside @transaction.atomic.

    - Clinic, IAD, HR are NEVER added.
    - Uses EvaluationRoutingRule (module='training_evaluation').
    - Falls back to single direct approver if no rule matches.
    - Raises ValidationError if the chain is empty (no approver configured).
    - Raises ValidationError if deduplication reduces the chain below the rule's step count.
    """
    from training.models import EvaluationRoutingRule, TrainingApprovalStep
    from userProfile.models import workInformation

    employee = submission.submitted_by

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
            'Please contact HR before submitting a training evaluation.'
        )

    employee_position_id   = emp_work.position_id if emp_work.position_id else None
    employee_department_id = emp_work.department_id if emp_work.department_id else None

    # ── Find matching EvaluationRoutingRule (module=training_evaluation) ──
    matching_rule = None
    if employee_position_id is not None:
        # Priority 1: position + department match
        if employee_department_id is not None:
            matching_rule = (
                EvaluationRoutingRule.objects
                .filter(
                    is_active=True,
                    module=EvaluationRoutingRule.MODULE_TRAINING_EVALUATION,
                    positions__id=employee_position_id,
                    departments__id=employee_department_id,
                )
                .prefetch_related('steps__target_positions')
                .order_by('pk')
                .first()
            )

        # Priority 2: position-only (rule has no departments → applies to all depts)
        if matching_rule is None:
            matching_rule = (
                EvaluationRoutingRule.objects
                .filter(
                    is_active=True,
                    module=EvaluationRoutingRule.MODULE_TRAINING_EVALUATION,
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
            'training.routing: rule-based path (rule_id=%d) for submission_id=%d',
            matching_rule.pk, submission.pk,
        )
        full_chain = _build_full_approver_chain(employee)
        middle_steps = _resolve_rule_middle_steps(employee, matching_rule, full_chain)
        steps.extend(middle_steps)
    else:
        logger.info(
            'training.routing: default path for submission_id=%d',
            submission.pk,
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

    # ── Guard: deduplication must not reduce below the rule's defined steps ─
    if matching_rule is not None:
        expected_count = matching_rule.steps.count()
        if len(deduped) < expected_count:
            raise ValidationError(
                f'Routing rule "{matching_rule.description}" requires {expected_count} '
                f'approver(s), but only {len(deduped)} unique approver(s) could be resolved. '
                'Two steps may have resolved to the same person. '
                'Please review the routing rule configuration or contact HR.'
            )

    # ── Persist approval steps ────────────────────────────────────────────
    created: list[TrainingApprovalStep] = []
    now = timezone.now()

    for seq, (role_group, approver) in enumerate(deduped, start=1):
        step = TrainingApprovalStep.objects.create(
            submission=submission,
            approver=approver,
            sequence=seq,
            status='pending',
            activated_at=now if seq == 1 else None,
        )
        created.append(step)

    logger.info(
        'training.routing: created %d approval steps for submission_id=%d',
        len(created), submission.pk,
    )
    return created


def can_act_on_training_step(step, user) -> bool:
    """
    Return True if `user` is the current active approver on `step`.
    The current step is the lowest-sequence pending step with activated_at set.
    """
    first_active = (
        step.submission.approval_steps
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
