# Inventory Desktop 1.5.0

Standalone stock, invoices and accounts for **Windows 10/11 x64**, one person on one computer. No account, password, internet access, Docker, or separately installed Python is needed. The interface and all printed documents are now **French only**. Currency: MAD. No tax, SKU or barcode inputs.

## Run or update

1. Close the old app. Extract **Inventory-Windows-x64.zip** into a new folder using **Extract All**.
2. Open **Inventory.exe** and keep all extracted files together.
3. Update your desktop shortcut to the new executable. Use the same Windows user account to retain your workspace.

Data stays in `%APPDATA%\InventoryDesktop\data`, separately from the program. **Do not delete this folder.** The app makes a recovery backup before upgrading older databases to schema 5. Keep using version 1.5.0 after upgrading; older executables cannot open the upgraded database. Historical amounts, payments and invoice numbers are preserved. Older desktop backups remain importable. Previously entered names and notes are not translated or erased.

## What changed

- **French only:** Arabic language controls and Arabic print templates are removed. Older Arabic/English documents display French labels without rewriting the original financial snapshots.
- **No SKU or barcode fields:** no scanner workflow or code inputs. Legacy stored codes remain untouched internally for migration compatibility and are not exposed by the UI/API.
- **Search:** type a product name in Stock or a document line. Search ignores case and accents. Product selection supports keyboard arrows and Enter.
- **Warehouses:** rename, remove, or reactivate a warehouse in Stock > Entrepôts. Removal requires an empty warehouse, no pending purchase/sale operations and another active warehouse. Historical records remain available.
- **Edit documents:** open a saved purchase, sale, quotation or delivery note and choose **Modifier le document**. Correct lines, quantity, prices, customer/supplier where eligible, warehouse, discount, dates and notes. Issued documents keep their number and correction history.
- **Quotations:** create a **Devis** for a named customer or **Client de passage**, with catalogue products, out-of-stock products, or free descriptions absent from the catalogue. Each customer has quotation and delivery-note history. Print with the company logo and the existing A4 table layout.
- **Delivery notes:** create, edit and print **Bons de livraison**, including a linked copy from a sale invoice.

## Documents and stock

| Action | Result |
| --- | --- |
| Create or edit a quotation / delivery note | Printable commercial document; no stock, cash or debt posting |
| Quotation → invoice | Linked sale draft to review, then confirm; map free lines to catalogue products before confirming |
| Invoice → quotation | Linked quotation copy; the original invoice, payments and stock remain intact |
| Invoice → delivery note | Linked delivery note; no second deduction of stock |
| Delivery note → invoice | Linked sale draft; if the note was made from an invoice, opens that original invoice |
| Repeat a conversion | Opens the existing active linked copy instead of creating duplicates |
| Confirm a sale/purchase | Records its amount in the named account; walk-in sales must be fully paid |
| Deliver a sale / receive a purchase | Moves stock once; delivery can be recorded later |
| Correct an already delivered/received invoice | Applies only the difference in quantities at the affected warehouses |

Conversion is a copy, not cancellation. To void a mistaken invoice use **Annuler le document**, after reversing its allocated payments. Editing a linked copy does not silently change the original. A standalone delivery note is documentary; record stock delivery on its corresponding sale.

Invoice corrections are atomic. They cannot cause negative stock or reduce the invoice below its allocated payments. Actual refunds are recorded as a payment in the opposite direction. Changing the account on an invoice with active allocations requires reversing those payments first. A paid walk-in invoice must retain its paid total; reverse and recreate it if the paid amount was entered incorrectly. Receipt history remains unchanged and visible.

## Existing daily workflows

Product name and category are required; create missing categories and suppliers inline. Adding a product normally creates its linked purchase, supplier debt and optional payment; mark **Stock déjà existant** for opening quantities without a purchase or debt. Editing the product itself does not add stock again. A product created inside a purchase has its quantity recorded by that purchase.

Each product has one unit; there is no conversion between cartons, pieces, weight or length. Purchase cost, retail and wholesale unit prices accept up to **six decimal places**. Calculations retain full unit-price precision, round each line half-up to two decimals, then sum lines and subtract the discount. Totals, payments and balances use MAD cents. Quantities support three decimals, except piece/unit/carton products require whole quantities.

Stock displays quantities and locations. Sales may use different warehouses on different lines. Customers and suppliers show both amounts owed to you and amounts you owe. Record cash in either direction; automatic allocation settles invoices oldest first and retains excess as an advance. Each payment, allocation or reversal has a numbered printable receipt. Product/account removal preserves history and supports restoration.

## Backup and recovery

An automatic backup is made on first use and every seven days while the app is open, catching up on next launch if needed. The four latest regular backups are kept; recovery copies are retained separately. Settings offers manual backup, export, import and restoration. Restoration requests confirmation and first saves a recovery copy of current data. Export a copy to another drive periodically.

If startup fails, use **Ouvrir le journal** and share `%APPDATA%\InventoryDesktop\startup.log`. The log identifies the running version. Do not delete business data to fix display errors. Closing the main window also closes print windows and stops the local service. Startup/request deadlines, software rendering and crash recovery from 1.4.1 are retained.

The application is unsigned. It does not require administrator privileges. Different Windows profiles/computers have separate data; do not put the live database in a shared/syncing directory.

## Source and rebuild

- `frontend/`: Next.js static export, React and TypeScript.
- `backend/`: FastAPI, SQLAlchemy, SQLite, transactional stock/account logic and backups.
- `desktop/`: Electron launcher, native backup dialogs, print windows and lifecycle recovery.
- `scripts/`: pinned embedded Windows Python preparation and ZIP cleanup.
- `tests/`: business workflows, upgrades, exact prices, printing and desktop lifecycle checks.

Electron starts a local-only service on a random `127.0.0.1` port with a per-launch internal token. There are no user credentials. The renderer is sandboxed with Node integration disabled. All assets are bundled.

Developer rebuild, using Node.js 22+ and Python 3:

For browser development, install the project dependencies, then run `make dev`. On first run it creates a managed Python environment under your home directory and installs the pinned backend requirements; it refreshes them only when the lock file changes. Open `http://127.0.0.1:3000`; test data is stored separately under `%USERPROFILE%\.inventory-desktop-dev` on Windows or `~/.inventory-desktop-dev` on Linux/WSL. Set `INVENTORY_DEV_PYTHON` to bypass the managed environment and use a specific Python executable.

```bash
npm ci --ignore-scripts
npm --prefix frontend ci
python3 scripts/prepare_windows.py
npm run build:frontend
npm run package:windows
```

Run `make prod` for the commands above. Output: `dist/Inventory-Windows-x64.zip`. Normal users only extract and run the ZIP.

## Formatting source code

Install the JavaScript formatter with `npm ci` and the Python formatter with:

```bash
python -m pip install -r requirements-format.txt
```

Run `npm run format` to format frontend, desktop, test and backend source files. Run
`npm run format:check` to check formatting without changing files.

Developer tests:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r backend/requirements-desktop.lock.txt pytest httpx
python -m pytest tests -q
npm run test:desktop
```

For unpackaged development, install the host Electron runtime with `node node_modules/electron/install.js`, set `INVENTORY_DEV_PYTHON` to the Python executable, build the frontend and run `npm start`.

`npm run test:features`, `test:runtime` and `test:readiness` use real Electron with isolated test profiles, the built frontend and the real backend. They require a display, Playwright, `INVENTORY_TEST_PROFILE` (a new empty directory) and `INVENTORY_DEV_PYTHON`. `INVENTORY_PLAYWRIGHT_MODULE` may select an installed Playwright module. Linux CI-only sandbox/lock exceptions are never enabled by the shipped Windows launcher.

## Verification scope

Business tests cover document corrections, stock shortages and atomic rollback, conversions without duplicate postings, free quotation lines, warehouse archival, payments/deposits, old backups and an actual v1.4.1 database fixture. Desktop tests exercise printing, navigation, closing/reopening, stalled requests and renderer recovery. These run on Linux; native Windows GUI and printer behavior must still be checked on a Windows computer.
