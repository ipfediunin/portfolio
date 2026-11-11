from django.contrib import admin
from django.urls import path

from backoffice.payments import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("webhooks/payments", views.payment_webhook),
    path("internal/orders/<int:order_id>/payment-methods", views.payment_methods),
    path("healthz", views.liveness),
]
