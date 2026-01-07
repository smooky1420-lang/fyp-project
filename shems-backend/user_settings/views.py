from datetime import timedelta
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from devices.models import Device
from telemetry.models import TelemetryReading
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


class TariffCalculatorAPI(APIView):
    """
    Calculate electricity tariff based on usage history.
    Returns calculated tariff, protection status, and monthly usage.
    """
    permission_classes = [IsAuthenticated]

    def calc_monthly_kwh(self, device, month_start, month_end):
        """Calculate total kWh for a device in a given month."""
        readings = (
            TelemetryReading.objects
            .filter(device=device, created_at__gte=month_start, created_at__lt=month_end)
            .order_by("created_at")
            .values_list("energy_kwh", flat=True)
        )

        total = 0.0
        prev = None
        for e in readings:
            try:
                cur = float(e)
            except (TypeError, ValueError):
                continue
            if prev is not None:
                delta = cur - prev
                if delta > 0:
                    total += delta
            prev = cur
        return round(total, 2)

    def get_monthly_usage(self, user, months=6):
        """Get monthly usage for last N months."""
        devices = Device.objects.filter(user=user)
        if not devices.exists():
            return []

        tz = timezone.get_current_timezone()
        now = timezone.localtime(timezone.now(), tz)
        
        monthly_usage = []
        for i in range(months):
            # Calculate month start and end (go back i months from current month)
            if i == 0:
                # Current month
                month_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            else:
                # Go back i months
                month_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                for _ in range(i):
                    # Subtract one month
                    if month_date.month == 1:
                        month_date = month_date.replace(year=month_date.year - 1, month=12)
                    else:
                        month_date = month_date.replace(month=month_date.month - 1)
            
            month_start = month_date
            # Calculate next month start
            if month_date.month == 12:
                month_end = month_date.replace(year=month_date.year + 1, month=1, day=1)
            else:
                month_end = month_date.replace(month=month_date.month + 1, day=1)
            
            # Calculate total for all devices in this month
            month_total = 0.0
            for device in devices:
                month_total += self.calc_monthly_kwh(device, month_start, month_end)
            
            monthly_usage.append({
                "month": month_date.strftime("%Y-%m"),
                "kwh": round(month_total, 2)
            })
        
        return monthly_usage

    def calculate_tariff(self, units, is_protected):
        """Calculate tariff based on units and protection status."""
        # Tariff rates (PKR per kWh)
        if units <= 50:
            # Lifeline (0-50 units)
            return 3.95 if is_protected else None  # N/A for unprotected
        elif units <= 100:
            return 7.74 if is_protected else 22.44
        elif units <= 200:
            return 13.01 if is_protected else 28.91
        elif units <= 300:
            return None if is_protected else 33.10  # Protected becomes unprotected
        else:
            # Above 300 units - use highest rate
            return 33.10

    def get(self, request):
        monthly_usage = self.get_monthly_usage(request.user, months=6)
        
        if not monthly_usage:
            return Response({
                "calculated_tariff": None,
                "is_protected": None,
                "current_month_units": 0,
                "monthly_usage": [],
                "message": "No usage data available. Please add devices and collect telemetry data."
            })

        # Check if user is protected (all last 6 months < 200 units)
        is_protected = all(month["kwh"] < 200 for month in monthly_usage)
        
        # Get current month usage (first in the list)
        current_month_units = monthly_usage[0]["kwh"] if monthly_usage else 0
        
        # Calculate tariff
        calculated_tariff = self.calculate_tariff(current_month_units, is_protected)
        
        return Response({
            "calculated_tariff": calculated_tariff,
            "is_protected": is_protected,
            "current_month_units": current_month_units,
            "monthly_usage": monthly_usage,
            "message": None if calculated_tariff else "Unable to calculate tariff for this usage level."
        })


class MonthlyReportsAPI(APIView):
    """
    Get monthly reports with usage and cost for the last 12 months.
    """
    permission_classes = [IsAuthenticated]

    def calc_monthly_kwh(self, device, month_start, month_end):
        """Calculate total kWh for a device in a given month."""
        readings = (
            TelemetryReading.objects
            .filter(device=device, created_at__gte=month_start, created_at__lt=month_end)
            .order_by("created_at")
            .values_list("energy_kwh", flat=True)
        )

        total = 0.0
        prev = None
        for e in readings:
            try:
                cur = float(e)
            except (TypeError, ValueError):
                continue
            if prev is not None:
                delta = cur - prev
                if delta > 0:
                    total += delta
            prev = cur
        return round(total, 2)

    def get_monthly_reports(self, user, months=12):
        """Get monthly reports with usage and cost."""
        devices = Device.objects.filter(user=user)
        if not devices.exists():
            return []

        # Get user tariff
        settings_obj, _ = UserSettings.objects.get_or_create(user=user)
        tariff = float(settings_obj.tariff_pkr_per_kwh) if settings_obj.tariff_pkr_per_kwh else 0.0

        tz = timezone.get_current_timezone()
        now = timezone.localtime(timezone.now(), tz)
        
        monthly_reports = []
        for i in range(months):
            # Calculate month start and end
            if i == 0:
                month_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            else:
                month_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                for _ in range(i):
                    if month_date.month == 1:
                        month_date = month_date.replace(year=month_date.year - 1, month=12)
                    else:
                        month_date = month_date.replace(month=month_date.month - 1)
            
            month_start = month_date
            if month_date.month == 12:
                month_end = month_date.replace(year=month_date.year + 1, month=1, day=1)
            else:
                month_end = month_date.replace(month=month_date.month + 1, day=1)
            
            # Calculate total for all devices in this month
            month_total_kwh = 0.0
            for device in devices:
                month_total_kwh += self.calc_monthly_kwh(device, month_start, month_end)
            
            month_total_kwh = round(month_total_kwh, 2)
            month_cost = round(month_total_kwh * tariff, 2)
            
            monthly_reports.append({
                "month": month_date.strftime("%Y-%m"),
                "month_name": month_date.strftime("%b %Y"),
                "kwh": month_total_kwh,
                "cost_pkr": month_cost,
            })
        
        return monthly_reports

    def get_device_breakdown(self, user, months=12):
        """Get device breakdown for last N months."""
        devices = Device.objects.filter(user=user)
        if not devices.exists():
            return []

        settings_obj, _ = UserSettings.objects.get_or_create(user=user)
        tariff = float(settings_obj.tariff_pkr_per_kwh) if settings_obj.tariff_pkr_per_kwh else 0.0

        tz = timezone.get_current_timezone()
        now = timezone.localtime(timezone.now(), tz)
        
        # Calculate total for each device across all months
        device_totals = {}
        for device in devices:
            total_kwh = 0.0
            for i in range(months):
                if i == 0:
                    month_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                else:
                    month_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                    for _ in range(i):
                        if month_date.month == 1:
                            month_date = month_date.replace(year=month_date.year - 1, month=12)
                        else:
                            month_date = month_date.replace(month=month_date.month - 1)
                
                month_start = month_date
                if month_date.month == 12:
                    month_end = month_date.replace(year=month_date.year + 1, month=1, day=1)
                else:
                    month_end = month_date.replace(month=month_date.month + 1, day=1)
                
                total_kwh += self.calc_monthly_kwh(device, month_start, month_end)
            
            device_totals[device.id] = {
                "device_id": device.id,
                "name": device.name,
                "room": device.room or "",
                "kwh": round(total_kwh, 2),
                "cost_pkr": round(total_kwh * tariff, 2),
            }
        
        return list(device_totals.values())

    def get(self, request):
        reports = self.get_monthly_reports(request.user, months=12)
        device_breakdown = self.get_device_breakdown(request.user, months=12)
        
        # Calculate totals
        total_kwh = sum(r["kwh"] for r in reports)
        total_cost = sum(r["cost_pkr"] for r in reports)
        
        # Get solar data if available
        from solar.models import SolarConfig
        solar_config = SolarConfig.objects.filter(user=request.user, enabled=True).first()
        solar_total_kwh = 0.0
        grid_total_kwh = total_kwh
        
        if solar_config:
            # Estimate solar generation for last 12 months (simplified)
            # Rough estimate: average 4 hours of peak sun per day, 70% efficiency
            days_in_period = 365  # 12 months
            estimated_solar_kwh = (solar_config.installed_capacity_kw * 4 * days_in_period) * 0.7
            solar_total_kwh = min(estimated_solar_kwh, total_kwh * 0.5)  # Cap at 50% of total
            grid_total_kwh = max(0, total_kwh - solar_total_kwh)
        
        return Response({
            "monthly_reports": reports,
            "total_kwh": round(total_kwh, 2),
            "total_cost_pkr": round(total_cost, 2),
            "average_monthly_kwh": round(total_kwh / len(reports) if reports else 0, 2),
            "average_monthly_cost": round(total_cost / len(reports) if reports else 0, 2),
            "device_breakdown": device_breakdown,
            "solar_kwh": round(solar_total_kwh, 2),
            "grid_kwh": round(grid_total_kwh, 2),
        })
