import datetime
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from userLogin.models import loginCredentials

def current_date() -> datetime.date:
    return timezone.now().date()

# ── Leave Configuration ────────────────────────────────────────────────────────

class LeaveType(models.Model):
    """Configurable leave type (Sick, Vacation, Emergency, etc.)."""
    name = models.CharField(max_length=100, unique=True)
    has_balance = models.BooleanField(
        default=True,
        help_text='Whether entitled-leave balance is tracked for this type.',
    )
    deductible = models.BooleanField(
        default=True,
        help_text='Whether approved leave deducts from the employee\'s balance.',
    )
    requires_clinic_approval = models.BooleanField(
        default=False,
        help_text='If True, a Clinic step is inserted first in the routing chain.',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class LeaveReason(models.Model):
    """Primary reason linked to one or more leave types (e.g. "Medical – Hospitalisation")."""
    leave_types = models.ManyToManyField(
        LeaveType, related_name='reasons', blank=True,
    )
    title = models.CharField(max_length=200)

    class Meta:
        ordering = ['title']

    def __str__(self) -> str:
        types = ', '.join(self.leave_types.values_list('name', flat=True))
        return f'{types} – {self.title}' if types else self.title


class LeaveSubreason(models.Model):
    """Secondary reason under a LeaveReason."""
    reason = models.ForeignKey(
        LeaveReason, on_delete=models.CASCADE, related_name='subreasons',
    )
    title = models.CharField(max_length=200)

    class Meta:
        ordering = ['title']
        unique_together = [['reason', 'title']]

    def __str__(self) -> str:
        return f'{self.reason.title} / {self.title}'


# ── Leave Balance ──────────────────────────────────────────────────────────────

class LeaveBalance(models.Model):
    """Annual / periodic leave entitlement for one employee × leave type."""
    employee = models.ForeignKey(
        loginCredentials, on_delete=models.CASCADE, related_name='leave_balances',
    )
    leave_type = models.ForeignKey(
        LeaveType, on_delete=models.CASCADE, related_name='balances',
    )
    period_start = models.DateField()
    period_end = models.DateField()
    entitled_leave = models.DecimalField(max_digits=6, decimal_places=1)
    used_leave = models.DecimalField(max_digits=6, decimal_places=1, default=Decimal('0'))

    class Meta:
        ordering = ['-period_start']
        unique_together = [['employee', 'leave_type', 'period_start', 'period_end']]

    def __str__(self) -> str:
        return (
            f'{self.employee.idnumber} – {self.leave_type.name} '
            f'({self.period_start} → {self.period_end})'
        )

    @property
    def remaining_leave(self) -> Decimal:
        return max(self.entitled_leave - self.used_leave, Decimal('0'))


# ── Leave Request ──────────────────────────────────────────────────────────────

class LeaveRequest(models.Model):
    STATUS_CHOICES = [
        ('pending',     'Pending'),
        ('routing',     'Routing'),
        ('approved',    'Approved'),
        ('disapproved', 'Disapproved'),
        ('cancelled',   'Cancelled'),
    ]

    employee = models.ForeignKey(
        loginCredentials, on_delete=models.CASCADE, related_name='leave_requests',
    )
    leave_type = models.ForeignKey(
        LeaveType, on_delete=models.PROTECT, related_name='requests',
    )
    reason = models.ForeignKey(
        LeaveReason, on_delete=models.PROTECT, related_name='requests',
    )
    subreason = models.ForeignKey(
        LeaveSubreason, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='requests',
    )

    date_start = models.DateField()
    date_end = models.DateField()
    hours = models.DecimalField(max_digits=4, decimal_places=1)
    days_count = models.PositiveSmallIntegerField()

    # Snapshotted at submission — safe against mid-approval config changes
    is_deductible = models.BooleanField(default=True)

    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    control_number = models.CharField(max_length=20, unique=True, blank=True)
    date_prepared = models.DateField(default=current_date)
    remarks = models.TextField(blank=True)

    # ── Approval tracking ────────────────────────────────────────────────
    # Set to True immediately when any manager-level approver disapproves.
    # Ensures final status stays 'disapproved' even if HR approves later.
    manager_disapproved = models.BooleanField(default=False)
    # Set when HR completes the final step (approved outcome).
    # Used to enforce 3-day cancellation window.
    hr_approved_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        loginCredentials, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='cancelled_leave_requests',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.control_number} – {self.employee.idnumber}'

    @classmethod
    def generate_control_number(cls) -> str:
        """Generate LR-prefixed control number starting from LR1000, concurrency-safe."""
        latest = (
            cls.objects.select_for_update()
            .filter(control_number__startswith='LR')
            .order_by('-created_at')
            .first()
        )
        if latest and latest.control_number:
            try:
                num = int(latest.control_number[2:])
                next_num = num + 1
            except (ValueError, TypeError):
                next_num = 1000
        else:
            next_num = 1000
        return f'LR{next_num}'


# ── Leave Approval Step ────────────────────────────────────────────────────────

class LeaveApprovalStep(models.Model):
    ROLE_CHOICES = [
        ('manager', 'Manager'),
        ('clinic',  'Clinic'),
        ('iad',     'IAD'),
        ('hr',      'HR'),
    ]
    STATUS_CHOICES = [
        ('pending',     'Pending'),
        ('approved',    'Approved'),
        ('disapproved', 'Disapproved'),
        ('skipped',     'Skipped'),
    ]

    leave_request = models.ForeignKey(
        LeaveRequest, on_delete=models.CASCADE, related_name='approval_steps',
    )
    # Populated only for role_group='manager'. Null for clinic/iad/hr (group-based).
    approver = models.ForeignKey(
        loginCredentials, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='leave_steps_as_approver',
    )
    role_group = models.CharField(max_length=10, choices=ROLE_CHOICES)
    sequence = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    remarks = models.TextField(blank=True)

    # Which specific user from the group actually acted (logged for audit)
    acted_by = models.ForeignKey(
        loginCredentials, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='leave_steps_acted',
    )
    acted_at = models.DateTimeField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['sequence']
        unique_together = [['leave_request', 'sequence']]

    def __str__(self) -> str:
        return (
            f'{self.leave_request.control_number} '
            f'Step {self.sequence} ({self.role_group}) – {self.status}'
        )


# ── Leave Routing Rule ────────────────────────────────────────────────────────

class LeaveRoutingRule(models.Model):
    """
    Configurable approval routing rule applied when the leave requestor's
    position matches one of the rule's positions AND (if departments are
    assigned) the requestor's department matches one of the rule's departments.

    Priority resolution (highest → lowest):
      1. Position + Department match — rule has both positions and departments
         assigned, and the requestor's position is in the rule's positions AND
         the requestor's department is in the rule's departments.
      2. Position-only match — rule has positions but NO departments assigned;
         applies to that position regardless of which department the requestor
         belongs to.
      3. Default fallback — no matching rule found; the default manager-chain
         path is used.

    The rule defines only the MIDDLE steps — the configurable section that
    executes after the global Clinic/IAD gate and before the fixed HR step.
    Clinic, IAD, and HR are always determined globally and are never part of
    this rule's steps.

    One rule may cover multiple positions and multiple departments.
    """

    description = models.CharField(
        max_length=200,
        help_text='Human-readable label for this rule, e.g. "Clerk / Line Leader route".',
    )
    positions = models.ManyToManyField(
        'generalsettings.Position',
        related_name='routing_rules',
        help_text='Requestor positions this rule applies to.',
    )
    departments = models.ManyToManyField(
        'generalsettings.Department',
        blank=True,
        related_name='routing_rules',
        help_text=(
            'Requestor departments this rule applies to.  '
            'Leave empty to apply to the matched positions across ALL departments.'
        ),
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['description']
        verbose_name = 'Leave Routing Rule'
        verbose_name_plural = 'Leave Routing Rules'

    def __str__(self) -> str:
        return self.description

    def clean(self):
        """
        Validate that no other active rule creates an ambiguous match for the
        same (position, department) pair.

        Two rules are ambiguous when:
          • They share at least one position, AND
          • Either rule has no departments (i.e. applies to all departments) OR
            they share at least one department.

        This check runs only when a form is submitted and the instance already
        has a primary key so that M2M relationships are accessible.
        """
        from django.core.exceptions import ValidationError
        if not self.pk:
            return  # M2M not available before initial save — admin checks post-save.

        other_active = (
            LeaveRoutingRule.objects
            .filter(is_active=True)
            .exclude(pk=self.pk)
            .prefetch_related('positions', 'departments')
        )
        self_position_ids = set(self.positions.values_list('id', flat=True))
        self_department_ids = set(self.departments.values_list('id', flat=True))

        for other in other_active:
            # Check for shared positions
            overlap_positions = self_position_ids & set(
                other.positions.values_list('id', flat=True)
            )
            if not overlap_positions:
                continue

            # Positions overlap — check whether department scope is ambiguous
            other_dept_ids = set(other.departments.values_list('id', flat=True))

            # Ambiguous if either rule covers all departments (no dept filter)
            # or if they share at least one department.
            either_is_global = (not self_department_ids) or (not other_dept_ids)
            shared_depts = self_department_ids & other_dept_ids
            if either_is_global or shared_depts:
                pos_names = ', '.join(
                    self.positions.filter(id__in=overlap_positions)
                    .values_list('name', flat=True)
                )
                raise ValidationError(
                    f'Position(s) "{pos_names}" are already covered by active rule '
                    f'"{other.description}" with an overlapping department scope. '
                    f'Edit that rule instead.'
                )


class LeaveRoutingStep(models.Model):
    """
    One configurable middle step within a LeaveRoutingRule.

    At leave submission time the system walks the requestor's approver chain
    upward and resolves this step to the first chain member whose position
    matches any of this step's target_positions.  The traversal for the next
    step continues from directly after the resolved user — it does not restart
    from the requestor.

    Minimum 1 step per rule is enforced at the admin layer.
    """

    rule = models.ForeignKey(
        LeaveRoutingRule,
        on_delete=models.CASCADE,
        related_name='steps',
    )
    step_order = models.PositiveSmallIntegerField(
        help_text='Execution order of this step (1 = first middle step).',
    )
    target_positions = models.ManyToManyField(
        'generalsettings.Position',
        related_name='routing_step_targets',
        help_text=(
            'The set of positions to match during approver-chain traversal. '
            'The first chain member whose position is in this set becomes the approver.'
        ),
    )

    class Meta:
        ordering = ['step_order']
        unique_together = [['rule', 'step_order']]
        verbose_name = 'Leave Routing Step'
        verbose_name_plural = 'Leave Routing Steps'

    def __str__(self) -> str:
        return f'{self.rule.description} – Step {self.step_order}'

    def clean(self):
        """Enforce at least 1 target position (checked after M2M is available)."""
        # M2M is not accessible before save, so this only fires on change forms
        # that already have a saved instance.  The admin inline enforces this
        # via LeaveRoutingStepInline.save_formset as well.
        pass  # Actual enforcement is in the admin save_formset hook.


# ── Sunday Exemption ───────────────────────────────────────────────────────────

class SundayExemption(models.Model):
    """A Sunday that is treated as a working day (e.g. company make-up day)."""
    date = models.DateField(unique=True)
    reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['date']

    def __str__(self) -> str:
        return f'Sunday Exemption: {self.date}'
