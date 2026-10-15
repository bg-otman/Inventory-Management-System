import os, uuid
os.environ["COOKIE_SECURE"]="false"
import pytest
from decimal import Decimal as D
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base,get_db
from app.models import User,Setting,Warehouse
from app.security import hash_password,_attempts
from app.main import app

@pytest.fixture
def c(tmp_path):
    _attempts.clear()
    engine=create_engine("sqlite:///"+str(tmp_path/"test.db"),connect_args={"check_same_thread":False})
    Base.metadata.create_all(engine)
    factory=sessionmaker(bind=engine,expire_on_commit=False)
    with factory.begin() as db:
        for name,role in [("owner","owner"),("employee","employee")]:
            db.add(User(id=name,username=name,name=name,password_hash=hash_password("test-password-123"),role=role))
        db.add(Setting(id=1,data={"company_name":"Original company","company_name_ar":"الشركة","phone":"","address":"","tax_id":"","default_tax":"0","logo":""}))
        db.add(Warehouse(id="main",name="Main"))
    def override():
        with factory() as db:
            try:yield db
            except Exception:db.rollback();raise
    app.dependency_overrides[get_db]=override
    with TestClient(app) as client:
        ok(client.post("/api/v1/auth/login",json={"username":"owner","password":"test-password-123"}))
        client.headers["X-CSRF-Token"]=client.cookies.get("inventory_csrf")
        yield client
    app.dependency_overrides.clear();engine.dispose()

def req(c,path,data=None,key=None,method="POST"):
    return c.request(method,"/api/v1"+path,json=data or {},headers={"Idempotency-Key":key or str(uuid.uuid4())})
def ok(r):
    assert r.status_code==200,r.text
    return r.json()
def state(c):return ok(c.get("/api/v1/state"))
def product(c,name="Coffee",unit="kg"):
    cat=ok(req(c,"/categories",{"name":" Food "}))["id"]
    suppliers=[p for p in state(c)["parties"] if p["kind"]=="supplier"]
    supplier_id=suppliers[0]["id"] if suppliers else party(c,"supplier","Product supplier")
    return ok(req(c,"/products",{"name":name,"category_id":cat,"supplier_id":supplier_id,"unit":unit}))["id"]
def party(c,kind="customer",name="Customer"):return ok(req(c,"/parties",{"kind":kind,"name":name}))["id"]
def stock(c,p,n=10):ok(req(c,"/stock/adjust",{"product_id":p,"warehouse_id":"main","quantity":str(n),"reason":"Opening stock"}))
def doc(c,p,**kwargs):
    data={"kind":"sale","party_id":None,"warehouse_id":"main","items":[{"product_id":p,"quantity":"2","price":"80"}],"confirm":True,"fulfill":True,"payment":"160"};data.update(kwargs)
    return req(c,"/documents",data)
def getdoc(c,id):return next(x for x in state(c)["documents"] if x["id"]==id)

def test_auth_and_csrf(c):
    assert c.post("/api/v1/categories",json={"name":"No"},headers={"X-CSRF-Token":""}).status_code==403
    with TestClient(app) as anon:assert anon.get("/api/v1/state").status_code==401
    assert c.post("/api/v1/auth/login",json={"username":"owner","password":"bad"}).status_code==401

def test_minimal_products_optional_codes_and_inline_category(c):
    product(c);product(c,"Second");s=state(c)
    assert len(s["categories"])==1
    assert all(x["sku"] is None and x["barcode"] is None and x["price"] is None for x in s["products"])
    assert not s["stock"]
    assert req(c,"/products",{"name":"Missing category"}).status_code==422
    cat=s["categories"][0]["id"];su=s["parties"][0]["id"]
    ok(req(c,"/products",{"name":"Coded","category_id":cat,"supplier_id":su,"barcode":"00123"}))
    assert req(c,"/products",{"name":"Duplicate","category_id":cat,"supplier_id":su,"barcode":"00123"}).status_code==409
    assert next(x for x in state(c)["products"] if x["name"]=="Coded")["barcode"]=="00123"

def test_purchase_sale_and_partial_payment(c):
    p=product(c);su=party(c,"supplier");cu=party(c)
    buy=ok(doc(c,p,kind="purchase",party_id=su,items=[{"product_id":p,"quantity":"10","price":"50"}],payment="200"))
    assert D(getdoc(c,buy["id"])["paid"])==200
    sale=ok(doc(c,p,party_id=cu,items=[{"product_id":p,"quantity":"3","price":"80"}],payment="100"))
    d=getdoc(c,sale["id"]);assert D(d["total"])-D(d["paid"])==140
    assert D(state(c)["stock"][0]["quantity"])==7
    ok(req(c,"/payments",{"party_id":cu,"amount":"140","paid_at":"2026-10-14","allocations":[{"document_id":d["id"],"amount":"140"}]}))
    assert D(getdoc(c,d["id"])["paid"])==240
    assert D(state(c)["stock"][0]["quantity"])==7

def test_walkin_credit_rejected_and_rollback(c):
    p=product(c);stock(c,p)
    assert doc(c,p,payment="100").status_code==422
    assert not state(c)["documents"]
    assert D(state(c)["stock"][0]["quantity"])==10

def test_delayed_delivery_and_receipt_before_invoice(c):
    p=product(c);su=party(c,"supplier");cu=party(c)
    purchase=ok(doc(c,p,kind="purchase",party_id=su,items=[{"product_id":p,"quantity":"10","price":None}],confirm=False,payment="0"))
    assert D(state(c)["stock"][0]["quantity"])==10
    assert getdoc(c,purchase["id"])["status"]=="draft"
    ok(req(c,"/documents/"+purchase["id"],{"kind":"purchase","party_id":su,"warehouse_id":"main","items":[{"product_id":p,"quantity":"10","price":"50"}],"confirm":True,"fulfill":True,"payment":"0"},method="PATCH"))
    assert D(state(c)["stock"][0]["quantity"])==10
    sale=ok(doc(c,p,party_id=cu,fulfill=False,payment="0"))
    assert D(state(c)["stock"][0]["quantity"])==10
    ok(req(c,"/documents/"+sale["id"]+"/fulfill"));ok(req(c,"/documents/"+sale["id"]+"/fulfill"))
    assert D(state(c)["stock"][0]["quantity"])==8

def test_atomic_stock_and_idempotency(c):
    p=product(c);stock(c,p,1);cu=party(c)
    assert doc(c,p,party_id=cu,payment="0").status_code==409
    assert not state(c)["documents"] and D(state(c)["stock"][0]["quantity"])==1
    key=str(uuid.uuid4());payload={"kind":"sale","party_id":cu,"warehouse_id":"main","items":[{"product_id":p,"quantity":"1","price":"10"}],"payment":"10"}
    first=ok(req(c,"/documents",payload,key));again=ok(req(c,"/documents",payload,key))
    assert first==again and len(state(c)["documents"])==1
    assert D(state(c)["stock"][0]["quantity"])==0
    payload["payment"]="5"
    assert req(c,"/documents",payload,key).status_code==409

def test_deposit_allocation_multiple_invoices(c):
    p=product(c);stock(c,p,100);cu=party(c)
    pay=ok(req(c,"/payments",{"party_id":cu,"amount":"1000","paid_at":"2026-10-14"}))["id"]
    a=ok(doc(c,p,party_id=cu,items=[{"product_id":p,"quantity":"6","price":"100"}],payment="0"))["id"]
    b=ok(doc(c,p,party_id=cu,items=[{"product_id":p,"quantity":"3","price":"100"}],payment="0"))["id"]
    ok(req(c,"/payments/"+pay+"/allocate",{"allocations":[{"document_id":a,"amount":"600"},{"document_id":b,"amount":"300"}]}))
    assert D(next(x for x in state(c)["payments"] if x["id"]==pay)["available"])==100
    assert req(c,"/payments/"+pay+"/allocate",{"allocations":[{"document_id":a,"amount":"1"}]}).status_code==409
    stranger=party(c,name="Stranger")
    assert req(c,"/payments",{"party_id":stranger,"amount":"1","paid_at":"2026-10-14","allocations":[{"document_id":a,"amount":"1"}]}).status_code==422

def test_invoice_snapshot_rounding_and_escaping(c):
    p=product(c,"<script>alert(1)</script>");stock(c,p);cu=party(c)
    d=ok(doc(c,p,party_id=cu,items=[{"product_id":p,"quantity":"1.5","price":"10.01"}],discount="1",payment="0"))
    before=getdoc(c,d["id"]);assert before["total"]=="14.02"
    ok(req(c,"/settings",{"company_name":"Changed"},method="PATCH"))
    assert getdoc(c,d["id"])["snapshot"]==before["snapshot"]
    html=c.get("/api/v1/invoices/"+d["id"]+"/print")
    assert html.status_code==200 and "Original company" in html.text
    assert "<script>alert(1)</script>" not in html.text and "&lt;script&gt;" in html.text
    assert len(state(c)["movements"])==2

def test_reversal_and_permissions(c):
    p=product(c);stock(c,p);cu=party(c);d=ok(doc(c,p,party_id=cu))["id"]
    assert req(c,"/documents/"+d+"/reverse",{"reason":"Mistake"}).status_code==409
    payment=state(c)["payments"][0]["id"]
    ok(req(c,"/payments/"+payment+"/reverse",{"reason":"Mistake"}))
    ok(req(c,"/documents/"+d+"/reverse",{"reason":"Mistake"}))
    assert D(state(c)["stock"][0]["quantity"])==10
    ok(c.post("/api/v1/auth/login",json={"username":"employee","password":"test-password-123"}))
    c.headers["X-CSRF-Token"]=c.cookies.get("inventory_csrf")
    assert req(c,"/stock/adjust",{"product_id":p,"warehouse_id":"main","quantity":"1","reason":"Forbidden"}).status_code==403
    assert req(c,"/settings",{"company_name":"Forbidden"},method="PATCH").status_code==403

def test_units_and_explicit_prices(c):
    p=product(c,unit="piece");stock(c,p);cu=party(c)
    assert doc(c,p,party_id=cu,items=[{"product_id":p,"quantity":"1.5","price":"10"}]).status_code==422
    assert doc(c,p,party_id=cu,items=[{"product_id":p,"quantity":"1","price":None}]).status_code==422
    assert D(state(c)["stock"][0]["quantity"])==10

def test_calculated_limits_rollback(c):
    p=product(c);cu=party(c)
    assert doc(c,p,party_id=cu,fulfill=False,payment="0",items=[{"product_id":p,"quantity":"1000","price":"99999999999999.99"}]).status_code==422
    assert not state(c)["documents"]
    stock(c,p,"9999999999999")
    assert req(c,"/stock/adjust",{"product_id":p,"warehouse_id":"main","quantity":"1","reason":"Overflow"}).status_code==422
    assert len(state(c)["movements"])==1


def test_supplier_link_required_and_customer_not_accepted(c):
    cat=ok(req(c,"/categories",{"name":"Hardware"}))["id"]
    payload={"name":"Lamp","category_id":cat}
    assert req(c,"/products",payload).status_code==422
    customer=party(c)
    assert req(c,"/products",{**payload,"supplier_id":customer}).status_code==422
    assert req(c,"/products",{**payload,"supplier_id":"missing"}).status_code==404
    supplier=ok(req(c,"/parties",{"kind":"supplier","name":"Supplier A","phone":"0600000000","address":"Rabat","notes":"Delivery on Monday"}))["id"]
    p=ok(req(c,"/products",{**payload,"supplier_id":supplier,"purchase_cost":"42.50"}))["id"]
    row=next(x for x in state(c)["products"] if x["id"]==p)
    assert row["supplier_id"]==supplier and row["purchase_cost"]=="42.50"
    assert row["sku"] is None and row["barcode"] is None
    assert req(c,"/products/"+p,{**payload,"supplier_id":customer},method="PATCH").status_code==422
    assert req(c,"/products",{**payload,"supplier_id":supplier,"purchase_cost":"-1"}).status_code==422


def test_tax_fields_are_rejected_and_absent_from_output(c):
    p=product(c);stock(c,p);customer=party(c)
    assert doc(c,p,party_id=customer,tax_rate="20").status_code==422
    assert req(c,"/settings",{"company_name":"No taxes","default_tax":"20"},method="PATCH").status_code==422
    assert req(c,"/settings",{"company_name":"No taxes","tax_id":"123"},method="PATCH").status_code==422
    for language in ("en","ar"):
        d=ok(doc(c,p,party_id=customer,items=[{"product_id":p,"quantity":"1.5","price":"10.01"}],discount="1",payment="0",language=language))["id"]
        row=getdoc(c,d)
        assert row["total"]=="14.02" and "tax" not in row and "tax_rate" not in row
        assert "tax" not in row["snapshot"] and "default_tax" not in row["snapshot"]["company"]
        printed=c.get("/api/v1/invoices/"+d+"/print").text
        assert "Tax" not in printed and "الضريبة" not in printed and "14.02" in printed
    assert "tax_id" not in state(c)["settings"] and "default_tax" not in state(c)["settings"]
