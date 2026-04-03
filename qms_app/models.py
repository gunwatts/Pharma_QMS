from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

class Department(models.Model):
    code = models.CharField(max_length=5, unique=True)
    name = models.CharField(max_length=100)

    def __str__(self):
        return f"{self.code} - {self.name}"


class QMS(models.Model):
    STATUS_CHOICES = [('Open', 'Open'), ('Closed', 'Closed'), ('CFT', 'CFT'), ('EM', 'EM')] # Added
    DEPARTMENT_CHOICES = [
        ('QA', 'Quality Assurance'), ('QC', 'Quality Control'), ('PD', 'Production'),
        ('TT', 'Technology Transfer'), ('PM', 'Project Management'), ('HR', 'Human Resources'),
        ('SH', 'Safety, Health and Environment'), ('FD', 'Formulations Research and Development'),
        ('AM', 'Administration'), ('FN', 'Finance'), ('BD', 'Business Development'),
        ('EN', 'Engineering'), ('WH', 'Warehouse'), ('PK', 'Packaging Development'),
        ('RA', 'Regulatory Affairs'), ('IT', 'Information and Technology'), ('SC', 'Supply Chain Management'),
        ('DA', 'Developmental Quality Assurance'), ('AD', 'Analytical Research and Development'),
        ('IP', 'Intellectual Property'), ('MK', 'Marketing'), ('PP', 'Production Planning and Inventory Control'),
    ]
    TYPE_CHOICES = [
        ('CAPA', 'CAPA'), ('PC', 'PC'), ('TC', 'TC'), ('DR', 'DR'),
        ('OOS', 'OOS'), ('OOT', 'OOT'), ('GI', 'GI'), ('LIR', 'LIR'),
    ]

    qms_number = models.CharField(max_length=20, unique=True)
    initiated_date = models.DateField()
    description = models.TextField()
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    target_date = models.DateField()
    department = models.CharField(max_length=5, choices=DEPARTMENT_CHOICES)
    background = models.TextField(blank=True)
    location = models.CharField(max_length=255, help_text="Physical copy available at", blank=True)
    pdf_file = models.FileField(upload_to='qms_pdfs/', null=True, blank=True, verbose_name="Attach PDF")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='Open') # Added
    remarks = models.TextField(blank=True)
    review_on = models.DateField(null=True, blank=True)
    # NEW FIELD – multiple departments
    involved_departments = models.ManyToManyField(
        Department,
        blank=True,
        related_name="qms_records"
    )

    def responsibilities(self):
        codes = self.involved_departments.values_list('code', flat=True)
        return ", ".join(codes) if codes else "Nil"

    def save(self, *args, **kwargs):
        is_new = self.pk is None

        # For updates, capture original values
        if not is_new:
            original = QMS.objects.get(pk=self.pk)
            target_changed = original.target_date != self.target_date
            status_changed_to_closed = (
                original.status != self.status and self.status == "Closed"
            )

        # ✅ Save QMS FIRST (always)
        super().save(*args, **kwargs)

        # ✅ NEW QMS → auto-add main department to involved_departments
        if is_new:
            dept_obj = Department.objects.filter(code=self.department).first()
            if dept_obj:
                self.involved_departments.add(dept_obj)

        # ✅ Update cascades (only for existing records)
        if not is_new:
            if target_changed:
                self.action_plans.update(target_date=self.target_date)

            if status_changed_to_closed:
                self.action_plans.update(status="Closed")


    class Meta:
        ordering = ['target_date']
        indexes = [models.Index(fields=['qms_number']), models.Index(fields=['target_date'])]

    def __str__(self):
        return self.qms_number

class ActionPlan(models.Model):
    # No changes needed here
    STATUS_CHOICES = [('Open', 'Open'), ('In Progress', 'In Progress'), ('On Hold', 'On Hold'), ('Closed', 'Closed')]
    qms = models.ForeignKey(QMS, on_delete=models.CASCADE, related_name='action_plans')
    action_plan = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    target_date = models.DateField()
    department = models.CharField(max_length=5, choices=QMS.DEPARTMENT_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Open')

    class Meta:
        ordering = ['target_date']
        indexes = [models.Index(fields=['target_date'])]

    def __str__(self):
        return f"{self.action_plan} for {self.qms.qms_number}"


class MiniQMS(models.Model):
    STATUS_CHOICES = [('Open', 'Open'), ('Closed', 'Closed')] # Added
    qms_number = models.CharField(max_length=20)
    description = models.TextField()
    type = models.CharField(max_length=10, choices=QMS.TYPE_CHOICES, blank=True)
    department = models.CharField(max_length=5, choices=QMS.DEPARTMENT_CHOICES)
    actual_target_date = models.DateField()
    proposed_target_date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='Open') # Added

    class Meta:
        ordering = ['proposed_target_date']

    def __str__(self):
        return self.qms_number

# Note and MiniAction models remain unchanged
class Note(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    description = models.TextField()
    target_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Note by {self.owner.username} on {self.created_at.strftime('%Y-%m-%d')}"

class MiniAction(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    description = models.TextField()
    target_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"MiniAction by {self.owner.username} on {self.created_at.strftime('%Y-%m-%d')}"

class UpdateRequest(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    qms_number = models.CharField(max_length=20, verbose_name="QMS Number")
    comments = models.TextField()
    attached_file = models.FileField(upload_to='update_requests/', null=True, blank=True, verbose_name="Attach File (Optional)")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Request for {self.qms_number} by {self.owner.username}"


class DepartmentEmailConfig(models.Model):
    """Store email recipients for each department"""
    department_code = models.CharField(max_length=5, choices=QMS.DEPARTMENT_CHOICES, unique=True)
    to_emails = models.TextField(help_text="Comma-separated email addresses for 'To' field")
    cc_emails = models.TextField(blank=True, help_text="Comma-separated email addresses for 'CC' field")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Department Email Config"
        verbose_name_plural = "Department Email Configs"

    def __str__(self):
        dept_name = dict(QMS.DEPARTMENT_CHOICES).get(self.department_code, self.department_code)
        return f"Email Config - {dept_name}"

    def get_department_display(self):
        """Return the display name of the department"""
        return dict(QMS.DEPARTMENT_CHOICES).get(self.department_code, self.department_code)

    def get_to_emails(self):
        """Return list of 'To' emails"""
        return [e.strip() for e in self.to_emails.split(',') if e.strip()]

    def get_cc_emails(self):
        """Return list of 'CC' emails"""
        return [e.strip() for e in self.cc_emails.split(',') if e.strip()]