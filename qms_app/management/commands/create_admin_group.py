from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group

class Command(BaseCommand):
    help = 'Creates the admin group'

    def handle(self, *args, **options):
        group, created = Group.objects.get_or_create(name='admin')
        if created:
            self.stdout.write(self.style.SUCCESS('Successfully created admin group'))
        else:
            self.stdout.write(self.style.WARNING('Admin group already exists'))