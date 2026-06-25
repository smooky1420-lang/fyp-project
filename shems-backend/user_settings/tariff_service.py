"""IESCO A-1 residential slab billing (rates loaded from TariffPlan in DB)."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from user_settings.models import TariffPlan, TariffSlab

PROTECTION_UNIT_LIMIT = 200
PROTECTION_HISTORY_MONTHS = 6
MONEY_QUANT = Decimal("0.01")


@dataclass
class BillLine:
    units: int
    rate: Decimal
    amount: Decimal
    label: str

    def to_dict(self) -> dict:
        return {
            "units": self.units,
            "rate": float(self.rate),
            "amount": float(self.amount),
            "label": self.label,
        }


@dataclass
class BillResult:
    total_pkr: Decimal
    effective_pkr_per_kwh: Decimal | None
    lines: list[BillLine]
    consumer_type: str
    units: int

    def to_dict(self) -> dict:
        return {
            "total_pkr": float(self.total_pkr),
            "effective_pkr_per_kwh": (
                float(self.effective_pkr_per_kwh)
                if self.effective_pkr_per_kwh is not None
                else None
            ),
            "lines": [line.to_dict() for line in self.lines],
            "consumer_type": self.consumer_type,
            "units": self.units,
        }


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def get_active_tariff_plan() -> TariffPlan | None:
    return TariffPlan.objects.filter(is_active=True).prefetch_related("slabs").first()


def is_protected_consumer(monthly_units: list[float | int]) -> bool:
    """Protected if every month in the lookback stayed below 200 units."""
    if not monthly_units:
        return True
    window = monthly_units[:PROTECTION_HISTORY_MONTHS]
    return all(float(u) < PROTECTION_UNIT_LIMIT for u in window)


def _slabs_for(plan: TariffPlan, consumer_type: str) -> list[TariffSlab]:
    return list(
        plan.slabs.filter(consumer_type=consumer_type).order_by("sort_order", "unit_from")
    )


def _units_in_progressive_band(total_units: int, unit_from: int, unit_to: int | None) -> int:
    if total_units < unit_from:
        return 0
    band_end = unit_to if unit_to is not None else total_units
    return max(0, min(total_units, band_end) - unit_from + 1)


def _calc_protected_bill(units: int, slabs: list[TariffSlab]) -> BillResult:
    lines: list[BillLine] = []
    total = Decimal("0")
    for slab in slabs:
        count = _units_in_progressive_band(units, slab.unit_from, slab.unit_to)
        if count <= 0:
            continue
        rate = Decimal(slab.variable_pkr_kwh)
        amount = _money(rate * Decimal(count))
        total += amount
        label = slab.label or f"{slab.unit_from}-{slab.unit_to or '∞'} units"
        lines.append(BillLine(units=count, rate=rate, amount=amount, label=label))
    effective = _money(total / Decimal(units)) if units > 0 else None
    return BillResult(
        total_pkr=_money(total),
        effective_pkr_per_kwh=effective,
        lines=lines,
        consumer_type=TariffSlab.CONSUMER_PROTECTED,
        units=units,
    )


def _find_unprotected_slab(units: int, slabs: list[TariffSlab]) -> TariffSlab | None:
    for slab in sorted(slabs, key=lambda s: s.unit_from, reverse=True):
        if units < slab.unit_from:
            continue
        if slab.unit_to is None or units <= slab.unit_to:
            return slab
    return slabs[0] if slabs else None


def _calc_unprotected_bill(units: int, slabs: list[TariffSlab]) -> BillResult:
    slab = _find_unprotected_slab(units, slabs)
    if not slab:
        return BillResult(
            total_pkr=Decimal("0"),
            effective_pkr_per_kwh=None,
            lines=[],
            consumer_type=TariffSlab.CONSUMER_UNPROTECTED,
            units=units,
        )
    rate = Decimal(slab.variable_pkr_kwh)
    amount = _money(rate * Decimal(units))
    label = slab.label or f"{slab.unit_from}-{slab.unit_to or '∞'} units (all units)"
    lines = [BillLine(units=units, rate=rate, amount=amount, label=label)]
    return BillResult(
        total_pkr=amount,
        effective_pkr_per_kwh=rate,
        lines=lines,
        consumer_type=TariffSlab.CONSUMER_UNPROTECTED,
        units=units,
    )


def calculate_monthly_bill(
    units: float | int,
    *,
    is_protected: bool,
    plan: TariffPlan | None = None,
) -> BillResult | None:
    """
    Compute estimated energy charge from active IESCO A-1 residential slabs.

    Protected: progressive (e.g. 100×10.54 + 65×13.01 for 165 units).
    Unprotected: single rate on all units based on total consumption band.
    """
    if units <= 0:
        return BillResult(
            total_pkr=Decimal("0"),
            effective_pkr_per_kwh=None,
            lines=[],
            consumer_type=(
                TariffSlab.CONSUMER_PROTECTED
                if is_protected
                else TariffSlab.CONSUMER_UNPROTECTED
            ),
            units=0,
        )

    plan = plan or get_active_tariff_plan()
    if not plan:
        return None

    unit_count = int(units) if float(units).is_integer() else int(round(float(units)))
    consumer = (
        TariffSlab.CONSUMER_PROTECTED
        if is_protected
        else TariffSlab.CONSUMER_UNPROTECTED
    )
    slabs = _slabs_for(plan, consumer)
    if not slabs:
        return None

    if is_protected:
        return _calc_protected_bill(unit_count, slabs)
    return _calc_unprotected_bill(unit_count, slabs)


def cost_for_units(
    units: float | int,
    *,
    is_protected: bool,
    fallback_tariff: float = 0.0,
    plan: TariffPlan | None = None,
    use_slab: bool = True,
) -> tuple[float, BillResult | None]:
    """Return (cost_pkr, bill_detail). Uses slab engine when enabled and plan exists."""
    if use_slab:
        bill = calculate_monthly_bill(units, is_protected=is_protected, plan=plan)
        if bill is not None:
            return float(bill.total_pkr), bill
    if units <= 0 or fallback_tariff <= 0:
        return 0.0, None
    cost = round(float(units) * float(fallback_tariff), 2)
    return cost, None
