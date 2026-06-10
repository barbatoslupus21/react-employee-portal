from django.test import TestCase
from rest_framework.test import APIClient

from userLogin.models import loginCredentials


class AdminAccountsCrudTests(TestCase):
	def setUp(self):
		self.client = APIClient()
		self.admin_user = loginCredentials.objects.create_user(
			username="A0001",
			password="password123",
			idnumber="A0001",
			firstname="Main",
			lastname="Admin",
			admin=True,
			active=True,
		)
		self.target_user = loginCredentials.objects.create_user(
			username="E0001",
			password="password123",
			idnumber="E0001",
			firstname="Target",
			lastname="User",
			active=True,
		)
		self.client.force_authenticate(user=self.admin_user)

	def _patch_target(self, payload: dict):
		return self.client.patch(
			f"/api/general-settings/admin-accounts/{self.target_user.id}",
			payload,
			format="json",
		)

	def test_add_admin_role_persists(self):
		response = self._patch_target({"admin": True})

		self.assertEqual(response.status_code, 200)
		self.target_user.refresh_from_db()
		self.assertTrue(self.target_user.admin)

	def test_update_roles_persists(self):
		self.target_user.admin = True
		self.target_user.save(update_fields=["admin"])

		response = self._patch_target({"admin": False, "hr": True, "mis": True})

		self.assertEqual(response.status_code, 200)
		self.target_user.refresh_from_db()
		self.assertFalse(self.target_user.admin)
		self.assertTrue(self.target_user.hr)
		self.assertTrue(self.target_user.mis)

	def test_remove_all_roles_persists(self):
		self.target_user.admin = True
		self.target_user.hr = True
		self.target_user.accounting = True
		self.target_user.mis = True
		self.target_user.iad = True
		self.target_user.clinic = True
		self.target_user.hr_manager = True
		self.target_user.save(
			update_fields=["admin", "hr", "accounting", "mis", "iad", "clinic", "hr_manager"]
		)

		response = self._patch_target(
			{
				"admin": False,
				"hr": False,
				"accounting": False,
				"mis": False,
				"iad": False,
				"clinic": False,
				"hr_manager": False,
			}
		)

		self.assertEqual(response.status_code, 200)
		self.target_user.refresh_from_db()
		self.assertFalse(self.target_user.admin)
		self.assertFalse(self.target_user.hr)
		self.assertFalse(self.target_user.accounting)
		self.assertFalse(self.target_user.mis)
		self.assertFalse(self.target_user.iad)
		self.assertFalse(self.target_user.clinic)
		self.assertFalse(self.target_user.hr_manager)
