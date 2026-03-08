from django import template
from datetime import date
from django.contrib.auth.models import Group

register = template.Library()

@register.filter
def days_remaining(target_date):
    if not target_date:
        return ""
    return (target_date - date.today()).days

@register.filter
def is_near_due(target_date):
    if not target_date:
        return False
    return 0 <= (target_date - date.today()).days <= 7

# --- ADD THIS NEW FILTER ---
@register.filter(name='in_group')
def in_group(user, group_name):
    """
    Checks if a user is in a specific group.
    Usage: {% if user|in_group:"admin" %}
    """
    return user.groups.filter(name=group_name).exists()