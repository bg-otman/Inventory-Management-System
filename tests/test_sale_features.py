"""Product prices/removal, invoice repricing, and atomic multi-depot sales."""

import uuid
from decimal import Decimal as D
import pytest
from test_workflows import c, req, ok, state, product, party, stock, doc, getdoc


def quantities(c, p):
    return {x["warehouse_id"]: x["quantity"] for x in state(c)["stock"] if x["product_id"] == p}


def line(p, warehouse, quantity="1", price="10"):
    return dict(product_id=p, warehouse_id=warehouse, quantity=quantity, price=price)


def amend(c, d, prices, discount="0", key=None):
    return req(
        c,
        "/documents/" + d["id"] + "/prices",
        {
            "items": [{"id": l["id"], "price": p} for l, p in zip(d["items"], prices)],
            "discount": discount,
        },
        key=key,
        method="PATCH",
    )


def test_retail_wholesale_optional_exact_and_independent(c):
    p = product(c)
    row = state(c)["products"][0]
    assert row["price"] is row["wholesale_price"] is None
    payload = {
        "name": row["name"],
        "category_id": row["category_id"],
        "supplier_id": row["supplier_id"],
        "unit": "kg",
        "price": "15.75",
        "wholesale_price": "12.05",
        "purchase_cost": "7.25",
    }
    ok(req(c, "/products/" + p, payload, method="PATCH"))
    row = state(c)["products"][0]
    assert (row["price"], row["wholesale_price"], row["purchase_cost"]) == (
        "15.75",
        "12.05",
        "7.25",
    )
    del payload["wholesale_price"]  # Legacy clients must not erase the second price.
    ok(req(c, "/products/" + p, payload, method="PATCH"))
    assert state(c)["products"][0]["wholesale_price"] == "12.05"
    for invalid in ("-0.01", "2.1234567"):
        assert (
            req(
                c, "/products/" + p, {**payload, "wholesale_price": invalid}, method="PATCH"
            ).status_code
            == 422
        )
    for value, expected in [("0", "0.00"), (None, None)]:
        ok(req(c, "/products/" + p, {**payload, "wholesale_price": value}, method="PATCH"))
        assert state(c)["products"][0]["wholesale_price"] == expected


def test_remove_restore_preserves_stock_and_history(c):
    p = product(c)
    stock(c, p)
    customer = party(c)
    sale = ok(doc(c, p, party_id=customer, payment="20"))["id"]
    deferred = ok(doc(c, p, party_id=customer, payment="0", fulfill=False))["id"]
    before = state(c)
    key = str(uuid.uuid4())
    ok(req(c, "/products/" + p, key=key, method="DELETE"))
    ok(req(c, "/products/" + p, key=key, method="DELETE"))
    after = state(c)
    assert not after["products"][0]["active"]
    for k in ["stock", "documents", "payments", "receipts", "parties", "movements"]:
        assert after[k] == before[k]
    assert len([a for a in after["activity"] if a["action"] == "product.removed"]) == 1
    assert doc(c, p, party_id=customer, payment="0").status_code == 422
    assert "Coffee" in c.get("/api/v1/invoices/" + sale + "/print").text
    # Existing commitments remain fulfillable and reversible after removal.
    ok(req(c, "/documents/" + deferred + "/fulfill"))
    ok(req(c, "/documents/" + deferred + "/reverse", {"reason": "Canceled"}))
    assert quantities(c, p) == {"main": "8.000"}
    ok(req(c, "/products/" + p + "/restore"))
    assert state(c)["products"][0]["active"]
    ok(doc(c, p, party_id=customer, payment="0"))


@pytest.mark.parametrize("language", ["fr"])
def test_one_sale_from_two_warehouses_and_reversal(c, language):
    p = product(c)
    stock(c, p, 10)
    customer = party(c)
    warehouse = ok(req(c, "/warehouses", {"name": "Dépôt B <est>"}))["id"]
    ok(
        req(
            c,
            "/stock/adjust",
            {"product_id": p, "warehouse_id": warehouse, "quantity": "4", "reason": "Opening"},
        )
    )
    d = ok(
        doc(
            c,
            p,
            party_id=customer,
            payment="0",
            language=language,
            items=[line(p, "main", "1.5", "12.05"), line(p, warehouse, "2", "10")],
        )
    )["id"]
    assert quantities(c, p) == {"main": "8.500", warehouse: "2.000"}
    saved = getdoc(c, d)
    assert saved["total"] == "38.08" and {x["warehouse_id"] for x in saved["items"]} == {
        "main",
        warehouse,
    }
    html = c.get("/api/v1/invoices/" + d + "/print").text
    assert "Dépôt B &lt;est&gt;" in html and "Main" in html
    assert ("Entrepôt" if language == "fr" else "المستودع") in html
    assert ("38,08" if language == "fr" else "38.08") in html
    ok(req(c, "/documents/" + d + "/reverse", {"reason": "Wrong sale"}))
    assert quantities(c, p) == {"main": "10.000", warehouse: "4.000"}


def test_multiwarehouse_failures_are_atomic_and_deferred_delivery_uses_line_warehouse(c):
    p = product(c)
    stock(c, p, 4)
    customer = party(c)
    warehouse = ok(req(c, "/warehouses", {"name": "Second"}))["id"]
    before = state(c)
    for items in (
        [line(p, "main", "1"), line(p, warehouse, "1")],
        [line(p, "main", "3"), line(p, "main", "3")],
    ):
        assert doc(c, p, party_id=customer, payment="0", items=items).status_code == 409
        assert state(c) == before
    assert doc(c, p, party_id=customer, payment="0", items=[line(p, "missing")]).status_code == 404
    d = ok(
        doc(
            c,
            p,
            party_id=customer,
            payment="0",
            fulfill=False,
            items=[line(p, "main", "1"), line(p, warehouse, "2")],
        )
    )["id"]
    assert req(c, "/documents/" + d + "/fulfill").status_code == 409
    assert quantities(c, p) == {"main": "4.000"} and not getdoc(c, d)["fulfilled"]
    ok(
        req(
            c,
            "/stock/adjust",
            {"product_id": p, "warehouse_id": warehouse, "quantity": "3", "reason": "Received"},
        )
    )
    key = str(uuid.uuid4())
    ok(req(c, "/documents/" + d + "/fulfill", key=key))
    ok(req(c, "/documents/" + d + "/fulfill", key=key))
    assert quantities(c, p) == {"main": "3.000", warehouse: "1.000"}
    supplier = party(c, "supplier")
    assert (
        doc(
            c, p, kind="purchase", party_id=supplier, payment="0", items=[line(p, warehouse)]
        ).status_code
        == 422
    )


def test_price_edit_updates_invoice_and_credit_without_stock_or_cash_changes(c):
    p = product(c)
    stock(c, p)
    customer = party(c)
    d = getdoc(c, ok(doc(c, p, party_id=customer, payment="50"))["id"])
    before = state(c)
    key = str(uuid.uuid4())
    ok(amend(c, d, ["60"], "10", key))
    ok(amend(c, d, ["60"], "10", key))
    after = state(c)
    changed = getdoc(c, d["id"])
    assert changed["number"] == d["number"] and changed["issued_at"] == d["issued_at"]
    assert (changed["subtotal"], changed["discount"], changed["total"], changed["paid"]) == (
        "120.00",
        "10.00",
        "110.00",
        "50.00",
    )
    assert next(x for x in after["parties"] if x["id"] == customer)["balance"] == "60.00"
    for k in ("stock", "movements", "payments", "receipts", "products"):
        assert after[k] == before[k]
    revision = changed["snapshot"]["price_revisions"]
    assert (
        len(revision) == 1
        and revision[0]["before"]["total"] == "160.00"
        and revision[0]["after"]["total"] == "110.00"
    )
    html = c.get("/api/v1/invoices/" + d["id"] + "/print").text
    assert "110,00" in html and "60,00" in html and "10,00" in html
    # Identical edits with a new key are harmless, too.
    ok(amend(c, changed, ["60"], "10"))
    assert getdoc(c, d["id"])["snapshot"] == changed["snapshot"]
    # A larger price correctly reopens credit, without inventing a payment.
    ok(amend(c, changed, ["100"], "0"))
    assert next(x for x in state(c)["parties"] if x["id"] == customer)["balance"] == "150.00"


def test_price_edit_validation_rollback_and_refund(c):
    p = product(c)
    stock(c, p)
    customer = party(c)
    d = getdoc(c, ok(doc(c, p, party_id=customer, payment="100"))["id"])
    before = state(c)
    for prices, discount, status in [(["40"], "0", 409), (["80"], "161", 422), (["-1"], "0", 422)]:
        assert amend(c, d, prices, discount).status_code == status
        assert state(c) == before
    assert (
        req(
            c,
            "/documents/" + d["id"] + "/prices",
            {"items": [{"id": "foreign", "price": "10"}]},
            method="PATCH",
        ).status_code
        == 422
    )
    assert (
        req(
            c,
            "/documents/" + d["id"] + "/prices",
            {"items": [{"id": d["items"][0]["id"], "price": "80"}] * 2},
            method="PATCH",
        ).status_code
        == 422
    )
    assert state(c) == before
    # Actual refund is recorded first; the repricing never modifies cash records.
    ok(
        req(
            c,
            "/payments",
            {
                "party_id": customer,
                "amount": "20",
                "direction": "paid",
                "paid_at": "2026-10-18",
                "auto_allocate": True,
            },
        )
    )
    ok(amend(c, d, ["40"]))
    updated = getdoc(c, d["id"])
    assert updated["paid"] == updated["total"] == "80.00"
    assert next(x for x in state(c)["parties"] if x["id"] == customer)["balance"] == "0.00"


def test_price_edit_restrictions_for_walkin_draft_purchase_and_reversed(c):
    p = product(c)
    stock(c, p, 20)
    d = getdoc(c, ok(doc(c, p))["id"])
    before = state(c)
    assert amend(c, d, ["90"]).status_code == 409 and state(c) == before
    # Walk-in line changes are allowed if the fully paid total stays identical.
    ok(amend(c, d, ["90"], "20"))
    assert getdoc(c, d["id"])["total"] == "160.00"
    customer = party(c)
    supplier = party(c, "supplier")
    for kwargs in (
        {"party_id": customer, "confirm": False, "fulfill": False},
        {"party_id": supplier, "kind": "purchase"},
    ):
        other = getdoc(c, ok(doc(c, p, payment="0", **kwargs))["id"])
        assert amend(c, other, ["70"]).status_code == 409
    reverse = getdoc(c, ok(doc(c, p, party_id=customer, payment="0"))["id"])
    ok(req(c, "/documents/" + reverse["id"] + "/reverse", {"reason": "Mistake"}))
    assert amend(c, reverse, ["70"]).status_code == 409


@pytest.mark.parametrize("language", ["fr"])
def test_six_decimal_prices_survive_storage_sales_repricing_and_printing(c, language):
    category = ok(req(c, "/categories", {"name": "Precision"}))["id"]
    supplier = party(c, "supplier")
    customer = party(c)
    pid = ok(
        req(
            c,
            "/products",
            {
                "name": "Pièce précise",
                "category_id": category,
                "supplier_id": supplier,
                "warehouse_id": "main",
                "opening_quantity": "10000",
                "purchase_cost": "0.000125",
                "price": "0.001235",
                "wholesale_price": "0.000987",
                "language": language,
            },
        )
    )["id"]
    s = state(c)
    p = next(p for p in s["products"] if p["id"] == pid)
    assert (p["purchase_cost"], p["price"], p["wholesale_price"]) == (
        "0.000125",
        "0.001235",
        "0.000987",
    )
    purchase = next(d for d in s["documents"] if d["kind"] == "purchase")
    assert purchase["total"] == "1.25" and purchase["items"][0]["price"] == "0.000125"
    sale = getdoc(
        c,
        ok(
            doc(
                c,
                pid,
                party_id=customer,
                payment="0",
                language=language,
                items=[line(pid, "main", "1000", "0.001235")],
            )
        )["id"],
    )
    assert sale["total"] == "1.24"
    html = c.get("/api/v1/invoices/" + sale["id"] + "/print").text
    assert ("0,001235" if language == "fr" else "0.001235") in html
    assert html.index("DÉSIGNATION" if language == "fr" else "الوصف") < html.index(
        "QTÉ" if language == "fr" else "الكمية"
    )
    ok(amend(c, sale, ["0.001005"]))
    updated = getdoc(c, sale["id"])
    assert updated["total"] == "1.01" and updated["items"][0]["price"] == "0.001005"
    assert next(p for p in state(c)["parties"] if p["id"] == customer)["balance"] == "1.01"
    assert (
        req(
            c,
            "/documents/" + sale["id"] + "/prices",
            {"items": [{"id": updated["items"][0]["id"], "price": "0.0000001"}]},
            method="PATCH",
        ).status_code
        == 422
    )


@pytest.mark.parametrize(
    "quantity,price,total",
    [
        ("1", "2.675", "2.68"),
        ("3", "0.335", "1.01"),
        ("0.001", "5", "0.01"),
        ("1.5", "0.333333", "0.50"),
    ],
)
def test_line_rounding_uses_full_unit_price(c, quantity, price, total):
    p = product(c)
    stock(c, p)
    customer = party(c)
    sale = getdoc(
        c,
        ok(doc(c, p, party_id=customer, payment="0", items=[line(p, "main", quantity, price)]))[
            "id"
        ],
    )
    assert sale["total"] == total
