"""French/Arabic presentation and compatibility with saved English records."""

import json
from contextlib import contextmanager
import pytest
from app import preferences
from app.db import get_db
from app.main import app
from app.models import Document, Receipt
from test_workflows import c, req, ok, state, product, party, stock, doc, getdoc


@pytest.mark.parametrize(
    "stored,expected",
    [
        (None, "fr"),
        ({"language": "en"}, "fr"),
        ({"language": "fr"}, "fr"),
        ({"language": "ar"}, "fr"),
        ({"language": "invalid"}, "fr"),
        ([], "fr"),
    ],
)
def test_saved_preferences_normalize_without_rewriting(tmp_path, monkeypatch, stored, expected):
    monkeypatch.setattr(preferences, "DATA_DIR", tmp_path)
    path = tmp_path / "preferences.json"
    if stored is not None:
        path.write_text(json.dumps(stored), encoding="utf-8")
    before = path.read_bytes() if path.exists() else None
    assert preferences.read() == {"language": expected}
    assert (path.read_bytes() if path.exists() else None) == before


def test_preference_choices_are_french_and_arabic(c, tmp_path, monkeypatch):
    monkeypatch.setattr(preferences, "DATA_DIR", tmp_path)
    for lang in ("fr",):
        ok(req(c, "/preferences", {"language": lang}, method="PATCH"))
        assert ok(c.get("/api/v1/preferences"))["language"] == lang
    assert req(c, "/preferences", {"language": "en"}, method="PATCH").status_code == 422
    assert ok(c.get("/api/v1/preferences"))["language"] == "fr"


@pytest.mark.parametrize("legacy", ["en", "ar"])
def test_legacy_documents_and_receipts_display_french_without_changing_data(c, legacy):
    p = product(c, "Câble — كابل", unit="meter")
    stock(c, p, 30)
    customer = party(c, name="Client enregistré")
    sale = ok(
        doc(
            c,
            p,
            party_id=customer,
            items=[{"product_id": p, "quantity": "12.375", "price": "100"}],
            payment="25.50",
        )
    )["id"]
    draft = ok(doc(c, p, party_id=customer, confirm=False, fulfill=False, payment="0"))["id"]
    receipt = state(c)["receipts"][0]["id"]
    session = contextmanager(app.dependency_overrides[get_db])
    with session() as db:
        saved = db.get(Document, sale)
        saved.language = legacy
        saved.snapshot = {**saved.snapshot, "language": legacy}
        db.get(Document, draft).language = legacy
        saved_receipt = db.get(Receipt, receipt)
        saved_receipt.snapshot = {**saved_receipt.snapshot, "language": legacy}
        db.commit()
        invoice_snapshot = json.dumps(saved.snapshot, sort_keys=True)
        receipt_snapshot = json.dumps(saved_receipt.snapshot, sort_keys=True)
    before = state(c)
    assert getdoc(c, sale)["language"] == getdoc(c, draft)["language"] == "fr"
    assert getdoc(c, sale)["snapshot"]["language"] == "fr"
    assert before["receipts"][0]["details"]["language"] == "fr"
    invoice = c.get("/api/v1/invoices/" + sale + "/print").text
    printed_receipt = c.get("/api/v1/receipts/" + receipt + "/print").text
    assert 'lang="fr" dir="ltr"' in invoice
    assert all(
        text in invoice
        for text in (
            "FACTURE",
            "12,375",
            "mètre",
            "1\u202f237,50",
            "Client enregistré",
            "Câble — كابل",
        )
    )
    assert all(
        text in printed_receipt for text in ('lang="fr"', "REÇU DE PAIEMENT", "25,50", "À recevoir")
    )
    assert state(c) == before
    with session() as db:
        assert db.get(Document, sale).language == legacy
        assert db.get(Document, draft).language == legacy
        assert json.dumps(db.get(Document, sale).snapshot, sort_keys=True) == invoice_snapshot
        assert json.dumps(db.get(Receipt, receipt).snapshot, sort_keys=True) == receipt_snapshot
    # A legacy draft can be edited/confirmed with the language returned by state.
    ok(
        req(
            c,
            "/documents/" + draft,
            {
                "kind": "sale",
                "party_id": customer,
                "warehouse_id": "main",
                "items": [{"product_id": p, "quantity": "1", "price": "100"}],
                "payment": "0",
                "language": getdoc(c, draft)["language"],
            },
            method="PATCH",
        )
    )
    assert getdoc(c, draft)["language"] == "fr" and getdoc(c, draft)["status"] == "confirmed"


@pytest.mark.parametrize("language,heading,direction,amount", [("fr", "FACTURE", "ltr", "14,02")])
def test_invoice_and_receipt_use_selected_language(c, language, heading, direction, amount):
    p = product(c)
    stock(c, p)
    customer = party(c)
    sale = ok(
        doc(
            c,
            p,
            party_id=customer,
            items=[{"product_id": p, "quantity": "1.5", "price": "10.01"}],
            discount="1",
            payment="14.02",
            language=language,
        )
    )["id"]
    invoice = c.get("/api/v1/invoices/" + sale + "/print").text
    receipt = c.get("/api/v1/receipts/" + state(c)["receipts"][0]["id"] + "/print").text
    for html in (invoice, receipt):
        assert f'lang="{language}" dir="{direction}"' in html
        assert amount in html
    assert heading in invoice
    assert ("REÇU DE PAIEMENT" if language == "fr" else "إيصال دفع") in receipt
    assert getdoc(c, sale)["total"] == getdoc(c, sale)["paid"] == "14.02"
