from rest_framework import serializers
from .models import QMS, ActionPlan, Department


class QMSSerializer(serializers.ModelSerializer):
    responsibilities = serializers.SerializerMethodField()
    involved_dept_codes = serializers.SerializerMethodField()

    class Meta:
        model = QMS
        fields = [
            'id',
            'qms_number',
            'initiated_date',
            'description',
            'type',
            'target_date',
            'review_on',
            'department',
            'background',
            'status',
            'remarks',
            'location',
            'responsibilities',
            'involved_dept_codes',
        ]

    def get_involved_dept_codes(self, obj):
        codes = obj.involved_departments.values_list('code', flat=True)
        return list(codes)

    def get_responsibilities(self, obj):
        return obj.responsibilities()


class ActionPlanSerializer(serializers.ModelSerializer):
    qms_number = serializers.CharField(source='qms.qms_number')

    class Meta:
        model = ActionPlan
        fields = [
            'id',
            'qms',
            'qms_number',
            'action_plan',
            'description',
            'target_date',
            'department',
            'status',
        ]


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'code', 'name']