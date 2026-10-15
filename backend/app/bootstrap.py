import os
from sqlalchemy import select
from .db import SessionLocal
from .models import User, Setting, Warehouse
from .security import hash_password

def bootstrap():
    with SessionLocal.begin() as db:
        if not db.get(Setting,1):
            db.add(Setting(id=1,data={"company_name":"Inventory","company_name_ar":"المخزون","phone":"","address":"","logo":""}))
        if not db.scalar(select(Warehouse.id).limit(1)):
            db.add(Warehouse(name="Main warehouse"))
        if not db.scalar(select(User.id).limit(1)):
            username=os.environ.get("OWNER_USERNAME","owner")
            password=os.environ.get("OWNER_PASSWORD")
            if not password: raise RuntimeError("Set OWNER_PASSWORD (at least 12 characters) before initial startup.")
            db.add(User(username=username.casefold(),name=os.environ.get("OWNER_NAME","Owner"),role="owner",password_hash=hash_password(password)))
if __name__=="__main__":bootstrap()
