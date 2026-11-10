"""Purchase creation and exact, bidirectional account operations."""

import uuid
from decimal import Decimal as D
import pytest
from test_workflows import c, req, ok, state, product, party, stock, doc, getdoc


def account(c, id):
    return next(p for p in state(c)["parties"] if p["id"] == id)


def pay(c, id, amount, direction, **extra):
    return ok(
        req(
            c,
            "/payments",
            {
                "party_id": id,
                "amount": amount,
                "direction": direction,
                "paid_at": "2026-10-17",
                "auto_allocate": True,
                **extra,
            },
        )
    )


def test_new_product_creates_one_complete_purchase_and_payment(c):
    category = ok(req(c, "/categories", {"name": "Cables"}))["id"]
    supplier = party(c, "supplier")
    payload = {
        "name": "Cable",
        "category_id": category,
        "supplier_id": supplier,
        "unit": "meter",
        "opening_quantity": "12.375",
        "warehouse_id": "main",
        "purchase_cost": "7.25",
        "price": "11.00",
        "discount": "1.00",
        "payment": "20.00",
        "due_date": "2026-11-01",
        "language": "fr",
    }
    key = str(uuid.uuid4())
    created = ok(req(c, "/products", payload, key))
    assert ok(req(c, "/products", payload, key)) == created
    s = state(c)
    assert len(s["documents"]) == len(s["payments"]) == len(s["receipts"]) == 1
    purchase = getdoc(c, created["purchase_id"])
    assert (
        purchase["kind"] == "purchase"
        and purchase["status"] == "confirmed"
        and purchase["fulfilled"]
    )
    assert (
        purchase["party_id"] == supplier
        and purchase["warehouse_id"] == "main"
        and purchase["language"] == "fr"
    )
    assert (
        purchase["items"][0]["product_id"] == created["id"]
        and purchase["items"][0]["price"] == "7.25"
    )
    assert (
        purchase["subtotal"] == "89.72"
        and purchase["total"] == "88.72"
        and purchase["paid"] == "20.00"
    )
    assert s["stock"][0]["quantity"] == "12.375" and len(s["movements"]) == 1
    assert account(c, supplier)["balance"] == "-68.72"
    assert s["receipts"][0]["details"]["balance_before"] == "-88.72"
    assert s["receipts"][0]["details"]["balance_after"] == "-68.72"
    assert c.get("/api/v1/invoices/" + purchase["id"] + "/print").status_code == 200
    # A failing purchase rolls the product and every dependent row back too.
    before = state(c)
    assert (
        req(c, "/products", {**payload, "name": "Bad purchase", "payment": "100"}).status_code
        == 422
    )
    assert state(c) == before


def test_existing_catalog_and_pending_invoice_paths_do_not_double_stock(c):
    category = ok(req(c, "/categories", {"name": "Tools"}))["id"]
    supplier = party(c, "supplier")
    base = {
        "name": "Lamp",
        "category_id": category,
        "supplier_id": supplier,
        "warehouse_id": "main",
    }
    opening = ok(req(c, "/products", {**base, "stock_mode": "existing", "opening_quantity": "4"}))
    assert opening["purchase_id"] is None and not state(c)["documents"]
    catalog = ok(
        req(c, "/products", {**base, "stock_mode": "catalog", "purchase_cost": "10", "price": "20"})
    )
    assert catalog["purchase_id"] is None and len(state(c)["stock"]) == 1
    purchase = ok(doc(c, catalog["id"], kind="purchase", party_id=supplier, payment="0"))["id"]
    assert getdoc(c, purchase)["items"][0]["quantity"] == "2.000"
    pending = ok(
        req(
            c,
            "/products",
            {**base, "name": "Pending cost", "opening_quantity": "3", "invoice_ready": False},
        )
    )
    d = getdoc(c, pending["purchase_id"])
    assert d["status"] == "draft" and d["fulfilled"] and d["items"][0]["price"] is None
    ok(
        req(
            c,
            "/documents/" + d["id"],
            {
                "kind": "purchase",
                "party_id": supplier,
                "warehouse_id": "main",
                "items": [{"product_id": pending["id"], "quantity": "3", "price": "12.50"}],
            },
            method="PATCH",
        )
    )
    assert (
        next(x for x in state(c)["stock"] if x["product_id"] == pending["id"])["quantity"]
        == "3.000"
    )
    assert len([m for m in state(c)["movements"] if m["product_id"] == pending["id"]]) == 1


@pytest.mark.parametrize(
    "kind,normal,opposite,sign",
    [("customer", "received", "paid", 1), ("supplier", "paid", "received", -1)],
)
def test_payments_in_both_directions_settle_refund_and_track_credit(
    c, kind, normal, opposite, sign
):
    p = product(c)
    stock(c, p, 20)
    who = party(c, kind)
    a = ok(
        doc(
            c,
            p,
            kind="sale" if kind == "customer" else "purchase",
            party_id=who,
            payment="0",
            items=[{"product_id": p, "quantity": "1", "price": "100"}],
        )
    )["id"]
    b = ok(
        doc(
            c,
            p,
            kind="sale" if kind == "customer" else "purchase",
            party_id=who,
            payment="0",
            items=[{"product_id": p, "quantity": "1", "price": "50"}],
        )
    )["id"]
    first = pay(c, who, "200", normal)
    assert getdoc(c, a)["paid"] == "100.00" and getdoc(c, b)["paid"] == "50.00"
    assert D(account(c, who)["balance"]) == -50 * sign
    returned = pay(c, who, "80", opposite)
    assert D(account(c, who)["balance"]) == 30 * sign
    assert sum(D(getdoc(c, x)["paid"]) for x in (a, b)) == 120
    assert all(D(p["available"]) == 0 for p in state(c)["payments"])
    receipt = next(r for r in state(c)["receipts"] if r["id"] == returned["receipt_id"])
    assert D(receipt["details"]["balance_before"]) == -50 * sign
    assert D(receipt["details"]["balance_after"]) == 30 * sign
    assert D(receipt["details"]["credit_offset"]) == 50
    assert sum(D(i["change"]) for i in receipt["details"]["invoices"]) == -30
    # A dependent refund cannot make the paid total negative when an earlier payment is reversed.
    before = state(c)
    assert (
        req(c, "/payments/" + first["id"] + "/reverse", {"reason": "Wrong entry"}).status_code
        == 409
    )
    assert state(c) == before
    reversal = ok(req(c, "/payments/" + returned["id"] + "/reverse", {"reason": "Wrong refund"}))
    assert reversal["receipt_id"] and D(account(c, who)["balance"]) == -50 * sign
    assert sum(D(getdoc(c, x)["paid"]) for x in (a, b)) == 150
    assert next(p for p in state(c)["payments"] if p["id"] == first["id"])["available"] == "50.00"
    assert "annulé" in c.get("/api/v1/receipts/" + returned["receipt_id"] + "/print").text


@pytest.mark.parametrize(
    "kind,normal,opposite,sign",
    [("customer", "received", "paid", 1), ("supplier", "paid", "received", -1)],
)
def test_cash_advances_before_invoices_can_move_in_either_direction(
    c, kind, normal, opposite, sign
):
    who = party(c, kind)
    outgoing = pay(c, who, "120.25", opposite)
    assert D(account(c, who)["balance"]) == D("120.25") * sign
    incoming = pay(c, who, "20.10", normal)
    assert D(account(c, who)["balance"]) == D("100.15") * sign
    assert (
        next(p for p in state(c)["payments"] if p["id"] == outgoing["id"])["available"] == "100.15"
    )
    assert next(p for p in state(c)["payments"] if p["id"] == incoming["id"])["available"] == "0.00"
    assert not state(c)["documents"] and not state(c)["stock"]
    # Undoing a cash receipt releases the corresponding offset, with no phantom invoice.
    ok(req(c, "/payments/" + incoming["id"] + "/reverse", {"reason": "Incorrect amount"}))
    assert D(account(c, who)["balance"]) == D("120.25") * sign


def test_receipts_are_idempotent_escaped_immutable_and_use_company_logo(c):
    who = party(c, name="Client <script>alert(1)</script>")
    payload = {
        "party_id": who,
        "amount": "30.25",
        "direction": "received",
        "paid_at": "2026-10-17",
        "notes": "Deposit <b>cash</b>",
    }
    key = str(uuid.uuid4())
    r = ok(req(c, "/payments", payload, key))
    assert ok(req(c, "/payments", payload, key)) == r and len(state(c)["receipts"]) == 1
    details = state(c)["receipts"][0]["details"]
    pay(c, who, "10.00", "paid")
    logo = "data:image/png;base64,iVBORw0KGgo="
    ok(req(c, "/settings", {"company_name": "Changed company", "logo": logo}, method="PATCH"))
    html = c.get("/api/v1/receipts/" + r["receipt_id"] + "/print").text
    assert logo in html and "Original company" in html and "30,25" in html
    assert (
        "<script>alert(1)</script>" not in html
        and "&lt;script&gt;" in html
        and "&lt;b&gt;cash&lt;/b&gt;" in html
    )
    assert all(
        k in html
        for k in (
            "REÇU DE PAIEMENT",
            "N° de reçu",
            "Solde avant l’opération",
            "Solde après l’opération",
        )
    )
    assert "Tax" not in html and "Reference" not in html
    assert next(x for x in state(c)["receipts"] if x["id"] == r["receipt_id"])["details"] == details
    assert req(c, "/payments", {**payload, "language": "ar"}).status_code == 422


def test_allocating_existing_deposit_creates_receipt_without_moving_cash(c):
    p = product(c)
    stock(c, p)
    who = party(c)
    deposited = pay(c, who, "60", "received")
    d = ok(doc(c, p, party_id=who, payment="0"))["id"]
    before = account(c, who)["balance"]
    r = ok(
        req(
            c,
            "/payments/" + deposited["id"] + "/allocate",
            {"allocations": [{"document_id": d, "amount": "60"}]},
        )
    )
    assert account(c, who)["balance"] == before and getdoc(c, d)["paid"] == "60.00"
    assert len(state(c)["payments"]) == 1 and len(state(c)["receipts"]) == 2
    receipt = next(x for x in state(c)["receipts"] if x["id"] == r["receipt_id"])
    assert receipt["action"] == "allocation" and receipt["details"]["amount"] == "60.00"
    assert receipt["details"]["balance_before"] == receipt["details"]["balance_after"]


def test_removed_reference_input_rejected_and_hidden(c):
    who = party(c)
    assert (
        req(
            c,
            "/payments",
            {"party_id": who, "amount": "10", "paid_at": "2026-10-17", "reference": "unused"},
        ).status_code
        == 422
    )
    p = product(c)
    stock(c, p)
    assert doc(c, p, reference="unused").status_code == 422
    pay(c, who, "10", "received")
    ok(doc(c, p))
    assert all("reference" not in p for p in state(c)["payments"])
    assert all("reference" not in d for d in state(c)["documents"])


def test_payment_opened_from_an_invoice_prioritizes_that_invoice(c):
    p = product(c)
    stock(c, p)
    who = party(c)
    a = ok(doc(c, p, party_id=who, payment="0"))["id"]
    b = ok(doc(c, p, party_id=who, payment="0"))["id"]
    pay(c, who, "100", "received", preferred_document_id=b)
    assert D(getdoc(c, a)["paid"]) == 0 and D(getdoc(c, b)["paid"]) == 100
