"""Unit tests for IESCO A-1 residential slab billing."""
from decimal import Decimal

from django.test import TestCase

from user_settings.models import TariffPlan, TariffSlab
from user_settings.tariff_service import (
    calculate_monthly_bill,
    is_protected_consumer,
)


class TariffServiceTests(TestCase):
    def setUp(self):
        self.plan = TariffPlan.objects.create(
            name="Test A-1",
            source="Test",
            is_active=True,
        )
        TariffSlab.objects.create(
            plan=self.plan,
            consumer_type=TariffSlab.CONSUMER_PROTECTED,
            unit_from=1,
            unit_to=100,
            variable_pkr_kwh=Decimal("10.54"),
            sort_order=1,
        )
        TariffSlab.objects.create(
            plan=self.plan,
            consumer_type=TariffSlab.CONSUMER_PROTECTED,
            unit_from=101,
            unit_to=200,
            variable_pkr_kwh=Decimal("13.01"),
            sort_order=2,
        )
        TariffSlab.objects.create(
            plan=self.plan,
            consumer_type=TariffSlab.CONSUMER_UNPROTECTED,
            unit_from=1,
            unit_to=100,
            variable_pkr_kwh=Decimal("22.44"),
            sort_order=1,
        )
        TariffSlab.objects.create(
            plan=self.plan,
            consumer_type=TariffSlab.CONSUMER_UNPROTECTED,
            unit_from=101,
            unit_to=200,
            variable_pkr_kwh=Decimal("28.91"),
            sort_order=2,
        )
        TariffSlab.objects.create(
            plan=self.plan,
            consumer_type=TariffSlab.CONSUMER_UNPROTECTED,
            unit_from=201,
            unit_to=300,
            variable_pkr_kwh=Decimal("33.10"),
            sort_order=3,
        )

    def test_protected_165_units_progressive(self):
        bill = calculate_monthly_bill(165, is_protected=True, plan=self.plan)
        self.assertIsNotNone(bill)
        assert bill is not None
        self.assertEqual(bill.total_pkr, Decimal("1899.65"))
        self.assertEqual(len(bill.lines), 2)
        self.assertEqual(bill.lines[0].units, 100)
        self.assertEqual(bill.lines[0].amount, Decimal("1054.00"))
        self.assertEqual(bill.lines[1].units, 65)
        self.assertEqual(bill.lines[1].amount, Decimal("845.65"))

    def test_unprotected_165_flat_band(self):
        bill = calculate_monthly_bill(165, is_protected=False, plan=self.plan)
        self.assertIsNotNone(bill)
        assert bill is not None
        self.assertEqual(bill.total_pkr, Decimal("4770.15"))
        self.assertEqual(len(bill.lines), 1)
        self.assertEqual(bill.lines[0].rate, Decimal("28.91"))

    def test_unprotected_250_high_band(self):
        bill = calculate_monthly_bill(250, is_protected=False, plan=self.plan)
        self.assertIsNotNone(bill)
        assert bill is not None
        self.assertEqual(bill.total_pkr, Decimal("8275.00"))

    def test_protection_status_from_history(self):
        self.assertTrue(is_protected_consumer([150, 180, 120, 90, 100, 110]))
        self.assertFalse(is_protected_consumer([150, 210, 120, 90, 100, 110]))
