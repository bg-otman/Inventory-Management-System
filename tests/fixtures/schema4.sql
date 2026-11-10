BEGIN TRANSACTION;
CREATE TABLE activity (
	id VARCHAR(36) NOT NULL, 
	action VARCHAR(100) NOT NULL, 
	label VARCHAR(200) NOT NULL, 
	actor VARCHAR(36) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
);
INSERT INTO "activity" VALUES('40d40d22-9b71-4e88-be46-ac82e4df4d66','stock.adjusted','Opening stock: Câble','desktop','2026-11-08 12:35:37.899396');
INSERT INTO "activity" VALUES('3cac58d7-cb7e-47e8-af0c-2961f84af307','product.created','Câble','desktop','2026-11-08 12:35:37.899405');
INSERT INTO "activity" VALUES('1fa3e6a2-c25c-47e2-8ef7-8d766eed9092','sale.confirmed','INV-000001','desktop','2026-11-08 12:35:37.949288');
INSERT INTO "activity" VALUES('ed294f74-bcad-4487-8e97-871a9217e349','sale.delivered','INV-000001','desktop','2026-11-08 12:35:37.951504');
INSERT INTO "activity" VALUES('47de989c-0ee8-4f63-9571-a5233e0e2460','document.saved','INV-000001','desktop','2026-11-08 12:35:37.951513');
CREATE TABLE allocations (
	id VARCHAR(36) NOT NULL, 
	payment_id VARCHAR(36) NOT NULL, 
	document_id VARCHAR(36) NOT NULL, 
	amount BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	CHECK (amount > 0), 
	FOREIGN KEY(payment_id) REFERENCES payments (id), 
	FOREIGN KEY(document_id) REFERENCES documents (id)
);
INSERT INTO "allocations" VALUES('8a670bf3-551c-43fb-a97b-9a21dcfa61d2','102e8790-c544-4010-bfb5-7078a2041a66','dfa94484-1a1c-437c-88b4-fec162e1eaf0',500);
CREATE TABLE categories (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	normalized VARCHAR(120) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (normalized)
);
INSERT INTO "categories" VALUES('077da963-df14-4670-bccd-9a235f75fd4a','Électricité','electricite');
CREATE TABLE document_lines (
	id VARCHAR(36) NOT NULL, 
	document_id VARCHAR(36) NOT NULL, 
	product_id VARCHAR(36) NOT NULL, 
	warehouse_id VARCHAR(36), 
	name VARCHAR(200) NOT NULL, 
	unit VARCHAR(30) NOT NULL, 
	quantity BIGINT NOT NULL, 
	price TEXT, 
	PRIMARY KEY (id), 
	CHECK (quantity > 0), 
	CHECK (price IS NULL OR price >= 0), 
	FOREIGN KEY(document_id) REFERENCES documents (id), 
	FOREIGN KEY(product_id) REFERENCES products (id), 
	FOREIGN KEY(warehouse_id) REFERENCES warehouses (id)
);
INSERT INTO "document_lines" VALUES('73b67dbd-4124-43f5-b062-61171b3c2ec6','dfa94484-1a1c-437c-88b4-fec162e1eaf0','2b09bd26-596c-47d3-a49b-53e117f7c22e','f5186cc8-f4ed-4720-ac3a-b5b6b185cd02','Câble','meter',1125,'12.123456');
CREATE TABLE documents (
	id VARCHAR(36) NOT NULL, 
	kind VARCHAR(20) NOT NULL, 
	party_id VARCHAR(36), 
	warehouse_id VARCHAR(36) NOT NULL, 
	number VARCHAR(60), 
	status VARCHAR(20) NOT NULL, 
	fulfilled BOOLEAN NOT NULL, 
	fulfilled_at DATETIME, 
	subtotal BIGINT NOT NULL, 
	discount BIGINT NOT NULL, 
	tax_rate BIGINT NOT NULL, 
	tax BIGINT NOT NULL, 
	total BIGINT NOT NULL, 
	due_date VARCHAR(10), 
	language VARCHAR(2) NOT NULL, 
	reference VARCHAR(120) NOT NULL, 
	snapshot JSON NOT NULL, 
	created_at DATETIME NOT NULL, 
	issued_at DATETIME, 
	actor VARCHAR(36) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(party_id) REFERENCES parties (id), 
	FOREIGN KEY(warehouse_id) REFERENCES warehouses (id), 
	UNIQUE (number)
);
INSERT INTO "documents" VALUES('dfa94484-1a1c-437c-88b4-fec162e1eaf0','sale','e6ed1829-9cb8-4cd2-96a8-e35ed274e642','f5186cc8-f4ed-4720-ac3a-b5b6b185cd02','INV-000001','confirmed',1,'2026-11-08 12:35:37.951235',1364,0,0,0,1364,NULL,'ar','','{"company": {"company_name": "Inventory", "company_name_ar": "\u0627\u0644\u0645\u062e\u0632\u0648\u0646", "phone": "", "address": "", "logo": ""}, "party": {"id": "e6ed1829-9cb8-4cd2-96a8-e35ed274e642", "kind": "customer", "name": "Client historique", "phone": "", "address": "", "notes": "", "active": true, "created_at": "2026-11-08T12:35:37.874331Z"}, "lines": [{"id": "73b67dbd-4124-43f5-b062-61171b3c2ec6", "document_id": "dfa94484-1a1c-437c-88b4-fec162e1eaf0", "product_id": "2b09bd26-596c-47d3-a49b-53e117f7c22e", "warehouse_id": "f5186cc8-f4ed-4720-ac3a-b5b6b185cd02", "name": "C\u00e2ble", "unit": "meter", "quantity": "1.125", "price": "12.123456", "warehouse_name": "Entrep\u00f4t principal"}], "paid_at_issue": "5", "total": "13.64", "subtotal": "13.64", "discount": "0", "language": "ar", "due_date": null}','2026-11-08 12:35:37.904839','2026-11-08 12:35:37.915555','desktop');
CREATE TABLE movements (
	id VARCHAR(36) NOT NULL, 
	product_id VARCHAR(36) NOT NULL, 
	warehouse_id VARCHAR(36) NOT NULL, 
	quantity BIGINT NOT NULL, 
	reason TEXT NOT NULL, 
	source_id VARCHAR(36), 
	actor VARCHAR(36) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(product_id) REFERENCES products (id), 
	FOREIGN KEY(warehouse_id) REFERENCES warehouses (id)
);
INSERT INTO "movements" VALUES('ddfa2fb7-55b6-47bf-bba3-6f8a955f4dae','2b09bd26-596c-47d3-a49b-53e117f7c22e','f5186cc8-f4ed-4720-ac3a-b5b6b185cd02',20000,'Opening stock',NULL,'desktop','2026-11-08 12:35:37.900195');
INSERT INTO "movements" VALUES('d1a3a2cd-040d-424e-ad97-f274934980c5','2b09bd26-596c-47d3-a49b-53e117f7c22e','f5186cc8-f4ed-4720-ac3a-b5b6b185cd02',-1125,'Sale delivery','dfa94484-1a1c-437c-88b4-fec162e1eaf0','desktop','2026-11-08 12:35:37.952552');
CREATE TABLE operations (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	"key" VARCHAR(100) NOT NULL, 
	request_hash VARCHAR(64) NOT NULL, 
	response JSON NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (user_id, "key")
);
CREATE TABLE parties (
	id VARCHAR(36) NOT NULL, 
	kind VARCHAR(20) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	phone VARCHAR(100) NOT NULL, 
	address TEXT NOT NULL, 
	notes TEXT NOT NULL, 
	active BOOLEAN DEFAULT 'true' NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
);
INSERT INTO "parties" VALUES('e6ed1829-9cb8-4cd2-96a8-e35ed274e642','customer','Client historique','','','',1,'2026-11-08 12:35:37.874331');
CREATE TABLE payment_offsets (
	id VARCHAR(36) NOT NULL, 
	received_id VARCHAR(36) NOT NULL, 
	paid_id VARCHAR(36) NOT NULL, 
	amount BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	CHECK (amount > 0), 
	FOREIGN KEY(received_id) REFERENCES payments (id), 
	FOREIGN KEY(paid_id) REFERENCES payments (id)
);
CREATE TABLE payments (
	id VARCHAR(36) NOT NULL, 
	party_id VARCHAR(36), 
	amount BIGINT NOT NULL, 
	method VARCHAR(30) NOT NULL, 
	direction VARCHAR(10) NOT NULL, 
	notes TEXT NOT NULL, 
	reference VARCHAR(120) NOT NULL, 
	paid_at VARCHAR(10) NOT NULL, 
	reversed BOOLEAN NOT NULL, 
	actor VARCHAR(36) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CHECK (amount > 0), 
	FOREIGN KEY(party_id) REFERENCES parties (id)
);
INSERT INTO "payments" VALUES('102e8790-c544-4010-bfb5-7078a2041a66','e6ed1829-9cb8-4cd2-96a8-e35ed274e642',500,'cash','received','','','2026-11-08',0,'desktop','2026-11-08 12:35:37.927265');
CREATE TABLE products (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	category_id VARCHAR(36) NOT NULL, 
	supplier_id VARCHAR(36), 
	purchase_cost TEXT, 
	description TEXT NOT NULL, 
	sku VARCHAR(100), 
	barcode VARCHAR(100), 
	unit VARCHAR(30) NOT NULL, 
	price TEXT, 
	wholesale_price TEXT, 
	threshold BIGINT NOT NULL, 
	active BOOLEAN NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CHECK (threshold >= 0), 
	CHECK (price IS NULL OR price >= 0), 
	CHECK (wholesale_price IS NULL OR wholesale_price >= 0), 
	CONSTRAINT ck_products_purchase_cost CHECK (purchase_cost IS NULL OR purchase_cost >= 0), 
	FOREIGN KEY(category_id) REFERENCES categories (id), 
	FOREIGN KEY(supplier_id) REFERENCES parties (id), 
	UNIQUE (sku), 
	UNIQUE (barcode)
);
INSERT INTO "products" VALUES('2b09bd26-596c-47d3-a49b-53e117f7c22e','Câble','077da963-df14-4670-bccd-9a235f75fd4a',NULL,'3.123456','','OLD-SKU','012345','meter','12.123456','9.123456',0,1,'2026-11-08 12:35:37.890835');
CREATE TABLE receipts (
	id VARCHAR(36) NOT NULL, 
	number VARCHAR(60) NOT NULL, 
	party_id VARCHAR(36), 
	payment_id VARCHAR(36) NOT NULL, 
	action VARCHAR(20) NOT NULL, 
	snapshot JSON NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (number), 
	FOREIGN KEY(party_id) REFERENCES parties (id), 
	FOREIGN KEY(payment_id) REFERENCES payments (id)
);
INSERT INTO "receipts" VALUES('835d7fe8-8ef7-4bc7-a7e5-f8519e147fe9','RCT-000001','e6ed1829-9cb8-4cd2-96a8-e35ed274e642','102e8790-c544-4010-bfb5-7078a2041a66','payment','{"company": {"company_name": "Inventory", "company_name_ar": "\u0627\u0644\u0645\u062e\u0632\u0648\u0646", "phone": "", "address": "", "logo": ""}, "party": {"id": "e6ed1829-9cb8-4cd2-96a8-e35ed274e642", "kind": "customer", "name": "Client historique", "phone": "", "address": "", "notes": "", "active": true, "created_at": "2026-11-08T12:35:37.874331Z"}, "language": "ar", "direction": "received", "amount": "5", "paid_at": "2026-11-08", "method": "cash", "notes": "", "balance_before": "13.64", "balance_after": "8.64", "available": "0.00", "credit_offset": "0.00", "invoices": [{"document_id": "dfa94484-1a1c-437c-88b4-fec162e1eaf0", "number": "INV-000001", "total": "13.64", "change": "5.00", "paid_before": "0", "paid_after": "5.00", "remaining": "8.64"}]}','2026-11-08 12:35:37.947051');
CREATE TABLE settings (
	id INTEGER NOT NULL, 
	data JSON NOT NULL, 
	next_invoice INTEGER NOT NULL, 
	next_purchase INTEGER NOT NULL, 
	next_receipt INTEGER NOT NULL, 
	PRIMARY KEY (id)
);
INSERT INTO "settings" VALUES(1,'{"company_name": "Inventory", "company_name_ar": "\u0627\u0644\u0645\u062e\u0632\u0648\u0646", "phone": "", "address": "", "logo": ""}',2,1,2);
CREATE TABLE stock (
	product_id VARCHAR(36) NOT NULL, 
	warehouse_id VARCHAR(36) NOT NULL, 
	quantity BIGINT NOT NULL, 
	PRIMARY KEY (product_id, warehouse_id), 
	CHECK (quantity >= 0), 
	FOREIGN KEY(product_id) REFERENCES products (id), 
	FOREIGN KEY(warehouse_id) REFERENCES warehouses (id)
);
INSERT INTO "stock" VALUES('2b09bd26-596c-47d3-a49b-53e117f7c22e','f5186cc8-f4ed-4720-ac3a-b5b6b185cd02',18875);
CREATE TABLE warehouses (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (name)
);
INSERT INTO "warehouses" VALUES('f5186cc8-f4ed-4720-ac3a-b5b6b185cd02','Entrepôt principal');
COMMIT;
PRAGMA user_version=4;
