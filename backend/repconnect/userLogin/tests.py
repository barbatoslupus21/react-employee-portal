import datetime
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from openpyxl import Workbook
from rest_framework import status
from rest_framework.test import APIClient

from generalsettings.models import Department, EmploymentType, Line, Office, Position, Shift
from userProfile.models import workInformation


class EmployeeImportDateHiredTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.admin_user = self.user_model.objects.create_user(
            idnumber='ADM001',
            username='ADM001',
            password='Password123!',
            firstname='Admin',
            lastname='User',
            admin=True,
            active=True,
        )
        self.client.force_authenticate(user=self.admin_user)

        self.office = Office.objects.create(name='Main Office')
        self.shift = Shift.objects.create(
            name='Day Shift',
            start_time=datetime.time(8, 0),
            end_time=datetime.time(17, 0),
        )
        self.department = Department.objects.create(name='IT', office=self.office)
        self.line = Line.objects.create(name='Line A', department=self.department)
        self.employment_type = EmploymentType.objects.create(name='Regular')
        self.position = Position.objects.create(name='Programmer', level_of_approval=1)

    def _build_employee_import_file(self, hired_value):
        wb = Workbook()
        ws = wb.active
        ws.append([
            'ID Number', 'First Name', 'Last Name', 'Email', 'Department',
            'Line', 'Employment Type', 'Date Hired', 'Position', 'TIN Number',
            'SSS Number', 'HDMF Number', 'Philhealth Number', 'Bank Account',
        ])
        ws.append([
            'EMP001',
            'Jane',
            'Doe',
            'jane.doe@example.com',
            self.department.name,
            self.line.name,
            self.employment_type.name,
            hired_value,
            self.position.name,
            'TIN-001',
            'SSS-001',
            'HDMF-001',
            'PH-001',
            'BANK-001',
        ])
        ws['H2'].number_format = 'MM/DD/YYYY'

        file_obj = BytesIO()
        wb.save(file_obj)
        file_obj.seek(0)
        return SimpleUploadedFile(
            'employee_import.xlsx',
            file_obj.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )

    def test_import_accepts_excel_datetime_in_date_hired(self):
        upload = self._build_employee_import_file(datetime.datetime(2000, 7, 11, 0, 0, 0))

        response = self.client.post(
            reverse('auth-admin-employees-import'),
            {'file': upload},
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'imported': 1})

        imported_user = self.user_model.objects.get(idnumber='EMP001')
        self.assertTrue(imported_user.change_password)
        work_info = workInformation.objects.get(employee=imported_user)
        self.assertEqual(work_info.date_hired, datetime.date(2000, 7, 11))
