from django.urls import path

from .views import (
    AdminAllApproversView,
    ApproverListView,
    ApproverOverviewView,
    AvatarUpdateView,
    BasicInfoUpdateView,
    ChangePasswordView,
    ChildRecordsUpdateView,
    DashboardOverviewView,
    EducationRecordsUpdateView,
    EmergencyContactUpdateView,
    EmployeeProfileAdminView,
    EmployeeProfileAdminWorkInfoView,
    FamilyBackgroundUpdateView,
    PersonalInfoUpdateView,
    PresentAddressUpdateView,
    ProfileGetView,
    ProvincialAddressUpdateView,
    SkillsUpdateView,
    WorkInfoUserUpdateView,
)
from .admin_views import (
    AdminOverviewView,
    SystemErrorLogListView,
    SystemErrorLogResolveView,
)
from .hr_views import HROverviewView
from .accounting_views import AccountingOverviewView

urlpatterns = [
    # ── Read ──────────────────────────────────────────────────────────────────
    path('me',                   ProfileGetView.as_view(),              name='profile-me'),
    path('dashboard-overview',   DashboardOverviewView.as_view(),       name='profile-dashboard-overview'),
    path('approver-overview',    ApproverOverviewView.as_view(),        name='profile-approver-overview'),
    # ── Role dashboards ───────────────────────────────────────────────────────
    path('admin-overview',       AdminOverviewView.as_view(),           name='profile-admin-overview'),
    path('hr-overview',          HROverviewView.as_view(),              name='profile-hr-overview'),
    path('accounting-overview',  AccountingOverviewView.as_view(),      name='profile-accounting-overview'),
    # ── System error log ──────────────────────────────────────────────────────
    path('system-errors',                    SystemErrorLogListView.as_view(),    name='system-errors-list'),
    path('system-errors/<int:pk>/resolve',   SystemErrorLogResolveView.as_view(), name='system-errors-resolve'),

    # ── Personal information ───────────────────────────────────────────────────
    path('basic-info',         BasicInfoUpdateView.as_view(),         name='profile-basic-info'),
    path('personal-info',      PersonalInfoUpdateView.as_view(),      name='profile-personal-info'),
    path('present-address',    PresentAddressUpdateView.as_view(),    name='profile-present-address'),
    path('provincial-address', ProvincialAddressUpdateView.as_view(), name='profile-provincial-address'),
    path('emergency-contact',  EmergencyContactUpdateView.as_view(),  name='profile-emergency-contact'),

    # ── Background & education ─────────────────────────────────────────────────
    path('family-background',  FamilyBackgroundUpdateView.as_view(),  name='profile-family-background'),
    path('children',           ChildRecordsUpdateView.as_view(),      name='profile-children'),
    path('education',          EducationRecordsUpdateView.as_view(),  name='profile-education'),

    # ── Work information ───────────────────────────────────────────────────────
    path('work-info',          WorkInfoUserUpdateView.as_view(),      name='profile-work-info'),
    path('approvers',          ApproverListView.as_view(),            name='profile-approvers'),
    path('admin-approvers',    AdminAllApproversView.as_view(),       name='profile-admin-approvers'),

    # ── Skills ────────────────────────────────────────────────────────────────
    path('skills',             SkillsUpdateView.as_view(),            name='profile-skills'),

    # ── Auth & media ───────────────────────────────────────────────────────────
    path('avatar',             AvatarUpdateView.as_view(),            name='profile-avatar'),
    path('change-password',    ChangePasswordView.as_view(),          name='profile-change-password'),
    # ── Admin read-only employee profile ──────────────────────────────────────
    path('<str:idnumber>/admin',           EmployeeProfileAdminView.as_view(),         name='profile-admin-view'),
    path('<str:idnumber>/admin/work-info', EmployeeProfileAdminWorkInfoView.as_view(), name='profile-admin-work-info'),
]

