import os, uuid

os.environ["COOKIE_SECURE"] = "false"
import pytest
from decimal import Decimal as D
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base, get_db
from app.models import Setting, Warehouse
from app.main import app


@pytest.fixture
def c(tmp_path):
    engine = create_engine(
        "sqlite:///" + str(tmp_path / "test.db"), connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory.begin() as db:
        db.add(
            Setting(
                id=1,
                data={
                    "company_name": "Original company",
                    "company_name_ar": "الشركة",
                    "phone": "",
                    "address": "",
                    "tax_id": "",
                    "default_tax": "0",
                    "logo": "",
                },
            )
        )
        db.add(Warehouse(id="main", name="Main"))

    def override():
        with factory() as db:
            try:
                yield db
            except Exception:
                db.rollback()
                raise

    app.dependency_overrides[get_db] = override
    with TestClient(app) as client:
        client.headers["X-Inventory-Local"] = os.environ["INVENTORY_LOCAL_TOKEN"]
        yield client
    app.dependency_overrides.clear()
    engine.dispose()


def req(c, path, data=None, key=None, method="POST"):
    return c.request(
        method,
        "/api/v1" + path,
        json=data or {},
        headers={"Idempotency-Key": key or str(uuid.uuid4())},
    )


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def state(c):
    return ok(c.get("/api/v1/state"))


def product(c, name="Coffee", unit="kg"):
    cat = ok(req(c, "/categories", {"name": " Food "}))["id"]
    supplier = next(
        (
            p["id"]
            for p in state(c)["parties"]
            if p["kind"] == "supplier" and p["name"] == "Catalog supplier"
        ),
        None,
    ) or party(c, "supplier", "Catalog supplier")
    return ok(
        req(
            c,
            "/products",
            {
                "name": name,
                "category_id": cat,
                "unit": unit,
                "supplier_id": supplier,
                "stock_mode": "existing",
            },
        )
    )["id"]


def party(c, kind="customer", name="Customer"):
    return ok(req(c, "/parties", {"kind": kind, "name": name}))["id"]


def stock(c, p, n=10):
    ok(
        req(
            c,
            "/stock/adjust",
            {
                "product_id": p,
                "warehouse_id": "main",
                "quantity": str(n),
                "reason": "Opening stock",
            },
        )
    )


def doc(c, p, **kwargs):
    data = {
        "kind": "sale",
        "party_id": None,
        "warehouse_id": "main",
        "items": [{"product_id": p, "quantity": "2", "price": "80"}],
        "confirm": True,
        "fulfill": True,
        "payment": "160",
    }
    data.update(kwargs)
    return req(c, "/documents", data)


def getdoc(c, id):
    return next(x for x in state(c)["documents"] if x["id"] == id)


def test_no_accounts_and_local_only_access(c):
    assert c.get("/api/v1/state").status_code == 200
    assert c.post("/api/v1/auth/login", json={}).status_code in (404, 405)
    assert req(c, "/users", {}).status_code in (404, 405)
    assert "user" not in state(c) and "users" not in state(c)
    with TestClient(app) as outsider:
        assert outsider.get("/api/v1/state").status_code == 403
        assert outsider.post("/api/v1/categories", json={"name": "Forbidden"}).status_code == 403
    assert c.get("/api/v1/state", headers={"Origin": "https://example.com"}).status_code == 403


def test_minimal_products_optional_codes_and_inline_category(c):
    product(c)
    product(c, "Second")
    s = state(c)
    assert len(s["categories"]) == 1
    assert all("sku" not in x and "barcode" not in x and x["price"] is None for x in s["products"])
    assert not s["stock"]
    assert req(c, "/products", {"name": "Missing category"}).status_code == 422
    cat = s["categories"][0]["id"]
    supplier = s["parties"][0]["id"]
    assert (
        req(
            c,
            "/products",
            {
                "name": "Coded",
                "category_id": cat,
                "supplier_id": supplier,
                "barcode": "00123",
                "stock_mode": "existing",
            },
        ).status_code
        == 422
    )
    assert (
        req(
            c,
            "/products",
            {
                "name": "Duplicate",
                "category_id": cat,
                "supplier_id": supplier,
                "barcode": "00123",
                "stock_mode": "existing",
            },
        ).status_code
        == 422
    )
    assert not any(x["name"] == "Coded" for x in state(c)["products"])


def test_purchase_sale_and_partial_payment(c):
    p = product(c)
    su = party(c, "supplier")
    cu = party(c)
    buy = ok(
        doc(
            c,
            p,
            kind="purchase",
            party_id=su,
            items=[{"product_id": p, "quantity": "10", "price": "50"}],
            payment="200",
        )
    )
    assert D(getdoc(c, buy["id"])["paid"]) == 200
    sale = ok(
        doc(
            c,
            p,
            party_id=cu,
            items=[{"product_id": p, "quantity": "3", "price": "80"}],
            payment="100",
        )
    )
    d = getdoc(c, sale["id"])
    assert D(d["total"]) - D(d["paid"]) == 140
    assert D(state(c)["stock"][0]["quantity"]) == 7
    ok(
        req(
            c,
            "/payments",
            {
                "party_id": cu,
                "amount": "140",
                "paid_at": "2026-10-14",
                "allocations": [{"document_id": d["id"], "amount": "140"}],
            },
        )
    )
    assert D(getdoc(c, d["id"])["paid"]) == 240
    assert D(state(c)["stock"][0]["quantity"]) == 7


def test_walkin_credit_rejected_and_rollback(c):
    p = product(c)
    stock(c, p)
    assert doc(c, p, payment="100").status_code == 422
    assert not state(c)["documents"]
    assert D(state(c)["stock"][0]["quantity"]) == 10


def test_delayed_delivery_and_receipt_before_invoice(c):
    p = product(c)
    su = party(c, "supplier")
    cu = party(c)
    purchase = ok(
        doc(
            c,
            p,
            kind="purchase",
            party_id=su,
            items=[{"product_id": p, "quantity": "10", "price": None}],
            confirm=False,
            payment="0",
        )
    )
    assert D(state(c)["stock"][0]["quantity"]) == 10
    assert getdoc(c, purchase["id"])["status"] == "draft"
    ok(
        req(
            c,
            "/documents/" + purchase["id"],
            {
                "kind": "purchase",
                "party_id": su,
                "warehouse_id": "main",
                "items": [{"product_id": p, "quantity": "10", "price": "50"}],
                "confirm": True,
                "fulfill": True,
                "payment": "0",
            },
            method="PATCH",
        )
    )
    assert D(state(c)["stock"][0]["quantity"]) == 10
    sale = ok(doc(c, p, party_id=cu, fulfill=False, payment="0"))
    assert D(state(c)["stock"][0]["quantity"]) == 10
    ok(req(c, "/documents/" + sale["id"] + "/fulfill"))
    ok(req(c, "/documents/" + sale["id"] + "/fulfill"))
    assert D(state(c)["stock"][0]["quantity"]) == 8


def test_atomic_stock_and_idempotency(c):
    p = product(c)
    stock(c, p, 1)
    cu = party(c)
    assert doc(c, p, party_id=cu, payment="0").status_code == 409
    assert not state(c)["documents"] and D(state(c)["stock"][0]["quantity"]) == 1
    key = str(uuid.uuid4())
    payload = {
        "kind": "sale",
        "party_id": cu,
        "warehouse_id": "main",
        "items": [{"product_id": p, "quantity": "1", "price": "10"}],
        "payment": "10",
    }
    first = ok(req(c, "/documents", payload, key))
    again = ok(req(c, "/documents", payload, key))
    assert first == again and len(state(c)["documents"]) == 1
    assert D(state(c)["stock"][0]["quantity"]) == 0
    payload["payment"] = "5"
    assert req(c, "/documents", payload, key).status_code == 409


def test_deposit_allocation_multiple_invoices(c):
    p = product(c)
    stock(c, p, 100)
    cu = party(c)
    pay = ok(req(c, "/payments", {"party_id": cu, "amount": "1000", "paid_at": "2026-10-14"}))["id"]
    a = ok(
        doc(
            c,
            p,
            party_id=cu,
            items=[{"product_id": p, "quantity": "6", "price": "100"}],
            payment="0",
        )
    )["id"]
    b = ok(
        doc(
            c,
            p,
            party_id=cu,
            items=[{"product_id": p, "quantity": "3", "price": "100"}],
            payment="0",
        )
    )["id"]
    ok(
        req(
            c,
            "/payments/" + pay + "/allocate",
            {
                "allocations": [
                    {"document_id": a, "amount": "600"},
                    {"document_id": b, "amount": "300"},
                ]
            },
        )
    )
    assert D(next(x for x in state(c)["payments"] if x["id"] == pay)["available"]) == 100
    assert (
        req(
            c,
            "/payments/" + pay + "/allocate",
            {"allocations": [{"document_id": a, "amount": "1"}]},
        ).status_code
        == 409
    )
    stranger = party(c, name="Stranger")
    assert (
        req(
            c,
            "/payments",
            {
                "party_id": stranger,
                "amount": "1",
                "paid_at": "2026-10-14",
                "allocations": [{"document_id": a, "amount": "1"}],
            },
        ).status_code
        == 422
    )


def test_invoice_snapshot_rounding_and_escaping(c):
    p = product(c, "<script>alert(1)</script>")
    stock(c, p)
    cu = party(c)
    d = ok(
        doc(
            c,
            p,
            party_id=cu,
            items=[{"product_id": p, "quantity": "1.5", "price": "10.01"}],
            discount="1",
            payment="0",
        )
    )
    before = getdoc(c, d["id"])
    assert before["total"] == "14.02"
    ok(req(c, "/settings", {"company_name": "Changed"}, method="PATCH"))
    assert getdoc(c, d["id"])["snapshot"] == before["snapshot"]
    html = c.get("/api/v1/invoices/" + d["id"] + "/print")
    assert html.status_code == 200 and "Original company" in html.text
    assert "<script>alert(1)</script>" not in html.text and "&lt;script&gt;" in html.text
    assert len(state(c)["movements"]) == 2


def test_reversal(c):
    p = product(c)
    stock(c, p)
    cu = party(c)
    d = ok(doc(c, p, party_id=cu))["id"]
    assert req(c, "/documents/" + d + "/reverse", {"reason": "Mistake"}).status_code == 409
    payment = state(c)["payments"][0]["id"]
    ok(req(c, "/payments/" + payment + "/reverse", {"reason": "Mistake"}))
    ok(req(c, "/documents/" + d + "/reverse", {"reason": "Mistake"}))
    assert D(state(c)["stock"][0]["quantity"]) == 10


def test_units_and_explicit_prices(c):
    p = product(c, unit="piece")
    stock(c, p)
    cu = party(c)
    assert (
        doc(
            c, p, party_id=cu, items=[{"product_id": p, "quantity": "1.5", "price": "10"}]
        ).status_code
        == 422
    )
    assert (
        doc(
            c, p, party_id=cu, items=[{"product_id": p, "quantity": "1", "price": None}]
        ).status_code
        == 422
    )
    assert D(state(c)["stock"][0]["quantity"]) == 10


def test_calculated_limits_rollback(c):
    p = product(c)
    cu = party(c)
    assert (
        doc(
            c,
            p,
            party_id=cu,
            fulfill=False,
            payment="0",
            items=[{"product_id": p, "quantity": "1000", "price": "99999999999999.99"}],
        ).status_code
        == 422
    )
    assert not state(c)["documents"]
    stock(c, p, "9999999999999")
    assert (
        req(
            c,
            "/stock/adjust",
            {"product_id": p, "warehouse_id": "main", "quantity": "1", "reason": "Overflow"},
        ).status_code
        == 422
    )
    assert len(state(c)["movements"]) == 1


def test_products_link_supplier_and_purchases_can_use_other_suppliers(c):
    cat = ok(req(c, "/categories", {"name": "Hardware"}))["id"]
    supplier = party(c, "supplier", "Original supplier")
    payload = {"name": "Lamp", "category_id": cat, "supplier_id": supplier}
    p = ok(req(c, "/products", {**payload, "purchase_cost": "42.50", "stock_mode": "existing"}))[
        "id"
    ]
    row = next(x for x in state(c)["products"] if x["id"] == p)
    assert row["supplier_id"] == supplier and row["purchase_cost"] == "42.50"
    assert not state(c)["stock"] and not state(c)["documents"]
    customer = party(c)
    assert req(c, "/products", {**payload, "supplier_id": customer}).status_code == 422
    assert req(c, "/products", {**payload, "purchase_cost": "-1"}).status_code == 422
    assert doc(c, p, kind="purchase", party_id=None, payment="0").status_code == 422
    assert doc(c, p, kind="purchase", party_id=customer, payment="0").status_code == 422
    for name in ("Supplier A", "Supplier B"):
        supplier = party(c, "supplier", name)
        ok(doc(c, p, kind="purchase", party_id=supplier, payment="0"))
    assert len(state(c)["products"]) == 1 and D(state(c)["stock"][0]["quantity"]) == 4


@pytest.mark.parametrize("kind", ["customer", "supplier"])
def test_remove_account_preserves_history_balances_and_settlement(c, kind):
    p = product(c)
    stock(c, p, 10)
    account = party(c, kind)
    document_kind = "sale" if kind == "customer" else "purchase"
    d = ok(doc(c, p, kind=document_kind, party_id=account, payment="40"))["id"]
    before = state(c)
    key = str(uuid.uuid4())
    removed = ok(req(c, "/parties/" + account, key=key, method="DELETE"))
    assert ok(req(c, "/parties/" + account, key=key, method="DELETE")) == removed
    after = state(c)
    assert not next(x for x in after["parties"] if x["id"] == account)["active"]
    assert after["documents"] == before["documents"] and after["payments"] == before["payments"]
    assert after["stock"] == before["stock"]
    assert doc(c, p, kind=document_kind, party_id=account, payment="0").status_code == 422
    ok(
        req(
            c,
            "/payments",
            {
                "party_id": account,
                "amount": "120",
                "paid_at": "2026-10-15",
                "allocations": [{"document_id": d, "amount": "120"}],
            },
        )
    )
    assert getdoc(c, d)["paid"] == "160.00"
    ok(req(c, "/parties/" + account + "/restore"))
    assert next(x for x in state(c)["parties"] if x["id"] == account)["active"]
    ok(doc(c, p, kind=document_kind, party_id=account, payment="0", fulfill=False))


def test_removed_supplier_existing_receipt_can_be_invoiced(c):
    p = product(c)
    account = party(c, "supplier")
    d = ok(doc(c, p, kind="purchase", party_id=account, confirm=False, payment="0"))["id"]
    ok(req(c, "/parties/" + account, method="DELETE"))
    ok(
        req(
            c,
            "/documents/" + d,
            {
                "kind": "purchase",
                "party_id": account,
                "warehouse_id": "main",
                "items": [{"product_id": p, "quantity": "2", "price": "50"}],
                "confirm": True,
                "fulfill": True,
            },
            method="PATCH",
        )
    )
    assert D(state(c)["stock"][0]["quantity"]) == 2 and getdoc(c, d)["total"] == "100.00"


def test_tax_fields_are_rejected_and_absent_from_output(c):
    p = product(c)
    stock(c, p)
    customer = party(c)
    assert doc(c, p, party_id=customer, tax_rate="20").status_code == 422
    assert (
        req(
            c, "/settings", {"company_name": "No taxes", "default_tax": "20"}, method="PATCH"
        ).status_code
        == 422
    )
    assert (
        req(
            c, "/settings", {"company_name": "No taxes", "tax_id": "123"}, method="PATCH"
        ).status_code
        == 422
    )
    for language in ("fr",):
        d = ok(
            doc(
                c,
                p,
                party_id=customer,
                items=[{"product_id": p, "quantity": "1.5", "price": "10.01"}],
                discount="1",
                payment="0",
                language=language,
            )
        )["id"]
        row = getdoc(c, d)
        assert row["total"] == "14.02" and "tax" not in row and "tax_rate" not in row
        assert "tax" not in row["snapshot"] and "default_tax" not in row["snapshot"]["company"]
        printed = c.get("/api/v1/invoices/" + d + "/print").text
        assert (
            "Tax" not in printed
            and "الضريبة" not in printed
            and ("14.02" if language == "ar" else "14,02") in printed
        )
    assert "tax_id" not in state(c)["settings"] and "default_tax" not in state(c)["settings"]


def test_new_product_opening_stock_is_atomic_and_has_no_supplier_debt(c):
    supplier = party(c, "supplier", "New supplier")
    category = ok(req(c, "/categories", {"name": "Supplies"}))["id"]
    payload = {
        "name": "Cable",
        "category_id": category,
        "supplier_id": supplier,
        "unit": "meter",
        "stock_mode": "existing",
        "opening_quantity": "12.375",
        "warehouse_id": "main",
        "purchase_cost": "7.25",
    }
    key = str(uuid.uuid4())
    product_id = ok(req(c, "/products", payload, key))["id"]
    assert ok(req(c, "/products", payload, key))["id"] == product_id
    s = state(c)
    assert len(s["products"]) == 1 and s["products"][0]["supplier_id"] == supplier
    assert s["stock"][0]["quantity"] == "12.375" and len(s["movements"]) == 1
    assert s["documents"] == [] and s["payments"] == []
    # Editing product details must never add the opening quantity a second time.
    edit = {
        k: v
        for k, v in payload.items()
        if k not in ("opening_quantity", "warehouse_id", "stock_mode")
    }
    edit["name"] = "Cable renamed"
    ok(req(c, "/products/" + product_id, edit, method="PATCH"))
    assert state(c)["stock"][0]["quantity"] == "12.375"
    assert req(c, "/products/" + product_id, payload, method="PATCH").status_code == 422


def test_product_supplier_and_quantity_validation_roll_back(c):
    supplier = party(c, "supplier")
    customer = party(c)
    category = ok(req(c, "/categories", {"name": "Hardware"}))["id"]
    base = {
        "name": "Lamp",
        "category_id": category,
        "supplier_id": supplier,
        "unit": "piece",
        "opening_quantity": "3",
        "warehouse_id": "main",
        "purchase_cost": "5",
    }
    for change in (
        {"supplier_id": None},
        {"supplier_id": customer},
        {"opening_quantity": "-1"},
        {"opening_quantity": "1.5"},
        {"warehouse_id": None},
    ):
        assert req(c, "/products", {**base, **change}).status_code == 422
    assert req(c, "/products", {**base, "warehouse_id": "missing"}).status_code == 404
    ok(req(c, "/parties/" + supplier, method="DELETE"))
    assert req(c, "/products", base).status_code == 422
    s = state(c)
    assert not s["products"] and not s["stock"] and not s["movements"]


def test_new_customer_sale_and_template_use_current_settings_logo(c):
    p = product(c)
    stock(c, p)
    customer = ok(
        req(
            c,
            "/parties",
            {
                "kind": "customer",
                "name": "New customer",
                "phone": "0612345678",
                "address": "Casablanca",
            },
        )
    )["id"]
    d = ok(doc(c, p, party_id=customer, payment="40", due_date="2026-11-16"))["id"]
    before = getdoc(c, d)["snapshot"]
    # A logo added after an invoice was issued must also appear when reprinting it.
    logo = "data:image/png;base64,iVBORw0KGgo="
    ok(req(c, "/settings", {"company_name": "Current company", "logo": logo}, method="PATCH"))
    html = c.get("/api/v1/invoices/" + d + "/print").text
    assert 'class="company-logo"' in html and logo in html
    assert all(
        label in html
        for label in (
            "QTÉ",
            "DÉSIGNATION",
            "PRIX UNITAIRE",
            "MONTANT",
            "TOTAL",
            "Numéro",
            "Date",
            "Échéance",
        )
    )
    assert "New customer" in html and "16/11/2026" in html and "Original company" in html
    assert getdoc(c, d)["snapshot"] == before
    assert "Tax" not in html and "Powered by" not in html
    assert getdoc(c, d)["paid"] == "40.00"
    assert doc(c, p, party_id=None, payment="0").status_code == 422
    walkin = ok(doc(c, p, party_id=None, payment="160"))["id"]
    assert "Client de passage" in c.get("/api/v1/invoices/" + walkin + "/print").text


def test_delivery_note_print_has_only_products_and_quantities(c):
    p = product(c)
    delivery = ok(
        doc(
            c,
            p,
            kind="delivery",
            party_id=party(c),
            confirm=True,
            fulfill=False,
            payment="0",
        )
    )["id"]

    html = c.get("/api/v1/invoices/" + delivery + "/print").text

    assert "BON DE LIVRAISON" in html
    assert "Coffee" in html and "QTÉ" in html and "<bdi>2</bdi>" in html
    assert "DÉSIGNATION" in html
    assert "PRIX UNITAIRE" not in html
    assert "MONTANT" not in html and ">TOTAL<" not in html
