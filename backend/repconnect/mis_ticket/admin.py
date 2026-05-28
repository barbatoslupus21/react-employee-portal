from django.contrib import admin
from .models import MISDevice, MISTicket, MISTicketDiagnosis

admin.site.register(MISDevice)
admin.site.register(MISTicket)
admin.site.register(MISTicketDiagnosis)
