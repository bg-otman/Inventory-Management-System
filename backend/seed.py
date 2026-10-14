import os
import sys
from decimal import Decimal

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine
from app.models import (
    Base, User, Warehouse, Category, Product, StockBalance,
    CompanySettings, Customer, Supplier, ActivityLog
)
from app.services.auth_service import hash_password

def seed():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # 1. Company Settings
        settings = db.query(CompanySettings).first()
        if not settings:
            print("Seeding Company Settings...")
            settings = CompanySettings(
                company_name="Mizan SARL",
                company_name_ar="شركة ميزان ش.م.م",
                address="Bd d'Anfa, Casablanca, Maroc",
                phone="+212 522 98 76 54",
                email="contact@mizan.ma",
                ice_number="002987123000055",
                tax_identifier="45123987",
                default_tax_rate=Decimal("20.00"),
                currency="MAD"
            )
            db.add(settings)
            db.commit()

        # 2. Users: Owner and Employee
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            print("Seeding Owner user (admin / admin123)...")
            admin_user = User(
                username="admin",
                email="admin@mizan.ma",
                full_name="Othmane (Propriétaire)",
                hashed_password=hash_password("admin123"),
                role="owner",
                language="en",
                is_active=True
            )
            db.add(admin_user)

        emp_user = db.query(User).filter(User.username == "employee").first()
        if not emp_user:
            print("Seeding Employee user (employee / employee123)...")
            emp_user = User(
                username="employee",
                email="employee@mizan.ma",
                full_name="Karim (Employé)",
                hashed_password=hash_password("employee123"),
                role="employee",
                language="ar",
                is_active=True
            )
            db.add(emp_user)
        db.commit()

        # 3. Warehouses
        wh1 = db.query(Warehouse).filter(Warehouse.code == "WH-01").first()
        if not wh1:
            print("Seeding Warehouses...")
            wh1 = Warehouse(
                name="Entrepôt Casablanca",
                code="WH-01",
                address="Zone Industrielle Ain Sebaa, Casablanca",
                is_active=True
            )
            wh2 = Warehouse(
                name="Dépôt Tanger",
                code="WH-02",
                address="Zone Franche, Tanger",
                is_active=True
            )
            db.add_all([wh1, wh2])
            db.commit()
            db.refresh(wh1)

        # 4. Categories
        cat_food = db.query(Category).filter(Category.name == "Alimentation Générale").first()
        if not cat_food:
            print("Seeding Categories...")
            cat_food = Category(name="Alimentation Générale", description="Denrées et produits alimentaires")
            cat_tools = Category(name="Outillage & Bricolage", description="Équipements et matériel")
            cat_elec = Category(name="Électronique", description="Appareils et accessoires")
            db.add_all([cat_food, cat_tools, cat_elec])
            db.commit()
            db.refresh(cat_food)
            db.refresh(cat_tools)
            db.refresh(cat_elec)
        else:
            cat_tools = db.query(Category).filter(Category.name == "Outillage & Bricolage").first()
            cat_elec = db.query(Category).filter(Category.name == "Électronique").first()

        # 5. Products
        prod1 = db.query(Product).filter(Product.name == "Huile d'olive Vierge Extra 5L").first()
        if not prod1:
            print("Seeding Products...")
            prod1 = Product(
                name="Huile d'olive Vierge Extra 5L",
                category_id=cat_food.id,
                description="Bidon de 5L qualité supérieure",
                sku="HUI-5L-001",
                barcode="6111234567890",
                unit="bidon",
                default_price=Decimal("450.00"),
                low_stock_threshold=Decimal("10.00"),
                is_active=True
            )
            prod2 = Product(
                name="Farine de Blé Tendre 25kg",
                category_id=cat_food.id,
                description="Sac de 25kg boulangerie",
                sku="FAR-25K-002",
                barcode=None, # optional SKU/barcode
                unit="sac",
                default_price=Decimal("120.00"),
                low_stock_threshold=Decimal("5.00"),
                is_active=True
            )
            prod3 = Product(
                name="Câble Électrique Cuivre 2.5mm",
                category_id=cat_elec.id,
                description="Rouleau 100m certifié",
                sku="CAB-25-100",
                barcode="00123984501", # barcode with leading zero!
                unit="mètre",
                default_price=Decimal("3.50"),
                low_stock_threshold=Decimal("50.00"),
                is_active=True
            )
            db.add_all([prod1, prod2, prod3])
            db.commit()
            db.refresh(prod1)
            db.refresh(prod2)
            db.refresh(prod3)

            # Initial stock balances
            bal1 = StockBalance(warehouse_id=wh1.id, product_id=prod1.id, quantity=Decimal("25.00"))
            bal2 = StockBalance(warehouse_id=wh1.id, product_id=prod2.id, quantity=Decimal("4.00")) # Below threshold (5.00) -> Low stock alert!
            bal3 = StockBalance(warehouse_id=wh1.id, product_id=prod3.id, quantity=Decimal("200.00"))
            db.add_all([bal1, bal2, bal3])
            db.commit()

        # 6. Customers & Suppliers
        cust1 = db.query(Customer).filter(Customer.name == "Société Atlas Distribution").first()
        if not cust1:
            print("Seeding Customers and Suppliers...")
            cust1 = Customer(
                name="Société Atlas Distribution",
                phone="+212 661 12 34 56",
                address="12 Rue Al Massira, Casablanca",
                email="contact@atlasdist.ma",
                notes="Client régulier grossiste"
            )
            cust2 = Customer(
                name="Épicerie Centrale Rabat",
                phone="+212 662 98 76 54",
                address="Avenue Mohammed V, Rabat",
                email="epicerie.rabat@gmail.com"
            )
            sup1 = Supplier(
                name="Coopérative Oléicole du Nord",
                phone="+212 539 90 80 70",
                address="Fès - Meknès",
                contact_person="M. Benani",
                notes="Fournisseur principal d'huile"
            )
            db.add_all([cust1, cust2, sup1])
            db.commit()

        # Initial Activity log
        log = ActivityLog(
            user_id=admin_user.id if admin_user else None,
            action="system_init",
            entity_type="system",
            details="System initialized and seeded with starting catalog and settings."
        )
        db.add(log)
        db.commit()

        print("Seeding completed successfully!")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
