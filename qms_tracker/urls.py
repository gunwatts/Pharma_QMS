from django.urls import include
from django.contrib import admin
from django.urls import path
from django.conf import settings # New import
from django.conf.urls.static import static # New impor

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('qms_app.urls')),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)