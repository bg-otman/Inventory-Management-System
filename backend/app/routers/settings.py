from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.settings import CompanySettings
from app.models.user import User
from app.schemas.settings import CompanySettingsUpdate, CompanySettingsResponse
from app.services.auth_service import get_current_user, require_owner

router = APIRouter(prefix="/settings", tags=["settings"])

def get_or_create_settings(db: DBSession) -> CompanySettings:
    cs = db.query(CompanySettings).first()
    if not cs:
        cs = CompanySettings(
            company_name="Mizan SARL",
            company_name_ar="شركة ميزان ش.م.م",
            address="Casablanca, Morocco",
            phone="+212 522 00 00 00",
            email="contact@mizan.ma",
            ice_number="000123456000089",
            default_tax_rate=20.00,
            currency="MAD"
        )
        db.add(cs)
        db.commit()
        db.refresh(cs)
    return cs

@router.get("", response_model=CompanySettingsResponse)
def get_settings(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return get_or_create_settings(db)

@router.put("", response_model=CompanySettingsResponse)
def update_settings(
    payload: CompanySettingsUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    cs = get_or_create_settings(db)

    if payload.company_name is not None:
        cs.company_name = payload.company_name
    if payload.company_name_ar is not None:
        cs.company_name_ar = payload.company_name_ar
    if payload.address is not None:
        cs.address = payload.address
    if payload.phone is not None:
        cs.phone = payload.phone
    if payload.email is not None:
        cs.email = payload.email
    if payload.ice_number is not None:
        cs.ice_number = payload.ice_number
    if payload.tax_identifier is not None:
        cs.tax_identifier = payload.tax_identifier
    if payload.default_tax_rate is not None:
        cs.default_tax_rate = payload.default_tax_rate
    if payload.currency is not None:
        cs.currency = payload.currency
    if payload.logo_url is not None:
        cs.logo_url = payload.logo_url

    db.commit()
    db.refresh(cs)
    return cs
