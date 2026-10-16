# Inventory — المخزون

**Stock, invoices, and balances in one place.**  
**المخزون والفواتير والحسابات في مكان واحد.**

Requirements and implementation plan — revised 15 October 2026.

Status: updated with the client's latest decisions. The application source and a private sample preview are implemented; see the root README for validation and production deployment status.

The application name is Inventory, displayed as المخزون in Arabic.

## 1. Product direction

Build a simple online dashboard for warehouse stock, sales, purchases, invoices, customer/supplier balances, and payments.

Use Next.js, FastAPI, and PostgreSQL. Keep one backend and one database, with clear everyday screens.

The latest decisions replace the previous offline, conversion, import, and advanced delivery proposals. Practical defaults below fill implementation details without reopening settled requirements.

## 2. Confirmed scope

| Area | Decision |
|---|---|
| Product creation | Product name, category and supplier are required |
| Categories | Select an existing category or create one while adding the product |
| Suppliers on products | Select an existing supplier with contact details, or create one inline |
| Sales price references | Show latest confirmed purchase cost and default selling price for each selected product |
| Taxes | No fields, settings, calculations or printed tax rows |
| SKU and barcode | Optional; neither is generated or required as a condition of saving |
| Units | One unit per product; no unit conversion; additional details go in description |
| Locations | Warehouses |
| Connectivity | Online only |
| Sales and purchases | Simple workflows, with one complete delivery/receipt per transaction |
| Deposits | Named customers and suppliers can have payments recorded before invoicing |
| Payments | One payment may settle several invoices for the same party |
| Credit | One due date; named customer required |
| Walk-in sales | Fully paid; no anonymous debt or deposits |
| Languages | English or Arabic, one language displayed at a time |
| Currency | MAD |
| Single operator | Can manage products, pricing, stock, sales, purchases, parties, payments, and corrections |
| Invoices | Company/contact details, numbered product lines, discount, total and payment information; no tax fields |
| Starting data | Create and manage records in the application; no file-import feature |
| Alerts | In-app low-stock alerts |
| Backups | Automated weekly backups and an easy restoration workflow |
| Hardware | Scanner/printer models unknown; ordinary search and PDF printing remain available |

## 3. Simple navigation and interface

| Page | Main purpose |
|---|---|
| Dashboard | Sales today, customers owe us, we owe suppliers, low stock |
| Stock | Products, categories, stock by warehouse, movement history |
| Sales | Sale entry, invoice, delivery status, payments |
| Purchases | Purchase entry, receipt status, supplier invoice, payments |
| Customers | Search by name, purchase/payment history, balances and deposits |
| Suppliers | Purchases, payment history, balances and advances |
| Settings | Company details, warehouses, invoice defaults, backups |

Put related actions together. Invoices, deliveries, and payments belong inside the sale/purchase detail page; they do not each need another main menu section.

Use readable tables, simple search, clear status labels, and one primary action per screen. Put optional fields behind “More details.” Display outstanding invoices and unused deposits separately. Use a low-stock list and recent activity before adding charts.

### English and Arabic

- Save the user's language preference.
- Display the whole interface in that language: labels, navigation, errors, and statuses.
- Use left-to-right layout for English and right-to-left layout for Arabic.
- Generate each invoice in one selected language, initially the user's preference; store the issued invoice's language.
- A later interface-language change must not rewrite an already issued invoice.
- Preserve user-entered names and descriptions; do not automatically translate them.
- Keep invoice numbers, SKUs, barcodes, and phone numbers readable inside Arabic layouts.
- Test Arabic PDF shaping, font embedding, alignment, and page breaks.

## 4. Product creation and categories

### Add product

The initial form contains:

| Field | Required? | Behavior |
|---|---|---|
| Product name | Yes | Trim spaces and reject an empty name |
| Category | Yes | Search/select a category, or create one inline |
| Supplier | Yes | Select an existing supplier or create one with name, phone, address and notes; only its name is required |
| Starting purchase cost | No | Fallback cost until a confirmed purchase provides a newer cost |
| Description | No | Free text for packaging, dimensions, or other details |
| SKU | No | Blank allowed |
| Barcode | No | Blank allowed; scanning only applies when supplied |
| Unit | No extra input required | Default “unit”; may be changed to kg, meter, carton, etc. |
| Default selling price | No | Leave unset until known; enter an actual price at sale time |
| Low-stock threshold | No | Default 0 for out-of-stock alerts; configure a positive threshold when useful |

Name, category and supplier are required to save a product. Keep the selected supplier's phone, address and notes visible. Inline supplier creation preserves the product form and selects the saved supplier automatically. Warehouse, quantity and starting purchase cost are optional at this stage; SKU and barcode remain optional.

Every product receives an internal database ID automatically. This is separate from the optional SKU and is not another field the user must fill.

### Create category without leaving the form

1. Search the category selector.
2. If the needed category is missing, choose “Create category.”
3. Enter the category name.
4. Save it and automatically select it on the product.
5. Preserve all other product-form input.

Categories have a single level. Prevent duplicate category names after trimming/case normalization. If another user just created the same category, use the existing category instead of creating a duplicate.

### Optional identifiers

- Store missing SKU/barcode as NULL, including whitespace-only input.
- Enforce uniqueness only for provided identifiers; many products can have neither.
- Preserve barcode leading zeros by storing barcodes as text.
- Reject duplicate provided codes with a helpful error.
- Allow name/category search for every product, with or without codes.
- Product names need not be unique; use the internal ID for relationships.
- Do not automatically make up a SKU or barcode.
- A scan selects a matching product; an unknown scan shows “Product not found.”

### Prices and quantities

- Start a new product with zero stock.
- Add quantities through a purchase receipt or an authorized stock adjustment.
- Keep actual costs and selling prices on transaction lines.
- During sale entry, display the latest confirmed purchase cost per unit and the default selling price alongside the editable sale price. Exclude draft/reversed purchases; fall back to the optional starting cost. Show “Not recorded” if no cost exists. Never put internal cost references on customer invoices.
- An unset default selling price must not silently become a free sale: require an explicit line price when posting.
- Maintain one unit per product. Purchase and sale quantities use that same unit.
- Use whole quantities for indivisible units and decimal quantities for kg/meters.
- Packaging details in the description never trigger calculations or conversions.
- Do not reinterpret historical quantities by changing a product's unit after stock activity; correct mistakes through a controlled owner process.

## 5. Stock management

Track on-hand quantity and low-stock threshold per product and warehouse. Maintain a movement history with date, source transaction, responsible user, and adjustment reason where relevant.

Stock changes only on:

- Complete receipt of a purchase.
- Complete delivery of a sale.
- A warehouse transfer.
- An authorized stock adjustment or correction.

A warehouse transfer decreases one location and increases another in the same operation. It creates no sales invoice.

Block movements that would make stock negative. Recheck available quantity when delivery is recorded, including for previously invoiced sales.

There are no stock reservations. Pending sales do not reduce on-hand stock or guarantee stock availability.

Show a low-stock alert when on-hand quantity is at or below its threshold. Keep one active alert per product/warehouse and clear it after replenishment above the threshold.

## 6. Simple sales and invoices

### Default workflow

1. Choose a named customer or “Walk-in customer.”
2. Add products, quantities, warehouse, and selling prices.
3. Review discount, total, and payment.
4. Confirm the sale to issue one invoice.
5. If “Delivered now” is selected, deliver the whole sale and reduce stock.
6. Otherwise, show “Pending delivery” with one later “Mark delivered” action.

**Implementation default:** “Delivered now” is selected initially. A delayed sale has one pending/delivered flag; there are no delivery routes, reservations, split shipments, or partial delivery quantities.

Drafts create no invoice, stock movement, or debt. Confirmed invoices establish debt; delivery changes stock. Combining both actions must commit atomically.

Later delivery, payment, PDF download, or request retries must not issue a second invoice.

### Walk-in customers

Anonymous walk-in sales must be paid in full. To leave an unpaid balance or record any deposit, first select or create a named customer.

Customer name is required for a customer record; phone/address can remain optional. Names are searchable, not unique IDs. Show customer reference or phone when distinguishing similar names.

### Invoice content

Include company name/logo and contact details, unique invoice number, issue date, customer name or walk-in label, product names, units, quantities, unit prices, line totals, subtotal, discount, total in MAD, and payment/due information.

Keep invoice details as historical snapshots. Editing products, customers, prices, or company settings later must not rewrite issued invoices. Preserve original amount-paid information at issuance; later payments appear in receipts and the current account statement.

### Simple calculation defaults

Use an optional fixed discount in MAD. There are no tax fields, settings or tax calculations.

- Subtotal = sum of quantity × unit price, rounded per line to 2 decimal places.
- Discount must be between zero and subtotal.
- Total = subtotal − discount.
- Invoice remaining balance = total − valid allocated payments.

Use Decimal with ROUND_HALF_UP consistently for money. Preserve previously issued invoice totals and historical snapshots during upgrades; do not recalculate historical debt when removing fields.

Use sequential invoice numbers with a proposed format such as INV-000001. Assign numbers atomically, never reuse an issued number, and preserve numbers during corrections.

## 7. Simple purchases and receiving

Use one purchase screen with products, quantities, warehouse, supplier, prices, and payments.

Each purchase supports:

- One complete goods receipt.
- One supplier invoice with optional reference/date.
- Receipt status: pending or received.
- Invoice status: not recorded or recorded.
- Payment status: unpaid, partially paid, or paid.

This preserves the ability to receive goods before the supplier invoice, or record the invoice before goods arrive, using two simple actions on the same record.

| Action | Effect |
|---|---|
| Save draft | No stock or payable change |
| Receive all goods | Increase stock exactly once |
| Record supplier invoice | Establish the amount owed exactly once |
| Pay supplier | Record payment, allocation, or unused advance |

Offer a single reviewed action when both receipt and invoice are available together. Do not build split receipts or match multiple receipts to multiple invoices.

Record received quantities/date even if the final price is not yet known. A provisional price may remain unset or be marked estimated until the invoice is recorded. Finalizing the cost does not change stock again. If received and invoiced quantities disagree, resolve the mismatch before finalizing the invoice.

Prevent changes to posted quantities or an issued invoice through normal editing. An owner correction must keep a trace of the original record.

## 8. Payments, deposits, and balances

Record customer payments and supplier payments with party, amount, date, method, reference, and responsible user.

A payment may be:

- Applied to one invoice.
- Split across several invoices for the same party.
- Kept entirely or partly as an unused deposit/advance.

The payment form shows unpaid invoices and lets the user choose allocation amounts. A named party is always required for a deposit/advance.

Example: a 1,000 MAD customer deposit pays invoices of 600 MAD and 300 MAD, leaving 100 MAD available.

Rules:

- Allocations cannot exceed the available payment or invoice balance.
- Applying a deposit is not another cash receipt.
- Payments never change stock.
- Keep outstanding invoice debt and unused deposits visible separately.
- Never offset customer and supplier accounts automatically.
- One due date per unpaid invoice; overdue means a positive balance past that date.
- Keep payment history; correcting a posted payment uses a linked reversal.

Customer and supplier pages show their transactions, payment history, amounts remaining, and unused deposits/advances.

There are no existing files to import. Start with empty records and enter data through the application. If real starting stock or old balances need recording manually, provide an opening entry with an as-of date and reason. Opening entries must not inflate current sales or cash receipts; payments can settle recorded opening debt.

## 9. Online architecture and permissions

| Layer | Choice |
|---|---|
| Interface | Next.js, TypeScript, Tailwind CSS |
| API and business rules | FastAPI and Pydantic |
| Database | PostgreSQL, SQLAlchemy, Alembic |
| Hosting | One online deployment, Docker Compose, Nginx, HTTPS |
| Access | One private deployment with no application accounts or sign-in |
| Invoice output | One template rendered in the selected language |
| Scheduling | One server-side weekly backup job |

Route pages to Next.js and /api/v1 to FastAPI under one public origin. Keep PostgreSQL private. Next.js must not write directly to the database.

When connectivity is lost, show a connection message and prevent posting. Do not queue offline sales or payments. If a request times out with an uncertain outcome, retry using the same operation identifier so it cannot create duplicate stock or payments.

There are no owner or employee roles. All operations are available to the single workspace. Keep a fixed local actor label in the audit history.

Use database transactions, concurrency checks, duplicate-request protection, and decimal calculations. These are backend safeguards, not extra dashboard workflows.

### Minimal data model

| Area | Main records |
|---|---|
| Catalog | Categories; products with nullable SKU/barcode, description, unit, optional default price |
| Inventory | Warehouses, stock balances, stock movements |
| Parties | Customers, suppliers |
| Sales | Sale and lines; invoice snapshot/number; one delivery status/date |
| Purchases | Purchase and lines; one receipt status/date; one supplier invoice status/reference |
| Payments | Customer/supplier payments and invoice/opening-debt allocations |
| Administration | Company settings, activity history, backup records |

Keep a module per business area inside one backend. No microservices or custom permission builder.

## 10. Weekly backups and easy restoration

### Scheduled backup

**Confirmed frequency:** weekly, running on the server even when no user has the app open.

**Proposed operational defaults:** Sunday at 02:00 UTC; retain the last four successful weekly backups. Show the schedule and timezone in Settings. The hosting operator can adjust these defaults at deployment.

Back up:

- The full application database, including stock, invoices, payments, settings, and history.
- Company logo and any stored invoice documents or other persistent uploaded assets.
- Backup timestamp, application/schema version, and required restore metadata.

Use PostgreSQL custom-format dumps with pg_dump and restore them with pg_restore for this initial small deployment. Preserve or recreate required database roles/permissions through the deployment configuration. Database dumps alone do not include external files or all cluster-wide configuration.

Keep referenced assets immutable/versioned and coordinate the database snapshot with its asset set so every referenced file is included.

Store backups in private storage separate from the application server. Protect credentials separately. Mark a backup successful only after the database and required assets have been transferred and checked. A failed backup must not replace the last successful one or trigger retention deletion.

A lightweight server scheduler is sufficient; no browser timer, Redis, or task-queue service is needed.

### Owner screen: Settings → Backups

Show:

- Last successful backup and next scheduled run.
- Recent backups with date, size, and status.
- An in-app failure notice when a scheduled backup fails or is overdue.
- “Back up now” and “Restore” actions.

### Restore workflow

1. The operator selects a backup and reviews its timestamp.
2. Explain that restoring replaces current data with that snapshot; subsequent changes are not included.
3. Require explicit confirmation.
4. Pause writes and create a recovery backup of the current state.
5. Restore the selected database/assets into an isolated target and validate them.
6. Switch the application to the restored state only after successful validation.
7. Resume service and record the restoration outcome.

If validation fails, keep the current dataset and report failure. A backup/restore tool must remain usable by the hosting operator even when the web app is unavailable.

Test restoration before launch. Weekly backups restore to the selected snapshot; they are not continuous recovery of every transaction.

**Deployment task:** assign a hosting operator responsible for failed jobs, storage access, and recovery. This operational choice does not block product/UI work.

## 11. Outside this release

- Offline mode, PWA synchronization, and disconnected-device writes.
- Unit conversion.
- Partial deliveries/receipts, reservations, and complex invoice matching.
- CSV/Excel import workflows.
- Multi-company support and multi-currency calculations.
- Installment schedules.
- Batch, expiry, and serial tracking.
- Forecasting, loyalty programs, external reminders, and advanced reports.
- A full accounting or returns module.

Retain a small owner correction workflow for mistakes and rare returns. Stock adjustments alone do not correct invoice balances. Linked stock, invoice, and payment corrections must stay consistent and auditable.

## 12. Build sequence

1. Set up Next.js, FastAPI, PostgreSQL, migrations, authentication, and English/Arabic layouts.
2. Build categories and the minimal product form, including inline category creation.
3. Add warehouses, stock movements, low-stock alerts, and optional barcode lookup.
4. Implement simple purchases, goods receipt, supplier invoices, advances, and payments.
5. Implement simple sales, invoices, delivery, named-customer credit, and deposits.
6. Add account histories, basic dashboard totals, and owner corrections.
7. Implement weekly backup/restore, test the agreed workflows, and run a client pilot.

Printer/scanner models and hosting details can be established during deployment and pilot testing. They are not reasons to add mandatory product fields or delay ordinary search and PDF generation.

## 13. Acceptance checks

| Scenario | Expected result |
|---|---|
| Save product with name and category only | Success; SKU/barcode/prices optional, stock starts at zero |
| Required category does not exist | Create it inside the form and select it without losing input |
| Save several products with blank codes | All succeed; blank identifiers are NULL |
| Supply an already-used SKU/barcode | Clear duplicate error |
| Search product with no code | Find it by name/category |
| Scan a known barcode with leading zeros | Select the correct product |
| Record quantities | Use that product's one unit; no conversion |
| Confirm immediate sale | One invoice, one delivery movement, correct balance |
| Deliver an already-invoiced sale later | Stock decreases once; no second invoice |
| Receive goods before recording supplier invoice | Stock increases once; later invoice records payable only |
| Record deposit and allocate across invoices | Balances update, remainder stays available, no stock change |
| Try anonymous credit or deposit | Require creating/selecting a named customer |
| Switch interface language | One language at a time; Arabic layout uses RTL |
| Change product/customer/company details | Issued invoice snapshots remain unchanged |
| Retry a timed-out posting request | Original result returned without duplicates |
| Two users compete for final stock/payment balance | Prevent negative stock or over-allocation |
| Weekly backup runs with no open browser | Complete backup appears in owner settings |
| Backup fails | Previous successful backup retained; failure visible |
| Restore valid backup | Stock, invoices, balances, and assets match its snapshot |
| Restore fails validation | Current data remains usable |

## 14. Technical references

These support implementation details; business defaults above are project decisions.

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [PostgreSQL exact numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html)
- [PostgreSQL constraints and nullable unique identifiers](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)
- [PostgreSQL pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html)
