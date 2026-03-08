def bulk_create_qms(qms_list):
    from .models import QMS, Department

    QMS.objects.bulk_create(qms_list, batch_size=500)

    # Reload created objects
    created_qms = QMS.objects.filter(
        qms_number__in=[q.qms_number for q in qms_list]
    )

    dept_map = {
        d.code: d
        for d in Department.objects.filter(
            code__in=[q.department for q in created_qms]
        )
    }

    through_objs = []

    for qms in created_qms:
        dept = dept_map.get(qms.department)
        if dept:
            through_objs.append(
                QMS.involved_departments.through(
                    qms_id=qms.id,
                    department_id=dept.id
                )
            )

    QMS.involved_departments.through.objects.bulk_create(through_objs)