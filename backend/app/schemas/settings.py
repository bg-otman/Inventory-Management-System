from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
from datetime import datetime

class CompanySettingsBase(BaseModel):
    company_name: str
    company_name_ar: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    ice_number: Optional[str] = None
    tax_identifier: Optional[str] = None
    default_tax_rate: Decimal = Decimal("20.00")
    currency: str = "MAD"
    logo_url: Optional[str] = None

class CompanySettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    company_name_ar: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    ice_number: Optional[str] = None
    tax_identifier: Optional[str] = None
    default_tax_rate: Optional[Decimal] = None
    currency: Optional[str] = None
    logo_url: Optional[str] = None

class CompanySettingsResponse(CompanySettingsBase):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True
