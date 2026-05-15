from django.urls import path
from . import views

urlpatterns = [
    path('', views.AnnouncementListCreateView.as_view(), name='announcement-list-create'),
    path('<int:pk>/', views.AnnouncementDetailView.as_view(), name='announcement-detail'),
    path('<int:pk>/media/reorder/', views.AnnouncementMediaReorderView.as_view(), name='announcement-media-reorder'),
    path('<int:pk>/react/', views.AnnouncementReactionToggleView.as_view(), name='announcement-react'),
    path('<int:pk>/reactions/', views.AnnouncementReactionListView.as_view(), name='announcement-reactions'),
    path('<int:pk>/comments/', views.AnnouncementCommentListCreateView.as_view(), name='announcement-comments'),
    path('<int:pk>/comments/<int:comment_id>/', views.AnnouncementCommentDeleteView.as_view(), name='announcement-comment-delete'),
]
