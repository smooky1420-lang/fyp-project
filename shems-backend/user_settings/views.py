from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone

from devices.models import Device
from .models import UserSettings
from .serializers import UserSettingsSerializer
from .tariff_service import (
    cost_for_units,
    get_active_tariff_plan,
    is_protected_consumer,
)
from .usage_service import (
    calc_monthly_kwh_for_device,
    get_home_monthly_usage,
    get_month_boundaries,
)


def is_protected_for_month(monthly_usage: list[dict], month_index: int) -> bool:
    """Protected if this month and the prior 5 months in our window were all under 200 units."""
    window = monthly_usage[month_index : month_index + 6]
    if not window:
        return True
    return all(float(m["kwh"]) < 200 for m in window)


def tariff_message(units: float, is_protected: bool, bill) -> str | None:
    if units < 1:
        return (
            "Early in the month. Slab estimate will refine as more usage is recorded."
        )
    if is_protected and units > 200:
        return (
            "Usage exceeded 200 units this month. Protected lifeline rates no longer apply."
        )
    if not is_protected and units < 200:
        return (
            "Unprotected consumer: flat slab rate applies to all units based on your total usage."
        )
    if bill and bill.lines:
        return None
    return "Unable to calculate slab bill. Check that an active tariff plan exists in admin."


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
        s = UserSettingsSerializer(obj, data=request.data)
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
    IESCO A-1 residential slab bill estimate from telemetry (rates from DB).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)
        monthly_usage = get_home_monthly_usage(request.user, months=6)
        plan = get_active_tariff_plan()

        if not monthly_usage:
            return Response({
                "calculated_tariff": None,
                "effective_pkr_per_kwh": None,
                "bill_total_pkr": None,
                "bill_lines": [],
                "is_protected": None,
                "current_month_units": 0,
                "monthly_usage": [],
                "tariff_plan_name": plan.name if plan else None,
                "tariff_source": plan.source if plan else None,
                "use_slab_billing": settings_obj.use_slab_billing,
                "message": "No usage data available. Please add devices and collect telemetry data.",
            })

        is_protected = is_protected_consumer([m["kwh"] for m in monthly_usage])
        current_month_units = monthly_usage[0]["kwh"]

        bill = None
        calculated_tariff = None
        bill_total = None
        bill_lines = []

        if settings_obj.use_slab_billing and plan:
            _, bill = cost_for_units(
                current_month_units,
                is_protected=is_protected,
                plan=plan,
                use_slab=True,
            )
            if bill:
                calculated_tariff = (
                    float(bill.effective_pkr_per_kwh)
                    if bill.effective_pkr_per_kwh is not None
                    else None
                )
                bill_total = float(bill.total_pkr)
                bill_lines = [line.to_dict() for line in bill.lines]

        if calculated_tariff is None:
            fallback = float(settings_obj.tariff_pkr_per_kwh or 0)
            if fallback > 0 and current_month_units > 0:
                calculated_tariff = fallback
                bill_total = round(current_month_units * fallback, 2)
                bill_lines = [{
                    "units": int(current_month_units),
                    "rate": fallback,
                    "amount": bill_total,
                    "label": "Manual flat rate",
                }]

        hint = tariff_message(current_month_units, is_protected, bill)

        return Response({
            "calculated_tariff": calculated_tariff,
            "effective_pkr_per_kwh": calculated_tariff,
            "bill_total_pkr": bill_total,
            "bill_lines": bill_lines,
            "is_protected": is_protected,
            "current_month_units": current_month_units,
            "monthly_usage": monthly_usage,
            "tariff_plan_name": plan.name if plan else None,
            "tariff_source": plan.source if plan else None,
            "use_slab_billing": settings_obj.use_slab_billing,
            "message": hint,
        })


class MonthlyReportsAPI(APIView):
    """Monthly reports with slab-based cost when enabled."""
    permission_classes = [IsAuthenticated]

    def _month_cost(
        self,
        kwh: float,
        month_index: int,
        monthly_usage: list[dict],
        settings_obj: UserSettings,
        plan,
    ) -> float:
        if kwh <= 0:
            return 0.0
        protected = is_protected_for_month(monthly_usage, month_index)
        cost, _ = cost_for_units(
            kwh,
            is_protected=protected,
            fallback_tariff=float(settings_obj.tariff_pkr_per_kwh or 0),
            plan=plan,
            use_slab=settings_obj.use_slab_billing,
        )
        return cost

    def get_monthly_reports(self, user, months=12):
        settings_obj, _ = UserSettings.objects.get_or_create(user=user)
        plan = get_active_tariff_plan()
        devices = list(Device.objects.filter(user=user))
        if not devices:
            return [], []

        monthly_usage = get_home_monthly_usage(user, months=months)
        monthly_reports = []

        for i in range(months):
            month_start, month_end, label = get_month_boundaries(i)
            month_date = timezone.localtime(month_start, timezone.get_current_timezone())
            month_total_kwh = 0.0
            for device in devices:
                month_total_kwh += calc_monthly_kwh_for_device(device, month_start, month_end)

            month_total_kwh = round(month_total_kwh, 2)
            month_cost = round(
                self._month_cost(month_total_kwh, i, monthly_usage, settings_obj, plan),
                2,
            )
            monthly_reports.append({
                "month": label,
                "month_name": month_date.strftime("%b %Y"),
                "kwh": month_total_kwh,
                "cost_pkr": month_cost,
            })

        return monthly_reports, monthly_usage

    def get_device_breakdown(self, user, months=12, monthly_usage=None):
        settings_obj, _ = UserSettings.objects.get_or_create(user=user)
        plan = get_active_tariff_plan()
        devices = Device.objects.filter(user=user)
        if not devices.exists():
            return []

        if monthly_usage is None:
            monthly_usage = get_home_monthly_usage(user, months=months)

        total_home_kwh = 0.0
        total_home_cost = 0.0
        for i in range(months):
            month_start, month_end, _ = get_month_boundaries(i)
            month_kwh = 0.0
            for device in devices:
                month_kwh += calc_monthly_kwh_for_device(device, month_start, month_end)
            total_home_kwh += month_kwh
            total_home_cost += self._month_cost(
                month_kwh, i, monthly_usage, settings_obj, plan
            )

        effective_rate = (
            total_home_cost / total_home_kwh if total_home_kwh > 0 else 0.0
        )
        if not settings_obj.use_slab_billing or not plan:
            effective_rate = float(settings_obj.tariff_pkr_per_kwh or 0)

        device_totals = {}
        for device in devices:
            total_kwh = 0.0
            for i in range(months):
                month_start, month_end, _ = get_month_boundaries(i)
                total_kwh += calc_monthly_kwh_for_device(device, month_start, month_end)

            device_totals[device.id] = {
                "device_id": device.id,
                "name": device.name,
                "room": device.room or "",
                "kwh": round(total_kwh, 2),
                "cost_pkr": round(total_kwh * effective_rate, 2),
            }

        return list(device_totals.values())

    def get_device_monthly_breakdown(self, user, months=12, monthly_usage=None):
        settings_obj, _ = UserSettings.objects.get_or_create(user=user)
        plan = get_active_tariff_plan()
        devices = Device.objects.filter(user=user)
        if not devices.exists():
            return []

        if monthly_usage is None:
            monthly_usage = get_home_monthly_usage(user, months=months)

        out = []
        for i in range(months):
            month_start, month_end, label = get_month_boundaries(i)
            month_date = timezone.localtime(month_start, timezone.get_current_timezone())
            month_kwh = monthly_usage[i]["kwh"] if i < len(monthly_usage) else 0
            month_cost = self._month_cost(
                month_kwh, i, monthly_usage, settings_obj, plan
            )
            effective = month_kwh and month_cost / month_kwh or float(
                settings_obj.tariff_pkr_per_kwh or 0
            )

            devices_rows = []
            for device in devices:
                kwh = calc_monthly_kwh_for_device(device, month_start, month_end)
                if kwh <= 0:
                    continue
                devices_rows.append({
                    "device_id": device.id,
                    "name": device.name,
                    "room": device.room or "",
                    "kwh": kwh,
                    "cost_pkr": round(kwh * effective, 2),
                })

            out.append({
                "month": label,
                "month_name": month_date.strftime("%b %Y"),
                "devices": devices_rows,
            })

        return out

    def calc_solar_kwh_from_history(self, user, period_start, period_end):
        from solar.models import SolarGeneration

        gens = list(
            SolarGeneration.objects.filter(
                user=user,
                created_at__gte=period_start,
                created_at__lt=period_end,
            ).order_by("created_at")
        )
        if len(gens) < 2:
            return None

        total = 0.0
        for i in range(1, len(gens)):
            prev = gens[i - 1]
            cur = gens[i]
            hours = (cur.created_at - prev.created_at).total_seconds() / 3600.0
            if hours <= 0:
                continue
            avg_kw = (float(prev.solar_kw) + float(cur.solar_kw)) / 2.0
            total += avg_kw * hours
        return round(total, 2)

    def estimate_solar_kwh(self, solar_config, total_kwh, months=12):
        days_in_period = months * 30
        estimated = (
            float(solar_config.installed_capacity_kw) * 4 * days_in_period
        ) * 0.7
        return round(min(estimated, total_kwh * 0.5), 2)

    def get(self, request):
        reports, monthly_usage = self.get_monthly_reports(request.user, months=12)
        device_breakdown = self.get_device_breakdown(
            request.user, months=12, monthly_usage=monthly_usage
        )
        device_monthly_breakdown = self.get_device_monthly_breakdown(
            request.user, months=12, monthly_usage=monthly_usage
        )

        total_kwh = sum(r["kwh"] for r in reports)
        total_cost = sum(r["cost_pkr"] for r in reports)

        from solar.models import SolarConfig

        solar_config = SolarConfig.objects.filter(user=request.user, enabled=True).first()
        solar_total_kwh = 0.0
        grid_total_kwh = total_kwh

        if solar_config:
            tz = timezone.get_current_timezone()
            now = timezone.localtime(timezone.now(), tz)
            period_start = now.replace(
                day=1, hour=0, minute=0, second=0, microsecond=0
            )
            for _ in range(11):
                if period_start.month == 1:
                    period_start = period_start.replace(
                        year=period_start.year - 1, month=12
                    )
                else:
                    period_start = period_start.replace(month=period_start.month - 1)

            period_end = now
            from_history = self.calc_solar_kwh_from_history(
                request.user, period_start, period_end
            )
            if from_history is not None and from_history > 0:
                solar_total_kwh = min(from_history, total_kwh)
            else:
                solar_total_kwh = self.estimate_solar_kwh(
                    solar_config, total_kwh, months=12
                )
            grid_total_kwh = max(0, total_kwh - solar_total_kwh)

        return Response({
            "monthly_reports": reports,
            "total_kwh": round(total_kwh, 2),
            "total_cost_pkr": round(total_cost, 2),
            "average_monthly_kwh": round(total_kwh / len(reports) if reports else 0, 2),
            "average_monthly_cost": round(total_cost / len(reports) if reports else 0, 2),
            "device_breakdown": device_breakdown,
            "device_monthly_breakdown": device_monthly_breakdown,
            "solar_kwh": round(solar_total_kwh, 2),
            "grid_kwh": round(grid_total_kwh, 2),
        })
