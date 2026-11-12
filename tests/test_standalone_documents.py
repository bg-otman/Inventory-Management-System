"""Standalone documents reuse accounts and numbering without catalogue or stock posting."""

import pytest
from decimal import Decimal
from test_workflows import c, req, ok, state, party, getdoc, product, stock, doc
from test_documents_v150 import update


def standalone(c, kind="sale", **changes):
    payload = dict(
        kind=kind,
        items=[
            dict(name="Prestation libre <test>", unit="meter", quantity="2.5", price="7.123456")
        ],
    )
    payload.update(changes)
    return req(c, "/documents", payload)


@pytest.mark.parametrize("kind", ["sale", "quote", "delivery"])
@pytest.mark.parametrize("walkin", [False, True])
def test_create_print_and_edit_without_catalogue_or_warehouse(c, kind, walkin):
    who = None if walkin else party(c)
    before = state(c)
    payment = "17.81" if kind == "sale" and walkin else "0"
    id = ok(standalone(c, kind, party_id=who, payment=payment))["id"]
    d = getdoc(c, id)
    assert d["warehouse_id"] is None and not d["fulfilled"]
    assert d["party_id"] == who and d["total"] == "17.81"
    assert d["items"][0]["product_id"] is None and d["items"][0]["warehouse_id"] is None
    assert d["snapshot"]["lines"][0]["warehouse_name"] == ""
    html = c.get("/api/v1/invoices/" + id + "/print")
    assert html.status_code == 200 and "Prestation libre &lt;test&gt;" in html.text
    assert ("Client de passage" if walkin else "Customer") in html.text
    assert "Entrepôt" not in html.text
    ok(
        update(
            c,
            d,
            notes="Correction sans stock",
            items=[dict(name="Corrigé", unit="kg", quantity="2.5", price="7.123456")],
        )
    )
    changed = getdoc(c, id)
    assert changed["number"] == d["number"] and changed["revision"] == 1
    assert changed["snapshot"]["revisions"][0]["before"]["total"] == "17.81"
    assert update(c, d, notes="Périmé").status_code == 409
    after = state(c)
    for key in ("products", "stock", "movements"):
        assert after[key] == before[key] == []
    if kind == "sale" and not walkin:
        assert after["parties"][0]["balance"] == "17.81"
    if kind != "sale":
        for key in ("parties", "payments", "receipts"):
            assert after[key] == before[key]


@pytest.mark.parametrize(
    "source_kind,target_kind",
    [
        ("sale", "quote"),
        ("sale", "delivery"),
        ("quote", "sale"),
        ("quote", "delivery"),
        ("delivery", "sale"),
        ("delivery", "quote"),
    ],
)
def test_all_conversions_preserve_standalone_mode_and_do_not_post_twice(
    c, source_kind, target_kind
):
    who = party(c)
    source = ok(standalone(c, source_kind, party_id=who))["id"]
    before = state(c)
    target = ok(req(c, f"/documents/{source}/convert", dict(kind=target_kind)))["id"]
    assert ok(req(c, f"/documents/{source}/convert", dict(kind=target_kind)))["id"] == target
    d = getdoc(c, target)
    assert d["kind"] == target_kind and d["source_id"] == source
    assert d["warehouse_id"] is None and d["party_id"] == who and not d["fulfilled"]
    assert d["items"][0]["product_id"] is None and d["items"][0]["warehouse_id"] is None
    after = state(c)
    for key in ("stock", "products", "movements", "parties", "payments", "receipts"):
        assert after[key] == before[key]
    assert getdoc(c, source) == next(d for d in before["documents"] if d["id"] == source)
    assert ok(req(c, f"/documents/{target}/convert", dict(kind=source_kind)))["id"] == source
    if target_kind == "sale":
        assert d["status"] == "draft"
        ok(update(c, d, confirm=True))
        assert getdoc(c, target)["status"] == "confirmed"
        assert state(c)["stock"] == []


def test_standalone_sale_payments_corrections_and_deletion_keep_account_rules(c):
    who = party(c)
    id = ok(standalone(c, party_id=who, payment="5"))["id"]
    d = getdoc(c, id)
    before = state(c)
    assert update(c, d, items=[dict(name="Trop bas", quantity="1", price="4")]).status_code == 409
    assert state(c) == before
    assert req(c, f"/documents/{id}/reverse", dict(reason="Erreur")).status_code == 409
    ok(update(c, d, items=[dict(name="Nouvelle ligne", quantity="3", price="10")]))
    assert state(c)["parties"][0]["balance"] == "25.00"
    payment = state(c)["payments"][0]["id"]
    ok(req(c, f"/payments/{payment}/reverse", dict(reason="Correction")))
    ok(req(c, f"/documents/{id}/reverse", dict(reason="Document supprimé")))
    assert getdoc(c, id)["status"] == "reversed"
    assert Decimal(state(c)["parties"][0]["balance"]) == 0
    assert state(c)["products"] == state(c)["stock"] == state(c)["movements"] == []
    assert req(c, f"/documents/{id}/convert", dict(kind="quote")).status_code == 409


@pytest.mark.parametrize("kind", ["quote", "delivery"])
def test_standalone_auxiliary_deletion_has_no_account_or_stock_effect(c, kind):
    who = party(c)
    id = ok(standalone(c, kind, party_id=who))["id"]
    before = state(c)
    ok(req(c, f"/documents/{id}/reverse", dict(reason="Suppression")))
    assert getdoc(c, id)["status"] == "reversed"
    after = state(c)
    for key in ("stock", "products", "movements", "parties", "payments", "receipts"):
        assert after[key] == before[key]


def test_standalone_guards_cannot_bypass_stock_or_walkin_payment_rules(c):
    who = party(c)
    id = ok(standalone(c, party_id=who))["id"]
    before = state(c)
    for changes in (
        dict(fulfill=True),
        dict(warehouse_id="main"),
        dict(items=[dict(name="Article", warehouse_id="main", quantity="1", price="1")]),
    ):
        assert update(c, getdoc(c, id), **changes).status_code in (409, 422)
        assert state(c) == before
    assert req(c, f"/documents/{id}/fulfill").status_code == 422
    assert standalone(c, payment="0").status_code == 422
    assert standalone(c, "purchase", party_id=party(c, "supplier")).status_code == 422
    assert (
        standalone(c, items=[dict(name="", quantity="1", price="1")], party_id=who).status_code
        == 422
    )
    assert (
        standalone(
            c, items=[dict(name="Pièces", quantity="1.5", price="1")], party_id=who
        ).status_code
        == 422
    )
    assert (
        standalone(c, items=[dict(name="Sans prix", quantity="1")], party_id=who).status_code == 422
    )
    p = product(c)
    stock(c, p)
    regular = getdoc(c, ok(doc(c, p, party_id=who, payment="0"))["id"])
    before = state(c)
    assert update(c, regular, warehouse_id=None, fulfill=False).status_code == 409
    assert state(c) == before


def test_standalone_draft_confirmation_endpoint_and_walkin_conversion(c):
    id = ok(standalone(c, "quote"))["id"]
    sale = ok(req(c, f"/documents/{id}/convert", dict(kind="sale")))["id"]
    before = state(c)
    assert (
        req(c, f"/documents/{sale}/confirm", dict(payment="17.81", fulfill=True)).status_code == 422
    )
    assert state(c) == before
    ok(req(c, f"/documents/{sale}/confirm", dict(payment="17.81")))
    d = getdoc(c, sale)
    assert d["status"] == "confirmed" and d["paid"] == d["total"] == "17.81"
    assert not d["fulfilled"] and state(c)["stock"] == []


def test_conversions_through_three_types_reuse_the_same_linked_invoice(c):
    quote = ok(standalone(c, "quote", party_id=party(c)))["id"]
    sale = ok(req(c, f"/documents/{quote}/convert", dict(kind="sale")))["id"]
    ok(update(c, getdoc(c, sale), confirm=True))
    delivery = ok(req(c, f"/documents/{sale}/convert", dict(kind="delivery")))["id"]
    before = state(c)
    assert ok(req(c, f"/documents/{delivery}/convert", dict(kind="quote")))["id"] == quote
    assert ok(req(c, f"/documents/{delivery}/convert", dict(kind="sale")))["id"] == sale
    assert ok(req(c, f"/documents/{quote}/convert", dict(kind="delivery")))["id"] == delivery
    assert state(c) == before
