from django.urls import path

from .views import (
    AdminAllApproversView,
    ApproverListView,
    AvatarUpdateView,
    BasicInfoUpdateView,
    ChangePasswordView,
    ChildRecordsUpdateView,
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

urlpatterns = [
    # ── Read ──────────────────────────────────────────────────────────────────
    path('me',                 ProfileGetView.as_view(),              name='profile-me'),

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
    path('<str:idnumber>/admin', EmployeeProfileAdminView.as_view(),          name='profile-admin-view'),
    path('<str:idnumber>/admin/work-info', EmployeeProfileAdminWorkInfoView.as_view(), name='profile-admin-work-info'),]

