from sqlalchemy import select
from .db import SessionLocal
from .models import Setting, Warehouse

def bootstrap():
    with SessionLocal.begin() as db:
        if not db.get(Setting,1):
            db.add(Setting(id=1,data={"company_name":"Inventory","company_name_ar":"المخزون","phone":"","address":"","logo":""}))
        if not db.scalar(select(Warehouse.id).limit(1)):
            db.add(Warehouse(name="Main warehouse"))
if __name__=="__main__":bootstrap()
