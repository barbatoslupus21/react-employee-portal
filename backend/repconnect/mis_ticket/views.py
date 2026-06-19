"""Views for the MIS Ticket module.

Security decisions
------------------
* MISChatWebhookRelayView: only `message` is accepted from the client.
  All identity fields (name, employeeId, department) are assembled server-side
  from request.user (audit fix C6).  n8n URL comes from settings (audit fix H1).
* Chat relay is rate-limited via ScopedRateThrottle 'mis_chat': 20/min (audit fix H2).
* MISChatHistoryView: session validated against request.user (audit fix H3).
* MISTicketPDFView: server-side check that diagnosis exists + status is terminal
  before streaming PDF (audit fix H4).
* All user-facing views filter queryset by employee=request.user (audit fix IDOR).
* resolved_at is set when status transitions to RESOLVED/CLOSED (audit fix M1).
* is_ticket_creation is set on the AI response message, not the user message (audit fix M2).
"""
from __future__ import annotations

import calendar
import datetime
import io
import json
import re

import requests as http_requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Avg, Case, Count, DurationField, ExpressionWrapper, F, IntegerField, Q, When
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from activityLog.models import ActivityLog, Notification
from userProfile.models import workInformation

from .models import MISChatMessage, MISChatSession, MISDevice, MISTicket, MISTicketDiagnosis
from .permissions import IsMISAdmin
from .serializers import (
    AdminMISTicketListSerializer,
    MISChatMessageSerializer,
    MISChatSessionSerializer,
    MISDeviceSerializer,
    MISTicketCreateSerializer,
    MISTicketDetailSerializer,
    MISTicketDiagnosisSerializer,
    MISTicketListSerializer,
)

# ── Helpers ───────────────────────────────────────────────────────────────────

_TICKET_DATA_RE = re.compile(
    r'\[TICKET_DATA\](.*?)\[/TICKET_DATA\]',
    re.DOTALL,
)

# Sensitive-value masking — only masks when keyword is followed by separator + value
_SANITIZE_RE = re.compile(
    r'\b(password|api[_\s]?key|secret|token|passphrase)\s*[:=]\s*\S+',
    re.IGNORECASE,
)


def _sanitize(text: str) -> str:
    return _SANITIZE_RE.sub(lambda m: m.group(1) + ': ***', text)


def _get_department(user) -> str:
    wi = (
        workInformation.objects
        .filter(employee=user, department__isnull=False)
        .select_related('department')
        .order_by('-updated_at', '-created_at', '-id')
        .first()
    )
    return wi.department.name if wi and wi.department_id else ''


def _full_name(user) -> str:
    parts = [user.firstname or '', user.lastname or '']
    return ' '.join(p for p in parts if p).strip() or user.username


# ── Device Views ──────────────────────────────────────────────────────────────

class MISDeviceListCreateView(APIView):
    """GET /api/mis/devices/ — list user's devices.
       POST /api/mis/devices/ — create a device."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = MISDevice.objects.filter(employee=request.user)
        search = request.query_params.get('search', '').strip()
        device_type = request.query_params.get('device_type', '').strip()
        if search:
            type_values = [
                value
                for value, label in MISDevice.DEVICE_TYPES
                if search.lower() in label.lower()
            ]
            qs = qs.filter(
                Q(device_name__icontains=search)
                | Q(device_type__icontains=search)
                | Q(other_device_type__icontains=search)
                | Q(brand__icontains=search)
                | Q(model_name__icontains=search)
                | Q(location__icontains=search)
                | Q(device_type__in=type_values)
            )
        if device_type:
            qs = qs.filter(device_type=device_type)
        serializer = MISDeviceSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = MISDeviceSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(employee=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MISDeviceDetailView(APIView):
    """GET/PUT/DELETE /api/mis/devices/{pk}/"""

    permission_classes = [IsAuthenticated]

    def _get_device(self, pk, user):
        try:
            return MISDevice.objects.get(pk=pk, employee=user)
        except MISDevice.DoesNotExist:
            return None

    def get(self, request, pk):
        device = self._get_device(pk, request.user)
        if not device:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(MISDeviceSerializer(device).data)

    def put(self, request, pk):
        device = self._get_device(pk, request.user)
        if not device:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = MISDeviceSerializer(device, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        device = self._get_device(pk, request.user)
        if not device:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        # Warn if there are open tickets referencing this device
        open_tickets = MISTicket.objects.filter(
            employee=request.user,
            device_name=device.device_name,
            status__in=['OPEN', 'IN_PROGRESS'],
        ).count()
        if open_tickets and request.query_params.get('confirm') != '1':
            return Response(
                {
                    'detail': f'This device has {open_tickets} open ticket(s). '
                              f'Add ?confirm=1 to proceed with deletion.',
                    'open_tickets': open_tickets,
                },
                status=status.HTTP_409_CONFLICT,
            )
        device.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MISDeviceSummaryView(APIView):
    """GET /api/mis/devices/{pk}/summary/ — maintenance history stats."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            device = MISDevice.objects.get(pk=pk, employee=request.user)
        except MISDevice.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        tickets = MISTicket.objects.filter(
            employee=request.user,
            device_name=device.device_name,
        ).order_by('-created_at')

        total = tickets.count()
        resolved = tickets.filter(status__in=['RESOLVED', 'CLOSED']).count()

        # Most common category
        from django.db.models import Count
        most_common = (
            tickets.values('category')
            .annotate(n=Count('id'))
            .order_by('-n')
            .first()
        )

        latest = tickets.first()
        latest_data = None
        if latest:
            latest_data = {
                'ticket_number': latest.ticket_number,
                'status': latest.status,
                'status_display': latest.get_status_display(),
                'created_at': latest.created_at,
            }

        return Response({
            'device': MISDeviceSerializer(device).data,
            'total_tickets': total,
            'resolved_tickets': resolved,
            'most_common_category': most_common['category'] if most_common else None,
            'latest_ticket': latest_data,
        })


# ── Ticket Views (user-facing) ────────────────────────────────────────────────

class MISTicketListView(APIView):
    """GET /api/mis/tickets/ — paginated list of user's own tickets.
    POST /api/mis/tickets/ — create a manual ticket.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = MISTicket.objects.filter(employee=request.user).select_related('diagnosis', 'device')
        search = request.query_params.get('search', '').strip()
        status_filter = request.query_params.get('status', '').strip()
        category_filter = request.query_params.get('category', '').strip()
        if search:
            category_values = [
                value
                for value, label in MISTicket.CATEGORY_CHOICES
                if search.lower() in label.lower()
            ]
            status_values = [
                value
                for value, label in MISTicket.STATUS_CHOICES
                if search.lower() in label.lower()
            ]
            priority_values = [
                value
                for value, label in MISTicket.PRIORITY_CHOICES
                if search.lower() in label.lower()
            ]
            qs = qs.filter(
                Q(ticket_number__icontains=search)
                | Q(subject__icontains=search)
                | Q(device_name__icontains=search)
                | Q(problem__icontains=search)
                | Q(category__icontains=search)
                | Q(status__icontains=search)
                | Q(priority__icontains=search)
                | Q(category__in=category_values)
                | Q(status__in=status_values)
                | Q(priority__in=priority_values)
            )
        if status_filter:
            qs = qs.filter(status=status_filter)
        if category_filter:
            qs = qs.filter(category=category_filter)
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 20))
        total = qs.count()
        offset = (page - 1) * page_size
        items = qs[offset: offset + page_size]
        serializer = MISTicketListSerializer(items, many=True)
        return Response({'results': serializer.data, 'count': total, 'page': page, 'page_size': page_size})

    def post(self, request):
        ser = MISTicketCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        department = _get_department(request.user)

        if not department:
            return Response(
                {
                    'detail': (
                        'Your profile does not have a department assigned yet. '
                        'Please update your work information before creating a ticket.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        device_name = ''
        device_obj = None
        if device_id := data.get('device_id'):
            try:
                device_obj = MISDevice.objects.get(pk=device_id, employee=request.user)
                device_name = device_obj.device_name
            except MISDevice.DoesNotExist:
                pass

        try:
            with transaction.atomic():
                ticket = MISTicket.objects.create(
                    ticket_number=MISTicket.generate_ticket_number(),
                    employee=request.user,
                    employee_name=_full_name(request.user),
                    department=department,
                    subject=_sanitize(data['subject']),
                    category=data['category'],
                    device=device_obj,
                    device_name=device_name,
                    problem=_sanitize(data['problem']),
                    status='OPEN',
                    priority='medium',
                    seen=True,
                )
        except IntegrityError:
            return Response(
                {'detail': 'Failed to generate a unique ticket number. Please try again.'},
                status=status.HTTP_409_CONFLICT,
            )

        # Notify all MIS personnel
        _notify_mis_users_new_ticket(ticket, _full_name(request.user))

        # Activity log
        ActivityLog.objects.create(
            user=request.user,
            username=request.user.username,
            employee_id=getattr(request.user, 'idnumber', ''),
            module='MIS Ticket',
            action=f'Created ticket {ticket.ticket_number}',
            http_method='POST',
            endpoint=request.path,
        )

        return Response(
            MISTicketListSerializer(ticket).data,
            status=status.HTTP_201_CREATED,
        )


class MISTicketDetailView(APIView):
    """GET /api/mis/tickets/{pk}/ — single ticket detail."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            ticket = MISTicket.objects.select_related('diagnosis', 'device').get(pk=pk, employee=request.user)
        except MISTicket.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Mark as seen when the user views the ticket
        if not ticket.seen:
            ticket.seen = True
            ticket.save(update_fields=['seen'])

        return Response(MISTicketDetailSerializer(ticket).data)


class MISTicketCancelView(APIView):
    """POST /api/mis/tickets/{pk}/cancel/ — allow the owner to cancel a ticket."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            ticket = MISTicket.objects.get(pk=pk, employee=request.user)
        except MISTicket.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if ticket.status not in ('OPEN', 'RESOLVED'):
            return Response(
                {'detail': 'Only open or resolved tickets can be cancelled.'},
                status=status.HTTP_409_CONFLICT,
            )

        ticket.status = 'CLOSED'
        if not ticket.resolved_at:
            ticket.resolved_at = timezone.now()
        ticket.save(update_fields=['status', 'resolved_at', 'updated_at'])

        Notification.objects.create(
            recipient=ticket.employee,
            notification_scope='specific_user',
            notification_type='mis_ticket_updated',
            title=f'Ticket {ticket.ticket_number} Cancelled',
            message=f'Your MIS ticket {ticket.ticket_number} has been cancelled.',
            module='mis-ticket',
            related_object_id=ticket.pk,
        )

        ActivityLog.objects.create(
            user=request.user,
            username=request.user.username,
            employee_id=getattr(request.user, 'idnumber', ''),
            module='MIS Ticket',
            action=f'Cancelled ticket {ticket.ticket_number}',
            http_method='POST',
            endpoint=request.path,
        )

        return Response(MISTicketListSerializer(ticket).data, status=status.HTTP_200_OK)


class MISUnseenCountView(APIView):
    """GET /api/mis/tickets/unseen-count — count of tickets where seen=False for the user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = MISTicket.objects.filter(employee=request.user, seen=False).count()
        return Response({'count': count})


class MISTicketPDFView(APIView):
    """GET /api/mis/tickets/{pk}/pdf/ — stream reportlab PDF for user's own ticket."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            ticket = MISTicket.objects.select_related('diagnosis').get(pk=pk, employee=request.user)
        except MISTicket.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Server-side guard: PDF only available for diagnosed + terminal tickets (audit fix H4)
        if not hasattr(ticket, 'diagnosis') or ticket.status not in ('RESOLVED', 'CLOSED'):
            return Response(
                {'detail': 'PDF is only available after the technician has submitted a diagnosis and the ticket is resolved.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        pdf_bytes = _generate_pdf(ticket)
        safe_number = re.sub(r'[^\w\-]', '', ticket.ticket_number)
        response = FileResponse(
            io.BytesIO(pdf_bytes),
            content_type='application/pdf',
        )
        response['Content-Disposition'] = f'attachment; filename="{safe_number}.pdf"'
        return response


# ── Chat Views ────────────────────────────────────────────────────────────────

class MISChatSessionView(APIView):
    """GET /api/mis/chat/session/ — get or create the user's chat session."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        session, _ = MISChatSession.objects.get_or_create(employee=request.user)
        return Response(MISChatSessionSerializer(session).data)


class MISChatHistoryView(APIView):
    """GET /api/mis/chat/messages/?session_id=<uuid> — last 50 messages."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        session_id = request.query_params.get('session_id')
        if not session_id:
            return Response({'detail': 'session_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate ownership (audit fix H3)
        try:
            session = MISChatSession.objects.get(session_id=session_id, employee=request.user)
        except MISChatSession.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        messages = session.messages.order_by('-created_at')[:50]
        messages = list(reversed(messages))  # chronological order for display
        serializer = MISChatMessageSerializer(messages, many=True)
        return Response(serializer.data)


class MISChatWebhookRelayView(APIView):
    """POST /api/mis/chat/relay/

    Accepts only `message` from the client. All identity fields are assembled
    server-side from request.user (audit fix C6).  Relays to n8n, saves both
    messages, and parses [TICKET_DATA] to auto-create a MISTicket.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'mis_chat'

    def post(self, request):
        message_text = (request.data.get('message') or '').strip()
        if not message_text:
            return Response({'detail': 'message is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Sanitize input (server-side — audit fix M5)
        message_text = _sanitize(message_text)

        # Build identity payload server-side (audit fix C3, C6)
        user = request.user
        full_name = _full_name(user)
        employee_id = getattr(user, 'idnumber', '') or str(user.pk)
        department = _get_department(user)

        session, _ = MISChatSession.objects.get_or_create(employee=user)

        # Save user message
        user_msg = MISChatMessage.objects.create(
            session=session,
            sender=user,
            message=message_text,
            is_ai=False,
        )

        # Relay to n8n (audit fix H1: URL from settings)
        n8n_url = getattr(settings, 'N8N_WEBHOOK_URL', '')
        if not n8n_url:
            ai_fallback = (
                "I'm currently unable to connect to the support system. "
                "Please try again in a few moments or contact IT Support directly."
            )
            ai_msg = MISChatMessage.objects.create(
                session=session,
                sender=None,
                message=ai_fallback,
                is_ai=True,
                is_ticket_creation=False,
            )
            MISChatSession.objects.filter(pk=session.pk).update(last_active=timezone.now())
            return Response({
                'user_message': MISChatMessageSerializer(user_msg).data,
                'ai_message': MISChatMessageSerializer(ai_msg).data,
            }, status=status.HTTP_200_OK)

        payload = {
            'message': message_text,
            'sessionId': str(session.session_id),
            'name': full_name,
            'employeeId': employee_id,
            'department': department,
        }

        try:
            n8n_resp = http_requests.post(n8n_url, json=payload, timeout=30)
            n8n_resp.raise_for_status()
            ai_text = n8n_resp.text.strip()
        except Exception:
            # n8n unavailable — save a graceful fallback reply instead of 503 (audit fix L2)
            ai_fallback = (
                "I'm currently experiencing technical difficulties connecting to the support system. "
                "Please try again in a few moments or contact IT Support directly."
            )
            ai_msg = MISChatMessage.objects.create(
                session=session,
                sender=None,
                message=ai_fallback,
                is_ai=True,
                is_ticket_creation=False,
            )
            MISChatSession.objects.filter(pk=session.pk).update(last_active=timezone.now())
            return Response({
                'user_message': MISChatMessageSerializer(user_msg).data,
                'ai_message': MISChatMessageSerializer(ai_msg).data,
            }, status=status.HTTP_200_OK)

        # Parse [TICKET_DATA] block (audit fix H7: wrapped in try/except)
        ticket_match = _TICKET_DATA_RE.search(ai_text)
        created_ticket = None
        is_ticket_creation = False

        if ticket_match:
            is_ticket_creation = True
            raw_json = ticket_match.group(1).strip()
            try:
                ticket_data = json.loads(raw_json)
                created_ticket = _create_ticket_from_ai(ticket_data, user, full_name, department)
            except (json.JSONDecodeError, KeyError, IntegrityError):
                # Parsing failure — still deliver the AI text, just don't create a ticket
                is_ticket_creation = False

            # Strip the raw block from the display text
            ai_text = _TICKET_DATA_RE.sub('', ai_text).strip()

        # Save AI response message — is_ticket_creation on THIS message (audit fix M2)
        ai_msg = MISChatMessage.objects.create(
            session=session,
            sender=None,
            message=ai_text,
            is_ai=True,
            is_ticket_creation=is_ticket_creation,
        )

        # Touch session's last_active
        MISChatSession.objects.filter(pk=session.pk).update(last_active=timezone.now())

        response_data = {
            'user_message': MISChatMessageSerializer(user_msg).data,
            'ai_message': MISChatMessageSerializer(ai_msg).data,
        }
        if created_ticket:
            response_data['ticket'] = MISTicketListSerializer(created_ticket).data

        return Response(response_data, status=status.HTTP_200_OK)


# ── Admin Views ───────────────────────────────────────────────────────────────

class AdminMISTicketListView(APIView):
    """GET /api/mis/admin/tickets/ — paginated, searchable, filterable, sortable."""

    permission_classes = [IsMISAdmin]

    _SORT_MAP = {
        'ticket_number': 'ticket_number',
        'employee_name': 'employee_name',
        'department':    'department',
        'device_name':   'device_name',
        'category':      'category',
        'status':        'status',
        'created_at':    'created_at',
        'progress_note': 'diagnosis__progress_note',
    }

    def get(self, request):
        qs = MISTicket.objects.select_related('diagnosis', 'device').exclude(status='CANCELLED')
        qs = qs.annotate(
            status_rank=Case(
                When(status='OPEN', then=0),
                When(status='IN_PROGRESS', then=1),
                When(status='RESOLVED', then=2),
                When(status='CLOSED', then=3),
                default=99,
                output_field=IntegerField(),
            )
        )

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(ticket_number__icontains=search)
                | Q(employee_name__icontains=search)
                | Q(department__icontains=search)
                | Q(device_name__icontains=search)
                | Q(problem__icontains=search)
            )

        status_filter = request.query_params.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)

        category_filter = request.query_params.get('category', '').strip()
        if category_filter:
            qs = qs.filter(category=category_filter)

        priority_filter = request.query_params.get('priority', '').strip()
        if priority_filter:
            qs = qs.filter(priority=priority_filter)

        sort_by  = request.query_params.get('sort_by', 'created_at').strip()
        default_sort_dir = 'asc' if sort_by == 'created_at' else 'desc'
        sort_dir = request.query_params.get('sort_dir', default_sort_dir).strip()
        sort_field = self._SORT_MAP.get(sort_by, 'created_at')
        if sort_dir == 'asc':
            qs = qs.order_by('status_rank', sort_field)
        else:
            qs = qs.order_by('status_rank', f'-{sort_field}')

        page = max(1, int(request.query_params.get('page', 1)))
        page_size = min(50, max(1, int(request.query_params.get('page_size', 20))))
        total = qs.count()
        offset = (page - 1) * page_size
        items = qs[offset: offset + page_size]
        serializer = AdminMISTicketListSerializer(items, many=True)
        return Response({'results': serializer.data, 'count': total, 'page': page, 'page_size': page_size})


class AdminMISTicketDetailView(APIView):
    """GET /api/mis/admin/tickets/{pk}/"""

    permission_classes = [IsMISAdmin]

    def get(self, request, pk):
        try:
            ticket = MISTicket.objects.select_related('diagnosis').get(pk=pk)
        except MISTicket.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(AdminMISTicketListSerializer(ticket).data)


class AdminMISDiagnoseView(APIView):
    """POST/PATCH /api/mis/admin/tickets/{pk}/diagnose/

    Creates or updates the diagnosis for a ticket, updates ticket status,
    sets resolved_at when appropriate, and notifies the employee.
    """

    permission_classes = [IsMISAdmin]

    def _handle(self, request, pk):
        try:
            ticket = MISTicket.objects.select_related('diagnosis').get(pk=pk)
        except MISTicket.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        required_fields = ['diagnosis', 'action_taken', 'possible_reason', 'status']
        errors = {f: ['This field is required.'] for f in required_fields if not str(data.get(f) or '').strip()}
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        new_status = data['status']
        STATUS_MAPPING = {
            'FOR_ASSESSMENT': 'IN_PROGRESS',
            'PARTS_REQUIRED': 'IN_PROGRESS',
            'PENDING_USER_ACTION': 'IN_PROGRESS',
            'FIXED_MONITORING': 'RESOLVED',
            'COMPLETED': 'CLOSED',
        }
        valid_statuses = {v for v, _ in MISTicket.STATUS_CHOICES} | set(STATUS_MAPPING.keys())
        if new_status not in valid_statuses:
            return Response({'status': ['Invalid status.']}, status=status.HTTP_400_BAD_REQUEST)

        mapped_status = STATUS_MAPPING.get(new_status, new_status)
        admin_user = request.user
        technician_name = _full_name(admin_user)

        with transaction.atomic():
            diag, _ = MISTicketDiagnosis.objects.update_or_create(
                ticket=ticket,
                defaults={
                    'technician': admin_user,
                    'technician_name': technician_name,
                    'progress_note': data.get('progress_note', '').strip(),
                    'diagnosis': data['diagnosis'].strip(),
                    'action_taken': data['action_taken'].strip(),
                    'possible_reason': data['possible_reason'].strip(),
                    'recommendation': data.get('recommendation', '').strip(),
                    'requires_immediate_action': bool(data.get('requires_immediate_action', False)),
                    'recommended_parts': data.get('recommended_parts', '').strip(),
                },
            )

            # Update ticket status; set resolved_at on first resolution (audit fix M1)
            ticket.status = mapped_status
            # Mark unseen so the requestor's sidebar badge activates
            ticket.seen = False
            if mapped_status in ('RESOLVED', 'CLOSED') and not ticket.resolved_at:
                ticket.resolved_at = timezone.now()
            ticket.save(update_fields=['status', 'seen', 'resolved_at', 'updated_at'])

        # Notify the employee using the optional MIS note when available
        progress_note = diag.progress_note
        notification_msg = progress_note or (
            f'Your MIS ticket {ticket.ticket_number} has been updated. '
            f'Status: {ticket.get_status_display()}.'
        )

        Notification.objects.create(
            recipient=ticket.employee,
            notification_scope='specific_user',
            notification_type='mis_ticket_updated',
            title=f'Ticket {ticket.ticket_number} Updated',
            message=notification_msg,
            module='mis-ticket',
            related_object_id=ticket.pk,
        )

        ActivityLog.objects.create(
            user=admin_user,
            username=admin_user.username,
            employee_id=getattr(admin_user, 'idnumber', ''),
            module='MIS Ticket',
            action=f'Submitted diagnosis for ticket {ticket.ticket_number} (status → {new_status})',
            http_method=request.method,
            endpoint=request.path,
        )

        return Response(AdminMISTicketListSerializer(ticket).data, status=status.HTTP_200_OK)

    def post(self, request, pk):
        return self._handle(request, pk)

    def patch(self, request, pk):
        return self._handle(request, pk)


class AdminMISStatsView(APIView):
    """GET /api/mis/admin/stats/ — aggregated counts and month-over-month comparison."""

    permission_classes = [IsMISAdmin]

    def get(self, request):
        now = timezone.now()
        base = MISTicket.objects.exclude(status='CANCELLED')

        current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        previous_month = (current_month_start - datetime.timedelta(days=1)).replace(day=1)
        current_month_end = (current_month_start + datetime.timedelta(days=32)).replace(day=1)

        monthly_base = base.filter(created_at__gte=current_month_start, created_at__lt=current_month_end)
        previous_month_base = base.filter(created_at__gte=previous_month, created_at__lt=current_month_start)

        def counts(qs):
            return {
                'total': qs.count(),
                'open': qs.filter(status='OPEN').count(),
                'in_progress': qs.filter(status='IN_PROGRESS').count(),
                'resolved': qs.filter(status='RESOLVED').count(),
                'closed': qs.filter(status='CLOSED').count(),
            }

        def average_resolution(qs):
            expr = ExpressionWrapper(F('resolved_at') - F('created_at'), output_field=DurationField())
            avg_duration = qs.filter(status='RESOLVED', resolved_at__isnull=False).aggregate(avg=Avg(expr))['avg']
            if not avg_duration:
                return 0.0
            return round(avg_duration.total_seconds() / 86400, 1)

        current_month_stats = counts(monthly_base)
        previous_month_stats = counts(previous_month_base)

        fy_start_year = now.year if now.month >= 5 else now.year - 1
        fy_start = datetime.datetime(fy_start_year, 5, 1, tzinfo=datetime.timezone.utc)
        fy_end = datetime.datetime(fy_start_year + 1, 5, 1, tzinfo=datetime.timezone.utc)
        resolved_fy = base.filter(status='RESOLVED', resolved_at__isnull=False, resolved_at__gte=fy_start, resolved_at__lt=fy_end)

        return Response({
            'by_status':   list(base.values('status').annotate(count=Count('id')).order_by('status')),
            'by_category': list(base.values('category').annotate(count=Count('id')).order_by('-count')),
            'by_priority': list(base.values('priority').annotate(count=Count('id')).order_by('-count')),
            'total':       current_month_stats['total'],
            'open':        current_month_stats['open'],
            'in_progress': current_month_stats['in_progress'],
            'resolved':    current_month_stats['resolved'],
            'closed':      current_month_stats['closed'],
            'prev_total':  previous_month_stats['total'],
            'prev_open':   previous_month_stats['open'],
            'prev_in_progress': previous_month_stats['in_progress'],
            'prev_resolved': previous_month_stats['resolved'],
            'prev_closed': previous_month_stats['closed'],
            'avg_resolution_time': average_resolution(resolved_fy),
            'prev_avg_resolution_time': average_resolution(previous_month_base),
        })


class AdminMISChartView(APIView):
    """GET /api/mis/admin/chart — ticket volume over time (excludes CANCELLED).

    Params:
      view       : fiscal | monthly | weekly  (default: fiscal)
      fy_start   : fiscal year start year (e.g. 2026 = May 2026-Apr 2027, default: current)
      month_year : YYYY-M string for monthly view (default: current month)
      week_start : ISO date string for weekly view (default: current week Mon)
    """

    permission_classes = [IsMISAdmin]

    def get(self, request):
        now = timezone.now()
        view_type = request.GET.get('view', 'fiscal')
        base_qs = MISTicket.objects.exclude(status='CANCELLED')

        current_fy = now.year if now.month >= 5 else now.year - 1
        try:
            fy_start_year = int(request.GET.get('fy_start', current_fy))
        except (ValueError, TypeError):
            fy_start_year = current_fy

        fy_start = datetime.datetime(fy_start_year, 5, 1, tzinfo=datetime.timezone.utc)
        fy_end = datetime.datetime(fy_start_year + 1, 5, 1, tzinfo=datetime.timezone.utc)

        def normalize_rows(rows, label_key, key_transform=None):
            lookup = {}
            for row in rows:
                key = row[label_key]
                if key_transform is not None:
                    key = key_transform(key)
                status = row['status']
                if key not in lookup:
                    lookup[key] = {'OPEN': 0, 'IN_PROGRESS': 0, 'RESOLVED': 0, 'CLOSED': 0}
                lookup[key][status] = row['count']
            return lookup

        if view_type == 'fiscal':
            rows = (
                base_qs
                .filter(created_at__gte=fy_start, created_at__lt=fy_end)
                .annotate(period=TruncMonth('created_at'))
                .values('period', 'status')
                .annotate(count=Count('id'))
                .order_by('period', 'status')
            )
            lookup = normalize_rows(
                rows,
                'period',
                key_transform=lambda value: value.strftime('%Y-%m') if value else '',
            )
            MONTH_LABELS = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr']
            data = []
            for i, label in enumerate(MONTH_LABELS):
                month = 5 + i if i < 8 else i - 7
                year = fy_start_year if month >= 5 else fy_start_year + 1
                key = f'{year}-{month:02d}'
                data.append({
                    'label': label,
                    'OPEN': lookup.get(key, {}).get('OPEN', 0),
                    'IN_PROGRESS': lookup.get(key, {}).get('IN_PROGRESS', 0),
                    'RESOLVED': lookup.get(key, {}).get('RESOLVED', 0),
                    'CLOSED': lookup.get(key, {}).get('CLOSED', 0),
                })
            return Response({'view': 'fiscal', 'fy_start': fy_start_year, 'data': data})

        if view_type == 'monthly':
            month_year_str = request.GET.get('month_year', f'{now.year}-{now.month}')
            try:
                parts = month_year_str.split('-')
                m_year, m_month = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                m_year, m_month = now.year, now.month
            m_start = datetime.datetime(m_year, m_month, 1, tzinfo=datetime.timezone.utc)
            if m_month == 12:
                m_end = datetime.datetime(m_year + 1, 1, 1, tzinfo=datetime.timezone.utc)
            else:
                m_end = datetime.datetime(m_year, m_month + 1, 1, tzinfo=datetime.timezone.utc)
            rows = (
                base_qs
                .filter(created_at__gte=m_start, created_at__lt=m_end)
                .annotate(period=TruncDate('created_at'))
                .values('period', 'status')
                .annotate(count=Count('id'))
                .order_by('period', 'status')
            )
            lookup = normalize_rows(rows, 'period')
            days_in_month = calendar.monthrange(m_year, m_month)[1]
            data = []
            for d in range(1, days_in_month + 1):
                key = datetime.date(m_year, m_month, d)
                row = lookup.get(key, {})
                data.append({
                    'label': str(d),
                    'OPEN': row.get('OPEN', 0),
                    'IN_PROGRESS': row.get('IN_PROGRESS', 0),
                    'RESOLVED': row.get('RESOLVED', 0),
                    'CLOSED': row.get('CLOSED', 0),
                })
            return Response({'view': 'monthly', 'fy_start': fy_start_year, 'data': data})

        if view_type == 'weekly':
            week_start_str = request.GET.get('week_start', '')
            try:
                ws = datetime.datetime.strptime(week_start_str, '%Y-%m-%d')
                week_start = ws.replace(tzinfo=datetime.timezone.utc)
            except (ValueError, AttributeError):
                today = now.date()
                monday = today - datetime.timedelta(days=today.weekday())
                week_start = datetime.datetime(monday.year, monday.month, monday.day, tzinfo=datetime.timezone.utc)
            week_end = week_start + datetime.timedelta(days=7)
            rows = (
                base_qs
                .filter(created_at__gte=week_start, created_at__lt=week_end)
                .annotate(period=TruncDate('created_at'))
                .values('period', 'status')
                .annotate(count=Count('id'))
                .order_by('period', 'status')
            )
            lookup = normalize_rows(rows, 'period')
            DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            data = []
            for i in range(7):
                day_date = (week_start + datetime.timedelta(days=i)).date()
                row = lookup.get(day_date, {})
                data.append({
                    'label': DAY_LABELS[i],
                    'OPEN': row.get('OPEN', 0),
                    'IN_PROGRESS': row.get('IN_PROGRESS', 0),
                    'RESOLVED': row.get('RESOLVED', 0),
                    'CLOSED': row.get('CLOSED', 0),
                })
            return Response({'view': 'weekly', 'fy_start': fy_start_year, 'data': data})

        return Response({'detail': 'Invalid view type.'}, status=status.HTTP_400_BAD_REQUEST)


class AdminMISTicketPDFView(APIView):
    """GET /api/mis/admin/tickets/{pk}/pdf/ — PDF for any ticket."""

    permission_classes = [IsMISAdmin]

    def get(self, request, pk):
        try:
            ticket = MISTicket.objects.select_related('diagnosis').get(pk=pk)
        except MISTicket.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not hasattr(ticket, 'diagnosis') or ticket.status not in ('RESOLVED', 'CLOSED'):
            return Response(
                {'detail': 'PDF is only available for resolved/closed tickets with a diagnosis.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        pdf_bytes = _generate_pdf(ticket)
        safe_number = re.sub(r'[^\w\-]', '', ticket.ticket_number)
        response = FileResponse(io.BytesIO(pdf_bytes), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{safe_number}.pdf"'

        # Explicit activity log for PDF download (audit fix L6)
        from activityLog.models import ActivityLog
        ActivityLog.objects.create(
            user=request.user,
            username=request.user.username,
            employee_id=getattr(request.user, 'idnumber', ''),
            module='MIS Ticket',
            action=f'Downloaded PDF for ticket {ticket.ticket_number}',
            http_method='GET',
            endpoint=request.path,
        )

        return response


# ── PDF Generation ────────────────────────────────────────────────────────────

def _safe_text(value: str) -> str:
    """Encode/replace characters unsupported by reportlab (audit fix M6)."""
    if not value:
        return ''
    return str(value).encode('latin-1', errors='replace').decode('latin-1')


def _generate_pdf(ticket: MISTicket) -> bytes:  # noqa: C901
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    PAGE_W, _PAGE_H = A4
    L_MARGIN = R_MARGIN = 2.0 * cm
    CONTENT_W = PAGE_W - L_MARGIN - R_MARGIN
    COL_HALF = CONTENT_W / 2.0
    SECTION_INDENT = 1.6 * cm

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=R_MARGIN,
        leftMargin=L_MARGIN,
        topMargin=2.5 * cm,
        bottomMargin=2.0 * cm,
    )

    # ── Styles (Helvetica = closest PDF built-in to system sans-serif) ─────────
    company_style = ParagraphStyle(
        'company',
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#111827'),
        spaceAfter=3,
    )
    subtitle_style = ParagraphStyle(
        'subtitle',
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#6b7280'),
        spaceAfter=2,
    )
    section_style = ParagraphStyle(
        'section',
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor('#374151'),
        spaceBefore=10,
        spaceAfter=6,
        leftIndent=SECTION_INDENT,
    )
    label_style = ParagraphStyle(
        'label',
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=9,
        textColor=colors.HexColor('#9ca3af'),
        spaceAfter=6,
        spaceBefore=10,
    )
    value_style = ParagraphStyle(
        'value',
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor('#111827'),
        spaceAfter=6,
        spaceBefore=10,
    )
    long_label_style = ParagraphStyle(
        'long_label',
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=9,
        textColor=colors.HexColor('#9ca3af'),
        spaceBefore=10,
        spaceAfter=6,
    )
    long_value_style = ParagraphStyle(
        'long_value',
        fontName='Helvetica',
        fontSize=8.5,
        leading=13,
        textColor=colors.HexColor('#111827'),
        spaceAfter=6,
        spaceBefore=2,
    )

    # ── Helpers ────────────────────────────────────────────────────────────────
    # Build grid by separating labels into their own row and values into the next row.
    # This guarantees left-column and right-column labels always sit at exactly the
    # same vertical position — no zigzag regardless of value length.
    def make_grid(pairs: list[tuple[str, str]]) -> Table:
        rows = []
        i = 0
        while i < len(pairs):
            ll, lv = pairs[i]
            if i + 1 < len(pairs):
                rl, rv = pairs[i + 1]
            else:
                rl, rv = '', ''
            # Row A: both labels side by side
            rows.append([
                Paragraph(ll.upper(), label_style),
                Paragraph(rl.upper(), label_style),
            ])
            # Row B: both values side by side
            rows.append([
                Paragraph(_safe_text(lv or '\u2014'), value_style),
                Paragraph(_safe_text(rv or '\u2014') if rl else '', value_style),
            ])
            i += 2

        style_cmds = [
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]
        # Label rows (0, 2, 4 …): add space above to separate field groups
        for r in range(0, len(rows), 2):
            style_cmds.append(('TOPPADDING', (0, r), (-1, r), 10 if r > 0 else 4))
        # Value rows (1, 3, 5 …): small gap below label
        for r in range(1, len(rows), 2):
            style_cmds.append(('TOPPADDING', (0, r), (-1, r), 2))
            style_cmds.append(('BOTTOMPADDING', (0, r), (-1, r), 2))

        tbl = Table(rows, colWidths=[COL_HALF, COL_HALF])
        tbl.setStyle(TableStyle(style_cmds))
        return tbl

    def section_header(title: str) -> list:
        return [Paragraph(title, section_style)]

    def long_field(label: str, value: str) -> list:
        return [
            Paragraph(label.upper(), long_label_style),
            Paragraph(_safe_text(value or '\u2014'), long_value_style),
        ]

    def indent_block(flowables: list) -> Table:
        return Table(
            [[flowables]],
            colWidths=[CONTENT_W - SECTION_INDENT],
            style=TableStyle([
                ('LEFTPADDING', (0, 0), (0, 0), SECTION_INDENT),
                ('RIGHTPADDING', (0, 0), (0, 0), 0),
                ('TOPPADDING', (0, 0), (0, 0), 0),
                ('BOTTOMPADDING', (0, 0), (0, 0), 0),
                ('VALIGN', (0, 0), (0, 0), 'TOP'),
            ]),
        )

    # ── Data ───────────────────────────────────────────────────────────────────
    diag = getattr(ticket, 'diagnosis', None)

    ticket_pairs = [
        ('Ticket Number', ticket.ticket_number),
        ('Date Filed', ticket.created_at.strftime('%B %d, %Y')),
        ('Requestor', ticket.employee_name),
        ('Department', ticket.department or ''),
        ('Device', ticket.device_name or ''),
        ('Category', ticket.get_category_display()),
        ('Subject', getattr(ticket, 'subject', '') or ''),
        ('Priority', ticket.get_priority_display()),
        ('Status', ticket.get_status_display()),
        ('Resolved At', ticket.resolved_at.strftime('%B %d, %Y') if ticket.resolved_at else ''),
    ]

    # ── Story ──────────────────────────────────────────────────────────────────
    story: list = [
        Paragraph('RYONAN ELECTRIC PHILIPPINES CORPORATION', company_style),
        Paragraph('MIS Support Ticket Report', subtitle_style),
        Spacer(1, 0.3 * cm),
    ]

    story += section_header('Ticket Information')
    story.append(indent_block([make_grid(ticket_pairs)]))
    story.append(indent_block(long_field('Problem Description', ticket.problem)))

    if diag:
        story += section_header('Technician Diagnosis')
        diag_pairs = [
            ('Technician', diag.technician_name or ''),
            ('Diagnosed At', diag.diagnosed_at.strftime('%B %d, %Y') if diag.diagnosed_at else ''),
        ]
        story.append(indent_block([make_grid(diag_pairs)]))
        story.append(indent_block(long_field('Diagnosis', diag.diagnosis)))
        story.append(indent_block(long_field('Action Taken', diag.action_taken)))
        story.append(indent_block(long_field('Possible Reason', diag.possible_reason)))
        if diag.recommendation:
            story.append(indent_block(long_field('Recommendation', diag.recommendation)))
        if diag.progress_note:
            story.append(indent_block(long_field('Note', diag.progress_note)))

    doc.build(story)
    return buffer.getvalue()


# ── Notification helpers ──────────────────────────────────────────────────────

def _notify_mis_users_new_ticket(ticket: MISTicket, requestor_name: str) -> None:
    """Send an in-app notification to all active MIS personnel when a ticket is created."""
    User = get_user_model()
    mis_users = User.objects.filter(mis=True, active=True)
    notifications = [
        Notification(
            recipient=mis_user,
            notification_scope='specific_user',
            notification_type='mis_ticket_created',
            title=f'New MIS Ticket: {ticket.ticket_number}',
            message=(
                f'{requestor_name} submitted a new ticket '
                f'[{ticket.get_category_display()}]: {ticket.subject or ticket.problem[:80]}'
            ),
            module='mis-ticket',
            related_object_id=ticket.pk,
        )
        for mis_user in mis_users
    ]
    Notification.objects.bulk_create(notifications, ignore_conflicts=True)


# ── Ticket creation helper ────────────────────────────────────────────────────

def _create_ticket_from_ai(
    data: dict,
    user,
    full_name: str,
    department: str,
) -> MISTicket | None:
    """Create a MISTicket from the JSON block extracted from the AI response."""
    if not department:
        return None

    # Validate category
    valid_categories = {v for v, _ in MISTicket.CATEGORY_CHOICES}
    category = str(data.get('category', 'other')).lower()
    if category not in valid_categories:
        category = 'other'

    valid_priorities = {v for v, _ in MISTicket.PRIORITY_CHOICES}
    priority = str(data.get('priority', 'medium')).lower()
    if priority not in valid_priorities:
        priority = 'medium'

    ticket_number = MISTicket.generate_ticket_number()

    ticket = MISTicket.objects.create(
        ticket_number=ticket_number,
        employee=user,
        employee_name=full_name,
        department=department,
        device_name=str(data.get('device_name', '')).strip()[:100],
        category=category,
        priority=priority,
        problem=str(data.get('problem', '')).strip()[:2000],
        status='OPEN',
        seen=True,
    )

    # Notify employee of their own ticket creation
    Notification.objects.create(
        recipient=user,
        notification_scope='specific_user',
        notification_type='mis_ticket_created',
        title=f'Ticket {ticket_number} Created',
        message=f'Your support ticket {ticket_number} has been submitted and is now OPEN.',
        module='mis-ticket',
        related_object_id=ticket.pk,
    )

    # Notify all MIS personnel
    _notify_mis_users_new_ticket(ticket, full_name)

    ActivityLog.objects.create(
        user=user,
        username=user.username,
        employee_id=getattr(user, 'idnumber', ''),
        module='MIS Ticket',
        action=f'Created ticket {ticket_number} via AI assistant',
        http_method='POST',
        endpoint='/api/mis/chat/relay',
    )

    return ticket

