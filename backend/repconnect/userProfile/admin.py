from django.contrib import admin

from .models import (
    ChildRecord,
    EducationRecord,
    EmergencyContact,
    FamilyBackground,
    PersonalInformation,
    PresentAddress,
    ProvincialAddress,
    Skill,
    workInformation,
)


@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display  = ('employee', 'name')
    search_fields = ('employee__idnumber', 'name')


@admin.register(workInformation)
class WorkInformationAdmin(admin.ModelAdmin):
    list_display  = ('employee', 'department', 'position', 'employment_type', 'date_hired')
    list_select_related = True
    search_fields = ('employee__idnumber', 'employee__firstname', 'employee__lastname')
    autocomplete_fields = ('employee', 'approver')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(PersonalInformation)
class PersonalInformationAdmin(admin.ModelAdmin):
    list_display  = ('employee', 'gender', 'birth_date', 'contact_number')
    search_fields = ('employee__idnumber', 'employee__firstname', 'employee__lastname')


@admin.register(PresentAddress)
class PresentAddressAdmin(admin.ModelAdmin):
    list_display  = ('employee', 'country', 'province', 'city')
    search_fields = ('employee__idnumber',)


@admin.register(ProvincialAddress)
class ProvincialAddressAdmin(admin.ModelAdmin):
    list_display  = ('employee', 'same_as_present', 'province', 'city')
    search_fields = ('employee__idnumber',)


@admin.register(EmergencyContact)
class EmergencyContactAdmin(admin.ModelAdmin):
    list_display  = ('employee', 'name', 'relationship', 'contact_number')
    search_fields = ('employee__idnumber', 'name')


@admin.register(FamilyBackground)
class FamilyBackgroundAdmin(admin.ModelAdmin):
    list_display  = ('employee', 'mother_name', 'father_name', 'spouse_name')
    search_fields = ('employee__idnumber',)


@admin.register(ChildRecord)
class ChildRecordAdmin(admin.ModelAdmin):
    list_display  = ('employee', 'name')
    search_fields = ('employee__idnumber', 'name')


@admin.register(EducationRecord)
class EducationRecordAdmin(admin.ModelAdmin):
    list_display  = ('employee', 'institution', 'degree', 'year_attended')
    search_fields = ('employee__idnumber', 'institution')