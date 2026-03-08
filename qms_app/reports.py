import io, base64
from datetime import datetime, date, timedelta
from django.template.loader import get_template
from django.http import HttpResponse
from django.db.models import Count, Q
from xhtml2pdf import pisa
import matplotlib.pyplot as plt
import matplotlib
from django.shortcuts import render

matplotlib.use('Agg')
from .models import QMS

def get_matplotlib_base64():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=130)
    plt.close()
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def add_bar_labels(ax):
    """Add counts on top of bars for professional clarity"""
    for rect in ax.patches:
        height = rect.get_height()
        if height > 0:
            ax.annotate(f'{int(height)}',
                        xy=(rect.get_x() + rect.get_width() / 2, height),
                        xytext=(0, 3),  # 3 points vertical offset
                        textcoords="offset points",
                        ha='center', va='bottom', fontsize=8, fontweight='bold')

def generate_professional_report(request):
    if request.method != "POST":
        return render(request, 'qms/qms_report_form.html')
    no_overdue_input = request.POST.get('no_overdue') # Check for the new toggle
    date_range = request.POST.get('date_range', '')
    from_date = to_date = None
    if date_range and " to " in date_range:
        try:
            start_str, end_str = date_range.split(" to ")
            from_date = datetime.strptime(start_str, "%Y-%m-%d").date()
            to_date = datetime.strptime(end_str, "%Y-%m-%d").date()
        except ValueError: pass

    today = date.today()
    this_year = today.year
    dept_map = dict(QMS.DEPARTMENT_CHOICES)

    # --- SECTION 1: INITIATION DATA (MONTH & YTD) ---
# 1. Determine the dynamic filter for the "Selected Period" column
    if from_date and to_date:
        # If user selected a range, filter by that range
        period_filter = Q(initiated_date__range=(from_date, to_date))
        period_label = f"{from_date.strftime('%d %b')} to {to_date.strftime('%d %b')}"
    else:
        # Default fallback to Current Month
        period_filter = Q(initiated_date__month=today.month, initiated_date__year=this_year)
        period_label = today.strftime("%B %Y")

    # 2. Build type stats using the dynamic filter
    type_stats = []
    for code, label in QMS.TYPE_CHOICES:
        # This now uses either your custom range OR the current month automatically
        m_cnt = QMS.objects.filter(period_filter, type=code).count()
        
        # YTD always remains current year total
        y_cnt = QMS.objects.filter(initiated_date__year=this_year, type=code).count()
        
        type_stats.append({
            'type': label, 
            'month': m_cnt,  # This is now the "Selected Period" count
            'year': y_cnt
        })

    # 3. Update Chart 1 Title to reflect the selection
    fig, ax = plt.subplots(figsize=(5, 3))
    ax.bar([x['type'] for x in type_stats], [x['month'] for x in type_stats], color='#3498db')
    ax.set_title(f'Initiations: {period_label}', fontsize=10, fontweight='bold')
    add_bar_labels(ax)
    chart_month = get_matplotlib_base64()

    # Chart 2: YTD with Labels
    fig, ax = plt.subplots(figsize=(5, 3))
    ax.bar([x['type'] for x in type_stats], [x['year'] for x in type_stats], color='#2c3e50')
    ax.set_title(f'Cumulative Year-to-Date ({this_year})', fontsize=10, fontweight='bold')
    add_bar_labels(ax)
    chart_year = get_matplotlib_base64()

    # --- SECTION 2: OVERDUE PIE & SUMMARY ---
    overdue_qs = QMS.objects.filter(target_date__lt=today, status='Open')
    dept_overdue_data = overdue_qs.values('department').annotate(total=Count('id')).order_by('-total')
    
    # Pie Chart
    plt.figure(figsize=(5, 3))
    if dept_overdue_data.exists():
        labels = [x['department'] for x in dept_overdue_data]
        sizes = [x['total'] for x in dept_overdue_data]
        plt.pie(sizes, labels=labels, autopct='%1.0f%%', startangle=140, colors=plt.cm.Paired.colors)
        plt.title('Overdue Distribution by Department', fontsize=10, fontweight='bold')
    chart_pie = get_matplotlib_base64()

    compliance = {
        'cft': QMS.objects.filter(status='CFT').count(),
        'em': QMS.objects.filter(status='EM').count(),
        'due_soon': QMS.objects.filter(target_date__range=(today, today+timedelta(days=7))).exclude(status='Closed').count(),
        'total_overdue': overdue_qs.count()
    }

    # --- KEEPING REMAINING SECTIONS AS PER PREVIOUS LOGIC ---
    prev_qs = QMS.objects.filter(initiated_date__year__lt=this_year).exclude(status='Closed')
    unique_active_dept_codes = sorted(list(set(prev_qs.values_list('department', flat=True))))
    prev_matrix = []
    for code, label in QMS.TYPE_CHOICES:
        row = {'type': label, 'depts': [], 'total': 0}
        for d_code in unique_active_dept_codes:
            cnt = prev_qs.filter(type=code, department=d_code).count()
            row['depts'].append(cnt)
            row['total'] += cnt
        if row['total'] > 0: prev_matrix.append(row)

    main_open_prev = prev_qs.exclude(type='PC').order_by('initiated_date')
    overdue_dept_list = sorted(list(set(overdue_qs.values_list('department', flat=True))))
    overdue_tables = [{'name': dept_map.get(d, d), 'items': overdue_qs.filter(department=d)} for d in overdue_dept_list]

    context = {
        'type_stats': type_stats, 'chart_month': chart_month, 'chart_year': chart_year,
        'chart_pie': chart_pie, 'dept_overdue': dept_overdue_data, 'compliance': compliance,
        'prev_matrix': prev_matrix, 'active_depts': unique_active_dept_codes,
        'main_open_prev': main_open_prev, 'overdue_tables': overdue_tables,
        'today': today, 'from_date': from_date, 'to_date': to_date,'period_label': period_label
    }

    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="QMS_Analytical_Report.pdf"'
    template = get_template('qms/qms_report_pdf.html')
    html = template.render(context)
    pisa.CreatePDF(html, dest=response)
    return response

from django.shortcuts import render
def qms_report_form(request):
    return render(request, 'qms/qms_report_form.html')