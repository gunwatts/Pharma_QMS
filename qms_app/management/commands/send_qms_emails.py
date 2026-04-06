from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from django.urls import reverse
from django.conf import settings

from qms_app.models import QMS, DepartmentEmailConfig

import win32com.client
import pythoncom
import logging


class Command(BaseCommand):
    help = 'Save Near Due QMS Emails as Drafts'

    def handle(self, *args, **kwargs):
        today = timezone.now().date()
        near_due_date = today + timedelta(days=7)

        logger = logging.getLogger(__name__)

        # Ensure all department configs exist
        for dept_code, dept_name in QMS.DEPARTMENT_CHOICES:
            DepartmentEmailConfig.objects.get_or_create(department_code=dept_code)

        email_configs = DepartmentEmailConfig.objects.all()

        try:
            pythoncom.CoInitialize()
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'COM init failed: {str(e)}'))
            return

        try:
            # Outlook init
            try:
                outlook = win32com.client.GetActiveObject("Outlook.Application")
                logger.info('Using existing Outlook')
            except:
                outlook = win32com.client.Dispatch("Outlook.Application")
                logger.info('Created new Outlook')

            # Fetch QMS
            department_qms = QMS.objects.filter(
                status='Open',
                target_date__lte=near_due_date
            ).order_by('department', 'target_date')

            qms_by_dept = {}
            for qms in department_qms:
                qms_by_dept.setdefault(qms.department, []).append(qms)

            configs_dict = {c.department_code: c for c in email_configs}

            email_count = 0

            for dept_code, qms_list in qms_by_dept.items():
                try:
                    config = configs_dict.get(dept_code)

                    if not config or not config.get_to_emails():
                        logger.warning(f"No emails for {dept_code}")
                        continue

                    to_emails = config.get_to_emails() or []
                    cc_emails = config.get_cc_emails() or []

                    # Build HTML table
                    html_table = '''<table border="1" cellpadding="8" cellspacing="0"
                    style="border-collapse: collapse; width: 100%; font-family: 'Times New Roman'; font-size: 11pt;">'''

                    html_table += '''
                    <tr style="background-color:#4F81BD;color:white;font-weight:bold;">
                    <th>QMS No</th><th>Type</th><th>Initiated Date</th>
                    <th>Description</th><th>Target Date</th><th>Background</th><th>Remarks</th>
                    </tr>
                    '''

                    has_rows = False

                    for qms in qms_list:
                        if qms.target_date < today:
                            continue

                        html_table += f"""
                        <tr>
                        <td>{qms.qms_number}</td>
                        <td>{qms.get_type_display()}</td>
                        <td>{qms.initiated_date.strftime("%d-%b-%Y")}</td>
                        <td>{qms.description}</td>
                        <td>{qms.target_date.strftime("%d-%b-%Y")}</td>
                        <td>{qms.background}</td>
                        <td>{qms.remarks}</td>
                        </tr>
                        """
                        has_rows = True

                    if not has_rows:
                        html_table += f"""
                        <tr>
                        <td colspan="7" style="text-align:center;">No QMS due within next 7 days. Complete Pending Actions mentioned in above Link.</td>
                        </tr>
                        """

                    html_table += "</table>"

                    # URL (IMPORTANT: set your domain)
                    base_url = getattr(settings, "SITE_URL", "http://127.0.0.1:8000")
                    qms_url = base_url + reverse('export_qms_to_excel', args=[dept_code])

                    # Email body
                    # Email body
                    body_html = f"""
                    <html>
                    <body style="font-family:'Times New Roman'; font-size:12pt;">

                    <p>Dear Team,</p>

                    <p>
                    This is an automated notification from the <strong>Quality Management System (QMS)</strong>.
                    </p>

                    {
                    """
                    <p>
                    The following QMS records are scheduled within the next 7 days and require your immediate attention.
                    All concerned personnel are instructed to review the details and ensure necessary actions are completed within the defined timelines.
                    </p>

                    <p>
                    <strong>Action Required:</strong> Kindly reply to this email with your action plan, including the expected completion date for each applicable QMS item.
                    </p>
                    """
                    if has_rows else
                    """
                    <p>
                    As of now, there are no QMS records due within the next 7 days.
                    Please Download QMS Excel from the Link below and Complete pending activities as soon as possible.
                    </p>
                    """
                    }

                    <p>
                    <strong>Reference:</strong> For All Open QMS and other QMS pending activities:
                    <a href="{qms_url}">Download QMS Excel</a>
                    </p>

                    <br>

                    {html_table}

                    <br>

                    <p>
                    Adherence to timelines is mandatory to ensure compliance with quality and regulatory requirements.
                    </p>

                    <br>

                    <p>
                    Regards,<br>
                    <strong>Quality Management System (QMS)</strong><br>
                    (This is a system-generated email. Reply is required for submission of action plans.)
                    </p>

                    </body>
                    </html>
                    """

                    # Create mail
                    mail = outlook.CreateItem(0)
                    mail.Subject = f"Near Due QMS - {dict(QMS.DEPARTMENT_CHOICES).get(dept_code)} Department"

                    recipients = mail.Recipients

                    for email in to_emails:
                        recipients.Add(email)

                    for email in cc_emails:
                        rec = recipients.Add(email)
                        rec.Type = 2  # CC

                    mail.HTMLBody = body_html
                    mail.BodyFormat = 2

                    # ✅ YOUR CHANGE (IMPORTANT)
                    mail.Save()   # <-- saved as draft instead of sending

                    email_count += 1
                    logger.info(f"Draft created for {dept_code}")

                except Exception as e:
                    logger.error(f"Error in {dept_code}: {str(e)}", exc_info=True)

            self.stdout.write(self.style.SUCCESS(f"{email_count} draft emails created"))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Fatal error: {str(e)}"))

        finally:
            try:
                pythoncom.CoUninitialize()
            except:
                pass