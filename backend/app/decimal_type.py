"""SQLite stores exact scaled integers instead of binary floating-point money."""

from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy.types import TypeDecorator, BigInteger, Text


def price_text(value):
    """Canonical exact unit price: 2–6 fractional digits, never a float."""
    text = format(Decimal(str(value)).quantize(Decimal(".000001")), "f").rstrip("0").rstrip(".")
    whole, _, fraction = text.partition(".")
    return whole + "." + fraction.ljust(2, "0")


class UnitPrice(TypeDecorator):
    # Text preserves six places without overflowing SQLite's 64-bit integer
    # range for valid prices imported from earlier releases.
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return None if value is None else price_text(value)

    def process_result_value(self, value, dialect):
        return None if value is None else Decimal(value)


class ScaledDecimal(TypeDecorator):
    impl = BigInteger
    cache_ok = True

    def __init__(self, places=2):
        self.places = places
        self.factor = Decimal(10) ** places
        super().__init__()

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return int((Decimal(str(value)) * self.factor).quantize(Decimal(1), rounding=ROUND_HALF_UP))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return (Decimal(value) / self.factor).quantize(Decimal(1) / self.factor)
