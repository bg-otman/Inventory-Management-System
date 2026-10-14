from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime
from app.database import Base

class CompanySettings(Base):
    __tablename__ = "company_settings"

    id = Column(Integer, primary_key=True)
    company_name = Column(String(150), nullable=False, default="Mizan SARL")
    company_name_ar = Column(String(150), nullable=False, default="شركة ميزان ش.م.م")
    address = Column(String(255), nullable=True, default="Casablanca, Morocco")
    phone = Column(String(50), nullable=True, default="+212 522 00 00 00")
    email = Column(String(100), nullable=True, default="contact@mizan.ma")
    ice_number = Column(String(50), nullable=True, default="000123456000089")  # Identifiant Commun de l'Entreprise
    tax_identifier = Column(String(50), nullable=True)  # IF / Identifiant Fiscal
    default_tax_rate = Column(Numeric(5, 2), nullable=False, default=20.00)  # Standard Moroccan VAT 20%
    currency = Column(String(10), nullable=False, default="MAD")
    logo_url = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
