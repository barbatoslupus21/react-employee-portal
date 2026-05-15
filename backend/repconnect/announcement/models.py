from django.db import models
from userLogin.models import loginCredentials


class Announcement(models.Model):
    title = models.CharField(max_length=200, blank=True, default='')
    caption = models.TextField(max_length=2000)
    created_by = models.ForeignKey(
        loginCredentials,
        on_delete=models.PROTECT,
        related_name='announcements',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_published = models.BooleanField(default=False)

    class Meta:
        db_table = 'announcement'
        ordering = ['-created_at']

    def __str__(self):
        return self.title or f'Announcement #{self.pk}'


class AnnouncementMedia(models.Model):
    MEDIA_TYPE_CHOICES = [
        ('image', 'Image'),
        ('video', 'Video'),
    ]

    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name='media',
    )
    file = models.FileField(upload_to='announcements/')
    media_type = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'announcement_media'
        ordering = ['order']

    def __str__(self):
        return f'{self.media_type} #{self.pk} (announcement #{self.announcement_id})'


class AnnouncementReaction(models.Model):
    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name='reactions',
    )
    user = models.ForeignKey(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='announcement_reactions',
    )
    emoji = models.CharField(max_length=10, default='❤️')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'announcement_reaction'
        unique_together = ('announcement', 'user')

    def __str__(self):
        return f'{self.user_id} reacted {self.emoji} on announcement #{self.announcement_id}'


class AnnouncementComment(models.Model):
    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name='comments',
    )
    user = models.ForeignKey(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='announcement_comments',
    )
    content = models.TextField(max_length=1000)
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='replies',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'announcement_comment'
        ordering = ['created_at']

    def __str__(self):
        return f'Comment #{self.pk} by {self.user_id} on announcement #{self.announcement_id}'
