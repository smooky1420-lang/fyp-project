from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import UserSettings
from .serializers import UserSettingsSerializer

class UserSettingsAPI(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, user):
        obj, _ = UserSettings.objects.get_or_create(user=user)
        return obj

    def get(self, request):
        obj = self.get_object(request.user)
        return Response(UserSettingsSerializer(obj).data)

    def put(self, request):
        obj = self.get_object(request.user)
        s = UserSettingsSerializer(obj, data=request.data)  # full update
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def patch(self, request):
        obj = self.get_object(request.user)
        s = UserSettingsSerializer(obj, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)
