from django.core.exceptions import PermissionDenied

def admin_required(function):
    def wrap(request, *args, **kwargs):
        if request.user.groups.filter(name='admin').exists():
            return function(request, *args, **kwargs)
        else:
            raise PermissionDenied
    return wrap