from django.contrib import admin
from .models import QMS, ActionPlan, MiniQMS, Note, MiniAction

admin.site.register(QMS)
admin.site.register(ActionPlan)
admin.site.register(MiniQMS)
admin.site.register(Note)
admin.site.register(MiniAction)

