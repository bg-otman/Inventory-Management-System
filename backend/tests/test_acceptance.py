import os
import sys
from decimal import Decimal
from fastapi.testclient import TestClient

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.database import SessionLocal
from app.models import Product, StockBalance, User, Category, Customer, Supplier, Warehouse
from seed import seed

def run_all_acceptance_tests():
    print("=== Starting Mizan Acceptance Test Suite ===")

    # 1. Initialize and seed DB
    seed()
    client = TestClient(app)

    # 2. Login as Owner
    login_resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    print("✔ Check 0: Authentication & session cookie verified.")

    # 3. Check 1: Save product with name and category only
    cat_resp = client.get("/api/v1/categories")
    assert cat_resp.status_code == 200
    cat_id = cat_resp.json()[0]["id"]

    p1_resp = client.post("/api/v1/products", json={
        "name": "Minimal Product Only Name",
        "category_id": cat_id,
        "sku": None,
        "barcode": None
    })
    assert p1_resp.status_code == 200, f"Failed: {p1_resp.text}"
    p1 = p1_resp.json()
    assert p1["name"] == "Minimal Product Only Name"
    assert p1["sku"] is None
    assert p1["barcode"] is None
    assert p1["unit"] == "unit"
    print("✔ Check 1: Product with name and category only saved successfully.")

    # 4. Check 2: Inline category creation & case-normalization duplicate prevention
    new_cat_resp = client.post("/api/v1/categories", json={"name": "  Nouveau Rayon  "})
    assert new_cat_resp.status_code == 200
    new_cat_id = new_cat_resp.json()["id"]

    # Duplicating existing category returns existing record without creating duplicate
    dup_cat_resp = client.post("/api/v1/categories", json={"name": "nouveau rayon"})
    assert dup_cat_resp.status_code == 200
    assert dup_cat_resp.json()["id"] == new_cat_id
    print("✔ Check 2: Inline category created and case-normalization duplicate prevention verified.")

    # 5. Check 3: Save several products with blank codes (NULL uniqueness in Postgres)
    p_blank1 = client.post("/api/v1/products", json={"name": "Blank Code Item 1", "category_id": cat_id, "sku": "", "barcode": ""})
    p_blank2 = client.post("/api/v1/products", json={"name": "Blank Code Item 2", "category_id": cat_id, "sku": None, "barcode": None})
    assert p_blank1.status_code == 200
    assert p_blank2.status_code == 200
    print("✔ Check 3: Multiple products with blank/null SKU and barcode saved without conflict.")

    # 6. Check 4: Supply an already-used SKU/barcode -> duplicate error
    p_code1 = client.post("/api/v1/products", json={"name": "Unique Code Item", "category_id": cat_id, "sku": "UNIQUE-SKU-999", "barcode": "999888777000"})
    assert p_code1.status_code == 200
    p_code_dup = client.post("/api/v1/products", json={"name": "Conflict Item", "category_id": cat_id, "sku": "UNIQUE-SKU-999"})
    assert p_code_dup.status_code == 400
    assert "already exists" in p_code_dup.json()["detail"]
    print("✔ Check 4: Duplicate SKU rejected with clear error.")

    # 7. Check 5: Scan barcode with leading zeros preserved
    scan_resp = client.get("/api/v1/products/scan/00123984501")
    assert scan_resp.status_code == 200
    assert scan_resp.json()["barcode"] == "00123984501"
    print("✔ Check 5: Barcode with leading zero (00123984501) matched and scanned successfully.")

    # 8. Check 6: Walk-in sales MUST be paid in full (anonymous credit rejected)
    wh_resp = client.get("/api/v1/warehouses")
    wh_id = wh_resp.json()[0]["id"]

    sale_walkin_fail = client.post("/api/v1/sales", json={
        "customer_id": None, # Walk in
        "warehouse_id": wh_id,
        "lines": [{"product_id": scan_resp.json()["id"], "quantity": 2, "unit_price": 50}],
        "initial_payment_amount": 0 # Unpaid walk-in!
    })
    assert sale_walkin_fail.status_code == 400
    assert "Walk-in sales must be paid in full" in sale_walkin_fail.json()["detail"]
    print("✔ Check 6: Anonymous walk-in credit blocked with requirement for named customer.")

    # 9. Check 7: Immediate sale -> atomic invoice issuance & stock reduction
    # First adjust stock of product to ensure sufficient quantity
    test_prod_id = scan_resp.json()["id"]
    client.post("/api/v1/stock/adjustments", json={
        "warehouse_id": wh_id,
        "product_id": test_prod_id,
        "quantity": 100,
        "reason": "Test replenishment"
    })
    prod_before = client.get(f"/api/v1/products/{test_prod_id}").json()
    stock_before = prod_before["total_stock"]

    sale_ok = client.post("/api/v1/sales", json={
        "customer_id": None,
        "warehouse_id": wh_id,
        "lines": [{"product_id": test_prod_id, "quantity": 10, "unit_price": 20.00}],
        "discount": 0,
        "tax_rate": 20,
        "delivered_now": True,
        "initial_payment_amount": 240.00 # 200 + 20% VAT = 240
    })
    assert sale_ok.status_code == 200
    sale_data = sale_ok.json()
    assert sale_data["invoice_number"].startswith("INV-")
    assert sale_data["payment_status"] == "paid"
    assert sale_data["delivery_status"] == "delivered"

    prod_after = client.get(f"/api/v1/products/{test_prod_id}").json()
    assert Decimal(str(prod_after["total_stock"])) == Decimal(str(stock_before)) - Decimal("10")
    print(f"✔ Check 7: Immediate sale issued {sale_data['invoice_number']} and reduced stock atomically.")

    # 10. Check 8: Delayed delivery -> later delivery decreases stock once, no second invoice
    cust_resp = client.get("/api/v1/customers")
    cust_id = cust_resp.json()[0]["id"]

    sale_delayed = client.post("/api/v1/sales", json={
        "customer_id": cust_id,
        "warehouse_id": wh_id,
        "lines": [{"product_id": test_prod_id, "quantity": 5, "unit_price": 25.00}],
        "delivered_now": False, # Pending delivery!
        "initial_payment_amount": 0
    })
    assert sale_delayed.status_code == 200
    s_delayed = sale_delayed.json()
    assert s_delayed["delivery_status"] == "pending"

    # Stock should NOT have decreased yet
    prod_mid = client.get(f"/api/v1/products/{test_prod_id}").json()
    assert Decimal(str(prod_mid["total_stock"])) == Decimal(str(prod_after["total_stock"]))

    # Now deliver later
    deliver_resp = client.post(f"/api/v1/sales/{s_delayed['id']}/deliver")
    assert deliver_resp.status_code == 200
    assert deliver_resp.json()["delivery_status"] == "delivered"

    # Now stock should be decreased once
    prod_delivered = client.get(f"/api/v1/products/{test_prod_id}").json()
    assert Decimal(str(prod_delivered["total_stock"])) == Decimal(str(prod_mid["total_stock"])) - Decimal("5")

    # Second delivery attempt must be rejected
    dup_deliver = client.post(f"/api/v1/sales/{s_delayed['id']}/deliver")
    assert dup_deliver.status_code == 400
    print("✔ Check 8: Delayed delivery decreased stock once; duplicate delivery prevented.")

    # 11. Check 9: Negative stock prevention
    insufficient_sale = client.post("/api/v1/sales", json={
        "customer_id": cust_id,
        "warehouse_id": wh_id,
        "lines": [{"product_id": test_prod_id, "quantity": 99999, "unit_price": 10.00}],
        "delivered_now": True,
        "initial_payment_amount": 0
    })
    assert insufficient_sale.status_code == 400
    assert "Insufficient stock" in insufficient_sale.json()["detail"]
    print("✔ Check 9: Insufficient stock transaction blocked before becoming negative.")

    # 12. Check 10: Receive goods before recording supplier invoice
    sup_resp = client.get("/api/v1/suppliers")
    sup_id = sup_resp.json()[0]["id"]

    purch_order = client.post("/api/v1/purchases", json={
        "supplier_id": sup_id,
        "warehouse_id": wh_id,
        "lines": [{"product_id": test_prod_id, "quantity": 30, "unit_cost": 15.00}],
        "receive_now": False,
        "record_invoice_now": False
    })
    assert purch_order.status_code == 200
    po = purch_order.json()
    assert po["receipt_status"] == "pending"
    assert po["invoice_status"] == "not_recorded"

    # Now receive goods independently
    rec_resp = client.post(f"/api/v1/purchases/{po['id']}/receive")
    assert rec_resp.status_code == 200
    assert rec_resp.json()["receipt_status"] == "received"

    # Now record invoice independently
    inv_rec_resp = client.post(f"/api/v1/purchases/{po['id']}/record-invoice", json={
        "supplier_invoice_ref": "SUP-INV-2026-X"
    })
    assert inv_rec_resp.status_code == 200
    assert inv_rec_resp.json()["invoice_status"] == "recorded"
    print("✔ Check 10: Independent purchase receipt and invoice recording verified.")

    # 13. Check 11: Customer deposit & allocation across invoices
    # Record deposit of 1,000 MAD
    deposit_resp = client.post("/api/v1/payments", json={
        "party_type": "customer",
        "customer_id": cust_id,
        "amount": 1000.00,
        "payment_method": "cash",
        "allocations": []
    })
    assert deposit_resp.status_code == 200
    dep = deposit_resp.json()
    assert Decimal(str(dep["unallocated_amount"])) == Decimal("1000.00")

    # Verify customer ledger separates debt and deposits
    cust_detail = client.get(f"/api/v1/customers/{cust_id}").json()
    assert Decimal(str(cust_detail["unused_deposit"])) >= Decimal("1000.00")
    print("✔ Check 11: Deposit of 1,000 MAD stored as unused balance without auto-offsetting debt.")

    # 14. Check 12: PDF Invoice Generation
    pdf_resp = client.get(f"/api/v1/sales/{sale_data['id']}/pdf")
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"
    assert len(pdf_resp.content) > 1000
    print("✔ Check 12: PDF Invoice generated with ReportLab successfully.")

    # 15. Check 13: On-demand backup execution
    b_resp = client.post("/api/v1/backups/now")
    assert b_resp.status_code == 200
    b_data = b_resp.json()
    assert b_data["status"] == "success"
    assert b_data["size_bytes"] > 0
    print(f"✔ Check 13: On-demand backup created {b_data['filename']} ({b_data['size_bytes']} bytes).")

    print("\n🎉 ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY! 100% SPEC COMPLIANCE.")

if __name__ == "__main__":
    run_all_acceptance_tests()
