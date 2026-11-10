"""Corrections, commercial documents, and archive guards using real API transactions."""

from decimal import Decimal
from test_workflows import c, req, ok, state, product, party, stock, doc, getdoc


def create(c, kind, **kw):
    payload = dict(
        kind=kind,
        warehouse_id="main",
        items=[dict(name="Article libre", quantity="2", price="7.123456")],
        fulfill=False,
        payment="0",
    )
    payload.update(kw)
    return ok(req(c, "/documents", payload))["id"]


def update(c, d, **kw):
    payload = {
        k: d[k]
        for k in (
            "kind",
            "party_id",
            "warehouse_id",
            "discount",
            "due_date",
            "language",
            "notes",
            "revision",
        )
    }
    payload.update(
        items=[
            {
                k: v
                for k, v in l.items()
                if k in ("product_id", "name", "unit", "quantity", "price", "warehouse_id")
            }
            for l in d["items"]
        ],
        confirm=d["status"] == "confirmed",
        fulfill=d["fulfilled"],
    )
    payload.update(kw)
    return req(c, "/documents/" + d["id"], payload, method="PATCH")


def qty(c, p, w="main"):
    return Decimal(
        next(
            (
                s["quantity"]
                for s in state(c)["stock"]
                if s["product_id"] == p and s["warehouse_id"] == w
            ),
            "0",
        )
    )


def test_free_quotes_named_and_walkin_do_not_create_stock_or_credit(c):
    who = party(c)
    before = state(c)
    for customer in (who, None):
        id = create(c, "quote", party_id=customer)
        d = getdoc(c, id)
        assert d["number"].startswith("DEV-") and d["total"] == "14.25" and not d["fulfilled"]
        html = c.get("/api/v1/invoices/" + id + "/print").text
        assert "DEVIS" in html and "Article libre" in html and 'lang="fr"' in html
    after = state(c)
    for key in ["stock", "payments", "parties", "movements"]:
        assert after[key] == before[key]


def test_quotes_delivery_edits_preserve_number_and_history(c):
    for kind in ["quote", "delivery"]:
        d = getdoc(c, create(c, kind))
        ok(
            update(
                c,
                d,
                items=[dict(name="Corrigé <test>", quantity="3", price="8.123456")],
                notes="Détail <script>",
            )
        )
        changed = getdoc(c, d["id"])
        assert (
            changed["number"] == d["number"]
            and changed["total"] == "24.37"
            and changed["revision"] == 1
        )
        assert changed["snapshot"]["revisions"][0]["before"]["total"] == "14.25"
        html = c.get("/api/v1/invoices/" + d["id"] + "/print").text
        assert "&lt;script&gt;" in html and "<script>" not in html
        assert update(c, d, notes="Stale form").status_code == 409
        assert req(c, "/documents/" + d["id"] + "/fulfill").status_code == 422
    assert state(c)["stock"] == []


def test_quote_conversion_requires_catalog_mapping_and_avoids_duplicates(c):
    who = party(c)
    p = product(c)
    stock(c, p, 10)
    quote = create(c, "quote", party_id=who)
    target = ok(req(c, "/documents/" + quote + "/convert", dict(kind="sale")))["id"]
    assert ok(req(c, "/documents/" + quote + "/convert", dict(kind="sale")))["id"] == target
    d = getdoc(c, target)
    assert d["status"] == "draft" and d["source_id"] == quote and qty(c, p) == 10
    assert update(c, d, confirm=True, fulfill=True).status_code == 422
    ok(
        update(
            c,
            d,
            items=[dict(product_id=p, quantity="2", price="7.123456")],
            confirm=True,
            fulfill=True,
        )
    )
    assert qty(c, p) == 8 and getdoc(c, target)["total"] == "14.25"
    assert getdoc(c, quote)["status"] == "confirmed"


def test_invoice_conversions_keep_original_money_and_stock(c):
    p = product(c)
    stock(c, p)
    who = party(c)
    sale = ok(doc(c, p, party_id=who, payment="30"))["id"]
    before = state(c)
    for kind in ["quote", "delivery"]:
        id = ok(req(c, "/documents/" + sale + "/convert", dict(kind=kind)))["id"]
        assert ok(req(c, "/documents/" + id + "/convert", dict(kind="sale")))["id"] == sale
        assert getdoc(c, id)["source_id"] == sale
    after = state(c)
    for key in ["stock", "payments", "receipts", "parties", "movements"]:
        assert after[key] == before[key]
    assert getdoc(c, sale) == next(d for d in before["documents"] if d["id"] == sale)


def test_saved_sale_correction_applies_only_stock_difference(c):
    p = product(c)
    stock(c, p)
    who = party(c)
    d = getdoc(c, ok(doc(c, p, party_id=who, payment="20"))["id"])
    payments = state(c)["payments"]
    ok(
        update(
            c, d, items=[dict(product_id=p, quantity="3", price="30.123456")], notes="Correction"
        )
    )
    changed = getdoc(c, d["id"])
    assert qty(c, p) == 7 and changed["total"] == "90.37" and changed["paid"] == "20.00"
    assert changed["number"] == d["number"] and state(c)["payments"] == payments
    assert next(x for x in state(c)["parties"] if x["id"] == who)["balance"] == "70.37"
    before = state(c)
    assert (
        update(c, changed, items=[dict(product_id=p, quantity="11", price="30")]).status_code == 409
    )
    assert state(c) == before
    assert (
        update(c, changed, items=[dict(product_id=p, quantity="1", price="1")]).status_code == 409
    )
    assert state(c) == before


def test_purchase_correction_after_sales_prevents_negative_stock(c):
    p = product(c)
    who = party(c, "supplier")
    d = getdoc(
        c,
        ok(
            doc(
                c,
                p,
                kind="purchase",
                party_id=who,
                payment="0",
                items=[dict(product_id=p, quantity="10", price="4")],
            )
        )["id"],
    )
    ok(doc(c, p, items=[dict(product_id=p, quantity="8", price="10")], payment="80"))
    before = state(c)
    assert update(c, d, items=[dict(product_id=p, quantity="5", price="4")]).status_code == 409
    assert state(c) == before
    ok(update(c, d, items=[dict(product_id=p, quantity="12", price="5.123456")]))
    assert qty(c, p) == 4 and getdoc(c, d["id"])["total"] == "61.48"


def test_correction_moves_product_and_depot_without_double_deduction(c):
    a = product(c)
    b = product(c, "Autre")
    who = party(c)
    stock(c, a, 10)
    wh = ok(req(c, "/warehouses", dict(name="Second")))["id"]
    ok(req(c, "/stock/adjust", dict(product_id=b, warehouse_id=wh, quantity="5", reason="Initial")))
    d = getdoc(c, ok(doc(c, a, party_id=who, payment="0"))["id"])
    ok(update(c, d, items=[dict(product_id=b, warehouse_id=wh, quantity="3", price="10")]))
    assert qty(c, a) == 10 and qty(c, b, wh) == 2


def test_warehouse_removal_guards_and_rename(c):
    assert req(c, "/warehouses/main", method="DELETE").status_code == 409
    wh = ok(req(c, "/warehouses", dict(name="Depot")))["id"]
    ok(req(c, "/warehouses/" + wh, dict(name="Renommé"), method="PATCH"))
    ok(req(c, "/warehouses/" + wh, method="DELETE"))
    assert next(w for w in state(c)["warehouses"] if w["id"] == wh) == dict(
        id=wh, name="Renommé", active=False
    )
    ok(req(c, "/warehouses/" + wh + "/restore"))
    p = product(c)
    stock(c, p)
    assert req(c, "/warehouses/main", method="DELETE").status_code == 409
    who = party(c)
    pending = ok(doc(c, p, party_id=who, warehouse_id=wh, payment="0", fulfill=False))["id"]
    assert req(c, "/warehouses/" + wh, method="DELETE").status_code == 409
    ok(req(c, "/documents/" + pending + "/reverse", dict(reason="Erreur")))
    ok(req(c, "/warehouses/" + wh, method="DELETE"))


def test_auxiliary_payment_allocation_rejected(c):
    who = party(c)
    q = create(c, "quote", party_id=who)
    before = state(c)
    assert (
        req(
            c,
            "/payments",
            dict(
                party_id=who,
                amount="5",
                paid_at="2026-11-08",
                allocations=[dict(document_id=q, amount="5")],
            ),
        ).status_code
        == 422
    )
    assert state(c) == before
    ok(
        req(
            c, "/payments", dict(party_id=who, amount="5", paid_at="2026-11-08", auto_allocate=True)
        )
    )
    assert state(c)["payments"][0]["available"] == "5.00"


def test_walkin_corrections_and_removed_language_fields(c):
    p = product(c)
    stock(c, p)
    d = getdoc(c, ok(doc(c, p))["id"])
    assert update(c, d, items=[dict(product_id=p, quantity="1", price="40")]).status_code == 409
    ok(update(c, d, items=[dict(product_id=p, quantity="1", price="160")]))
    assert qty(c, p) == 9
    assert req(c, "/preferences", dict(language="ar"), method="PATCH").status_code == 422
    cat = state(c)["categories"][0]["id"]
    for key in ("sku", "barcode"):
        assert (
            req(
                c,
                "/products",
                dict(name="Code", category_id=cat, stock_mode="catalog", **{key: "a"}),
            ).status_code
            == 422
        )
    assert "sku" not in state(c)["products"][0] and "barcode" not in state(c)["products"][0]
