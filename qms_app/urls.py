from django.urls import path
from django.contrib.auth import views as auth_views
from . import views, reports, xl_import
urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('dashboard/', views.dashboard_final, name='dashboard_final'),
    
    # Auth
    path('accounts/login/', auth_views.LoginView.as_view(template_name='qms/login.html'), name='login'),
    path('accounts/logout/', auth_views.LogoutView.as_view(next_page='login'), name='logout'),
    path('accounts/password_change/', auth_views.PasswordChangeView.as_view(template_name='qms/password_change.html', success_url='/'), name='password_change'),
    path('accounts/password_change/done/', auth_views.PasswordChangeDoneView.as_view(template_name='qms/password_change_done.html'), name='password_change_done'),

    # Admin Panel
    path('admin-panel/', views.admin_panel, name='admin_panel'),
    path('closed/', views.closed_list, name='closed_list'), # New

    # QMS
    path('qms/', views.qms_list, name='qms_list'),
    path('qms/new/', views.qms_create, name='qms_create'),
    path('qms/<int:pk>/', views.qms_detail, name='qms_detail'),
    path('qms/<int:pk>/edit/', views.qms_edit, name='qms_edit'),
    path('qms/<int:pk>/delete/', views.qms_delete, name='qms_delete'),
    path('qms/<int:pk>/close/', views.qms_close, name='qms_close'), # New
    path('qms/<int:pk>/pdf/', views.qms_pdf_view, name='qms_pdf_view'),
    path('qms/upload/', xl_import.upload_qms_from_excel, name='upload_qms_from_excel'),
    path('qms/download-template/', xl_import.download_qms_template, name='download_qms_template'),

    # Action Plan
    path('qms/<int:qms_pk>/add_action/', views.action_plan_create, name='action_plan_create'),
    path('action/<int:pk>/edit/', views.action_plan_edit, name='action_plan_edit'),
    path('action/<int:pk>/delete/', views.action_plan_delete, name='action_plan_delete'),

    # Mini QMS
    path('mini-qms/', views.mini_qms_list, name='mini_qms_list'),
    path('mini-qms/new/', views.mini_qms_create, name='mini_qms_create'),
    path('mini-qms/<int:pk>/edit/', views.mini_qms_edit, name='mini_qms_edit'),
    path('mini-qms/<int:pk>/delete/', views.mini_qms_delete, name='mini_qms_delete'),
    path('mini-qms/<int:pk>/close/', views.mini_qms_close, name='mini_qms_close'), # New


    # Notes
    path('notes/', views.notes_list, name='notes_list'),
    path('notes/<int:pk>/edit/', views.note_edit, name='note_edit'),
    path('notes/<int:pk>/delete/', views.note_delete, name='note_delete'),

    # Mini Actions
    path('mini-actions/', views.mini_actions_list, name='mini_actions_list'),
    path('mini-actions/<int:pk>/edit/', views.mini_action_edit, name='mini_action_edit'),
    path('mini-actions/<int:pk>/delete/', views.mini_action_delete, name='mini_action_delete'),




    # Export to Excel
    path('export/qms-excel/<str:dept>/', views.export_qms_to_excel, name='export_qms_to_excel'),
    path('export/department-qms-excel/', views.export_department_qms_to_excel, name='export_department_qms_to_excel'),
    path('sync-excel/', views.sync_excel_data, name='sync_excel_data'),
    path('download-bi/', views.download_pbix, name='download_pbix'),
    # New Update Request URLs
    path('update-request/submit/', views.submit_update_request, name='submit_update_request'),
    path('update-request/list/', views.list_update_requests, name='list_update_requests'),
    path('update-request/<int:pk>/delete/', views.delete_update_request, name='delete_update_request'),

    # API Endpoints for Power BI
    path('api/qms/', views.qms_api, name='qms-api'),
    path('api/action-plans/', views.action_plans_api),
    path('api/departments/', views.departments_api),
    path('api/qms-involved-departments/', views.qms_involved_departments_api),


    # QMS Report
    path('qms-report/form/', reports.qms_report_form, name='qms_report_form'),
    path('qms-report/', reports.generate_professional_report, name='qms_report_generate'),
]

