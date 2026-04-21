"""
Leave approval routing engine.

Builds the sequential approval chain for a LeaveRequest and provides
the authorization helper used in approval views.

Role groups
───────────
  clinic   – Any user with clinic=True may act
  iad      – Any user with iad=True may act
  manager  – Only the specific approver FK user may act
  hr       – Any user with hr=True may act (always the final step)

Routing order — DEFAULT path (no matching routing rule)
───────────────────────────────────────────────────────
  1. Clinic + IAD  (if leave_type.requires_clinic_approval)
  2. IAD            (if date_start <= today and NOT clinic type)
  3. Manager chain (upward via workInformation.approver FK, filtered by
     Position.level_of_approval ≤ MANAGER_LEVEL_THRESHOLD)
  4. HR      (always last)

Routing order — RULE-BASED path (active LeaveRoutingRule matches requestor position)
─────────────────────────────────────────────────────────────────────────────────────
  1. Clinic + IAD  (if leave_type.requires_clinic_approval)   — same as default
  2. IAD            (if date_start <= today and NOT clinic)    — same as default
  3. Rule middle steps (resolved from full approver chain)     — CONFIGURABLE
  4. HR      (always last)                                     — same as default
"""

import logging

from django.utils import timezone
from rest_framework.exceptions import ValidationError

logger = logging.getLogger(__name__)

# Managers whose position.level_of_approval is above this threshold are NOT
# included in the DEFAULT manager chain.  Not used in rule-based path.
MANAGER_LEVEL_THRESHOLD: int = 99

# Absolute cap to prevent runaway traversal
MAX_CHAIN_DEPTH: int = 10


# ── Internal helpers ───────────────────────────────────────────────────────────

def _walk_approver_chain(employee):
    """
    Walk upward through workInformation.approver FK links.

    Returns an ordered list of approver loginCredentials instances to include
    as manager steps, respecting level threshold and cycle/depth guards.

    Used only by the DEFAULT routing path.
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
                'leave.routing: approver cycle detected at user_id=%d for employee_id=%d',
                approver.pk, employee.pk,
            )
            break

        visited.add(approver.pk)

        # Level-of-approval threshold check
        try:
            approver_work = (
                workInformation.objects
                .select_related('position')
                .filter(employee=approver)
                .first()
            )
            if approver_work and approver_work.position:
                level = approver_work.position.level_of_approval
                if level > MANAGER_LEVEL_THRESHOLD:
                    break
        except Exception:
            pass  # If position data missing, still include the approver

        chain.append(approver)
        current = approver
        depth += 1

    if depth >= MAX_CHAIN_DEPTH:
        logger.error(
            'leave.routing: MAX_CHAIN_DEPTH=%d exceeded for employee_id=%d',
            MAX_CHAIN_DEPTH, employee.pk,
        )

    return chain


def _build_full_approver_chain(employee) -> list:
    """
    Walk upward through workInformation.approver FK links WITHOUT the
    level_of_approval threshold filter.

    Returns the full ordered list of active approver loginCredentials instances.
    Inactive users are silently skipped but traversal continues through them so
    the chain is not broken by a single inactive intermediate.

    Used exclusively by the RULE-BASED routing path so the admin can pick any
    position in the hierarchy regardless of level_of_approval.
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
            logger.warning(
                'leave.routing: approver cycle detected at user_id=%d for employee_id=%d '
                '(full chain walk)',
                approver.pk, employee.pk,
            )
            break

        visited.add(approver.pk)

        if not approver.is_active:
            logger.warning(
                'leave.routing: skipping inactive approver user_id=%d for employee_id=%d',
                approver.pk, employee.pk,
            )
            # Keep traversing through the inactive user so the chain is not broken
            current = approver
            depth += 1
            continue

        approver_work = (
            workInformation.objects
            .select_related('position')
            .filter(employee=approver)
            .first()
        )
        if not approver_work:
            logger.warning(
                'leave.routing: approver user_id=%d has no workInformation record',
                approver.pk,
            )

        chain.append(approver)
        current = approver
        depth += 1

    if depth >= MAX_CHAIN_DEPTH:
        logger.error(
            'leave.routing: MAX_CHAIN_DEPTH=%d exceeded during full chain walk '
            'for employee_id=%d',
            MAX_CHAIN_DEPTH, employee.pk,
        )

    return chain


def _resolve_rule_middle_steps(
    employee,
    rule,
    full_chain: list,
) -> list[tuple]:
    """
    Resolve each LeaveRoutingStep in `rule` to a concrete approver.

    Algorithm
    ─────────
    For each step (ordered by step_order):
      • Scan full_chain starting from chain_start_idx.
      • The first member whose workInformation.position_id is in
        step.target_positions becomes the approver for this step.
      • chain_start_idx advances to (resolved_index + 1) so the next step
        starts its search right after the current resolved user.
      • If the chain is exhausted before a step is resolved, raise
        ValidationError listing the unresolvable step.

    Returns a list of ('manager', approver_instance) tuples ready to be
    appended to the main steps list.

    Minimum 1 step is valid — no artificial lower bound enforced here.
    """
    from userProfile.models import workInformation

    # Pre-build a position_id map for all chain members to avoid N+1 queries.
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
                f'Routing rule "{rule.description}" step {step.step_order} has no target '
                'positions configured. Please update the routing rule in admin.'
            )

        matched = False
        for i in range(chain_start_idx, len(full_chain)):
            member_position_id = chain_position_ids[i]
            if member_position_id is not None and member_position_id in target_ids:
                resolved.append(('manager', full_chain[i]))
                chain_start_idx = i + 1
                matched = True
                break

        if not matched:
            step_target_names = ', '.join(
                step.target_positions.values_list('name', flat=True)
            )
            raise ValidationError(
                f'Leave request cannot be submitted: routing rule "{rule.description}" '
                f'step {step.step_order} requires an approver with position '
                f'[{step_target_names}] but no matching person was found in the '
                f'approver chain of employee {employee}. '
                'Please contact the system administrator to update the routing rule '
                'or the approver chain.'
            )

    return resolved


# ── Public API ─────────────────────────────────────────────────────────────────

def build_approval_chain(leave_request):
    """
    Build and persist the approval steps for leave_request.

    Must be called inside a transaction.atomic() block (the caller's transaction
    that created the LeaveRequest).

    Path selection
    ──────────────
    If the requestor's position matches an active LeaveRoutingRule the
    RULE-BASED path is used: Clinic/IAD (global) → rule middle steps → HR.

    Otherwise the DEFAULT path is used: Clinic/IAD → manager chain → HR.

    Raises rest_framework.exceptions.ValidationError if required role users are
    absent from the system (pre-flight guard) or if a routing rule step cannot
    be resolved against the approver chain.

    Returns the list of created LeaveApprovalStep instances.
    """
    from .models import LeaveApprovalStep, LeaveRoutingRule
    from userLogin.models import loginCredentials
    from userProfile.models import workInformation

    leave_type = leave_request.leave_type
    employee = leave_request.employee
    today = timezone.now().date()

    # ── Pre-flight: HR must always exist ──────────────────────────────────
    if not loginCredentials.objects.filter(hr=True, is_active=True).exists():
        raise ValidationError(
            'No active HR user is configured. '
            'Please contact the system administrator before submitting a leave request.'
        )

    # ── Pre-flight: Clinic must exist if required ─────────────────────────
    if leave_type.requires_clinic_approval:
        if not loginCredentials.objects.filter(clinic=True, is_active=True).exists():
            raise ValidationError(
                'No active Clinic user is configured for this leave type. '
                'Please contact the system administrator.'
            )

    # ── Pre-flight: IAD must exist when an IAD step will be added ────────
    needs_iad = leave_type.requires_clinic_approval or leave_request.date_start <= today
    if needs_iad:
        if not loginCredentials.objects.filter(iad=True, is_active=True).exists():
            raise ValidationError(
                'No active IAD user is configured. '
                'Please contact the system administrator before submitting a leave request.'
            )

    steps: list[tuple] = []

    # ── Global Clinic / IAD gate (identical in both paths) ────────────────
    if leave_type.requires_clinic_approval:
        steps.append(('clinic', None))
        steps.append(('iad', None))
    else:
        if leave_request.date_start <= today:
            steps.append(('iad', None))

    # ── Determine which routing path to use ──────────────────────────────
    employee_position_id: int | None = None
    try:
        emp_work = (
            workInformation.objects
            .select_related('position')
            .filter(employee=employee)
            .first()
        )
        if emp_work and emp_work.position_id:
            employee_position_id = emp_work.position_id
    except Exception:
        pass

    matching_rule = None
    if employee_position_id is not None:
        # Resolve the employee's department for priority matching.
        employee_department_id: int | None = None
        try:
            if emp_work and emp_work.department_id:
                employee_department_id = emp_work.department_id
        except Exception:
            pass

        # Priority 1: rules that explicitly match BOTH position AND department.
        # Only considered when the employee has a known department.
        if employee_department_id is not None:
            matching_rule = (
                LeaveRoutingRule.objects
                .filter(
                    is_active=True,
                    positions__id=employee_position_id,
                    departments__id=employee_department_id,
                )
                .prefetch_related('steps__target_positions')
                .order_by('pk')  # deterministic: lowest pk wins on ties
                .first()
            )

        # Priority 2: position-only rules (no departments assigned — department-agnostic).
        if matching_rule is None:
            matching_rule = (
                LeaveRoutingRule.objects
                .filter(
                    is_active=True,
                    positions__id=employee_position_id,
                    departments__isnull=True,
                )
                .prefetch_related('steps__target_positions')
                .order_by('pk')
                .first()
            )

    if matching_rule is not None:
        # ── RULE-BASED path ───────────────────────────────────────────────
        logger.info(
            'leave.routing: using rule-based path (rule_id=%d, "%s") '
            'for leave_request employee_id=%d',
            matching_rule.pk, matching_rule.description, employee.pk,
        )
        full_chain = _build_full_approver_chain(employee)
        middle_steps = _resolve_rule_middle_steps(employee, matching_rule, full_chain)
        steps.extend(middle_steps)
    else:
        # ── DEFAULT path ──────────────────────────────────────────────────
        manager_chain = _walk_approver_chain(employee)
        for manager in manager_chain:
            steps.append(('manager', manager))

    # HR always last (both paths)
    steps.append(('hr', None))

    # Persist all steps; stamp activated_at on the first step immediately
    now = timezone.now()
    created = []
    for seq, (role_group, approver) in enumerate(steps, start=1):
        step = LeaveApprovalStep.objects.create(
            leave_request=leave_request,
            role_group=role_group,
            approver=approver,
            sequence=seq,
            status='pending',
            activated_at=now if seq == 1 else None,
        )
        created.append(step)

    return created


def can_act_on_step(user, step) -> bool:
    """
    Return True if `user` is authorised to act on `step` AND `step` is the
    current active (lowest-sequence pending) step for its request.

    This is the single authorisation gate for all approval actions.
    """
    # Verify this is the lowest-sequence pending step
    lowest = (
        step.leave_request.approval_steps
        .filter(status='pending')
        .order_by('sequence')
        .first()
    )
    if not lowest or lowest.pk != step.pk:
        return False

    role = step.role_group
    if role == 'clinic':
        return bool(getattr(user, 'clinic', False))
    if role == 'iad':
        return bool(getattr(user, 'iad', False))
    if role == 'hr':
        return bool(getattr(user, 'hr', False))
    if role == 'manager':
        return step.approver_id is not None and step.approver_id == user.pk
    return False
