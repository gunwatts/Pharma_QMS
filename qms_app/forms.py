from django import forms
from .models import QMS, ActionPlan, MiniQMS, Note, MiniAction, UpdateRequest, Department
from django.contrib.auth.models import User

# --- Base Form for an Advanced Bootstrap 5 UI ---
class FloatingLabelFormMixin(forms.Form):
    """
    Bootstrap 5 floating label styling.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        for field_name, field in self.fields.items():
            widget = field.widget

            # 🔹 Handle Multiple Checkboxes
            if isinstance(widget, forms.CheckboxSelectMultiple):
                widget.attrs.update({'class': 'form-check'})
                continue

            # 🔹 Single Checkbox
            if isinstance(widget, forms.CheckboxInput):
                widget.attrs.update({'class': 'form-check-input'})
                continue

            # 🔹 Select Dropdown
            if isinstance(widget, forms.Select):
                widget.attrs.update({'class': 'form-select'})
                continue

            # 🔹 Textarea
            if isinstance(widget, forms.Textarea):
                widget.attrs.update({
                    'class': 'form-control',
                    'rows': '3'
                })
                continue

            # 🔹 Default (CharField, DateField, etc.)
            widget.attrs.update({'class': 'form-control'})

            # Add ID if missing
            if 'id' not in widget.attrs:
                widget.attrs['id'] = f'id_{field_name}'


# --- ModelForms Inheriting the New Styling Logic ---

class QMSForm(FloatingLabelFormMixin, forms.ModelForm):
    involved_departments = forms.ModelMultipleChoiceField(
        queryset=Department.objects.all(),
        widget=forms.CheckboxSelectMultiple,
        required=False
    )
    class Meta:
        model = QMS
        fields = '__all__'
        widgets = {
            'initiated_date': forms.DateInput(attrs={'type': 'date'}),
            'target_date': forms.DateInput(attrs={'type': 'date'}),
        }

class ActionPlanForm(FloatingLabelFormMixin, forms.ModelForm):
    class Meta:
        model = ActionPlan
        exclude = ('qms',)
        widgets = {
            'target_date': forms.DateInput(attrs={'type': 'date'}),
        }

class MiniQMSForm(FloatingLabelFormMixin, forms.ModelForm):
    class Meta:
        model = MiniQMS
        exclude = ('status',)
        widgets = {
            'actual_target_date': forms.DateInput(attrs={'type': 'date'}),
            'proposed_target_date': forms.DateInput(attrs={'type': 'date'}),
        }

class NoteForm(FloatingLabelFormMixin, forms.ModelForm):
    class Meta:
        model = Note
        exclude = ('owner',)
        widgets = {
            'target_date': forms.DateInput(attrs={'type': 'date'}),
        }

class MiniActionForm(FloatingLabelFormMixin, forms.ModelForm):
    class Meta:
        model = MiniAction
        exclude = ('owner',)
        widgets = {
            'target_date': forms.DateInput(attrs={'type': 'date'}),
        }

class UserCreationForm(FloatingLabelFormMixin, forms.ModelForm):
    is_admin = forms.BooleanField(label='Assign to Admin Group', required=False)
    class Meta:
        model = User
        fields = ('username', 'first_name', 'last_name', 'email')

class UpdateRequestForm(FloatingLabelFormMixin, forms.ModelForm):
    class Meta:
        model = UpdateRequest
        fields = ['qms_number', 'comments', 'attached_file']

class ExcelUploadForm(FloatingLabelFormMixin, forms.Form):
    excel_file = forms.FileField(
        label='Select Excel File (.xlsx)', 
        help_text='Ensure the file follows the structure of the provided template.'
    )