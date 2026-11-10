import os, json, hashlib, hmac, re
from pathlib import Path
from fastapi import FastAPI, Depends, Request, Response, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from .db import get_db
from .models import *
from .schemas import *
from types import SimpleNamespace
from .local_security import verify_request
from . import services as svc

app = FastAPI(
    title="Inventory Desktop", version="1.5.0", docs_url=None, redoc_url=None, openapi_url=None
)


@app.middleware("http")
async def desktop_access(request, call_next):
    from fastapi.responses import JSONResponse

    try:
        verify_request(request)
    except HTTPException as error:
        return JSONResponse({"detail": error.detail}, status_code=error.status_code)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


def auth():
    return SimpleNamespace(id="desktop")


def mutation(request, db, user, fn):
    key = request.headers.get("Idempotency-Key", "")
    if not 8 <= len(key) <= 100:
        raise HTTPException(
            422, "Un identifiant d’opération est requis. Relancez l’application et réessayez."
        )
    # The singleton lock serializes business writes for this small-business MVP.
    # Every mutating domain endpoint follows this path.
    db.scalar(select(Setting).where(Setting.id == 1).with_for_update())
    raw = request.state.payload
    fingerprint = hashlib.sha256(
        (request.method + request.url.path + json.dumps(raw, sort_keys=True, default=str)).encode()
    ).hexdigest()
    previous = db.scalar(
        select(Operation).where(Operation.user_id == user.id, Operation.key == key)
    )
    if previous:
        if not hmac.compare_digest(previous.request_hash, fingerprint):
            raise HTTPException(
                409,
                "Cette opération a déjà été utilisée avec des données différentes. Relancez le formulaire.",
            )
        return previous.response
    try:
        result = fn()
        db.flush()
        db.add(Operation(user_id=user.id, key=key, request_hash=fingerprint, response=result))
        db.commit()
        return result
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ce nom ou numéro de document existe déjà.")


def run(request, db, user, body, fn):
    request.state.payload = body.model_dump(mode="json") if hasattr(body, "model_dump") else body
    return mutation(request, db, user, fn)


@app.get("/api/v1/health")
def health():
    return {"status": "ok"}


@app.get("/api/v1/state")
def get_state(db=Depends(get_db), user=Depends(auth)):
    return svc.state(db, user)


@app.post("/api/v1/categories")
def category(data: NameInput, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        key = " ".join(data.name.split()).casefold()
        c = db.scalar(select(Category).where(Category.normalized == key))
        if not c:
            c = Category(name=" ".join(data.name.split()), normalized=key)
            db.add(c)
            db.flush()
            svc.activity(db, user, "category.created", c.name)
        return {"id": c.id}

    return run(request, db, user, data, action)


@app.post("/api/v1/warehouses")
def warehouse(data: NameInput, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        w = Warehouse(name=data.name)
        db.add(w)
        db.flush()
        return {"id": w.id}

    return run(request, db, user, data, action)


@app.post("/api/v1/products")
def product(data: ProductCreateInput, request: Request, db=Depends(get_db), user=Depends(auth)):
    return run(request, db, user, data, lambda: svc.product_save(db, user, data))


@app.patch("/api/v1/products/{id}")
def edit_product(
    id: str, data: ProductInput, request: Request, db=Depends(get_db), user=Depends(auth)
):
    return run(request, db, user, data, lambda: svc.product_save(db, user, data, id))


@app.delete("/api/v1/products/{id}")
def product_remove(id: str, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        product = svc.require(db, Product, id)
        if product.active:
            product.active = False
            svc.activity(db, user, "product.removed", product.name)
        return {"id": product.id}

    return run(request, db, user, {}, action)


@app.post("/api/v1/products/{id}/restore")
def product_restore(id: str, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        product = svc.require(db, Product, id)
        if not product.active:
            product.active = True
            svc.activity(db, user, "product.restored", product.name)
        return {"id": product.id}

    return run(request, db, user, {}, action)


@app.post("/api/v1/parties")
def party(data: PartyInput, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        p = Party(**data.model_dump())
        db.add(p)
        db.flush()
        svc.activity(db, user, "party.created", p.name)
        return {"id": p.id}

    return run(request, db, user, data, action)


@app.patch("/api/v1/parties/{id}")
def party_edit(id: str, data: PartyInput, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        p = svc.require(db, Party, id)
        if p.kind != data.kind:
            raise HTTPException(422, "Le type de compte ne peut pas être modifié.")
        for k, v in data.model_dump().items():
            setattr(p, k, v)
        return {"id": p.id}

    return run(request, db, user, data, action)


@app.delete("/api/v1/parties/{id}")
def party_remove(id: str, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        p = svc.require(db, Party, id)
        if p.active:
            p.active = False
            svc.activity(db, user, "party.removed", p.name)
        return {"id": p.id}

    return run(request, db, user, {}, action)


@app.post("/api/v1/parties/{id}/restore")
def party_restore(id: str, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        p = svc.require(db, Party, id)
        if not p.active:
            p.active = True
            svc.activity(db, user, "party.restored", p.name)
        return {"id": p.id}

    return run(request, db, user, {}, action)


@app.post("/api/v1/stock/adjust")
def adjust(data: AdjustInput, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        svc.move(db, user, data.product_id, data.warehouse_id, data.quantity, data.reason)
        svc.activity(db, user, "stock.adjusted", data.reason)
        return {"ok": True}

    return run(request, db, user, data, action)


@app.post("/api/v1/stock/transfer")
def transfer(data: TransferInput, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        if data.from_warehouse_id == data.to_warehouse_id:
            raise HTTPException(422, "Choisissez un autre entrepôt de destination.")
        svc.move(
            db, user, data.product_id, data.from_warehouse_id, -data.quantity, "Warehouse transfer"
        )
        svc.move(
            db, user, data.product_id, data.to_warehouse_id, data.quantity, "Warehouse transfer"
        )
        return {"ok": True}

    return run(request, db, user, data, action)


@app.post("/api/v1/documents")
def document(data: DocumentInput, request: Request, db=Depends(get_db), user=Depends(auth)):
    return run(request, db, user, data, lambda: svc.save_document(db, user, data))


@app.patch("/api/v1/documents/{id}")
def document_edit(
    id: str, data: DocumentInput, request: Request, db=Depends(get_db), user=Depends(auth)
):
    return run(request, db, user, data, lambda: svc.save_document(db, user, data, id))


@app.post("/api/v1/documents/{id}/confirm")
def confirm(id: str, data: PostInput, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        d = svc.require(db, Document, id)
        svc.confirm(db, user, d, data.payment)
        if data.fulfill:
            svc.fulfill(db, user, d)
        return {"id": d.id}

    return run(request, db, user, data, action)


@app.patch("/api/v1/documents/{id}/prices")
def sale_prices(
    id: str, data: SalePricesInput, request: Request, db=Depends(get_db), user=Depends(auth)
):
    return run(
        request,
        db,
        user,
        data,
        lambda: svc.update_sale_prices(db, user, svc.require(db, Document, id), data),
    )


@app.post("/api/v1/documents/{id}/fulfill")
def fulfill(id: str, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        d = svc.require(db, Document, id)
        svc.fulfill(db, user, d)
        return {"id": d.id}

    return run(request, db, user, {}, action)


@app.post("/api/v1/documents/{id}/reverse")
def reverse_doc(
    id: str, data: ReasonInput, request: Request, db=Depends(get_db), user=Depends(auth)
):
    def action():
        svc.reverse_document(db, user, svc.require(db, Document, id), data.reason)
        return {"ok": True}

    return run(request, db, user, data, action)


@app.post("/api/v1/payments")
def payment(data: PaymentInput, request: Request, db=Depends(get_db), user=Depends(auth)):
    return run(request, db, user, data, lambda: svc.record_payment(db, user, data))


@app.post("/api/v1/payments/{id}/allocate")
def payment_allocate(
    id: str, data: AllocateInput, request: Request, db=Depends(get_db), user=Depends(auth)
):
    return run(
        request,
        db,
        user,
        data,
        lambda: svc.allocate_payment(db, user, svc.require(db, Payment, id), data),
    )


@app.post("/api/v1/payments/{id}/reverse")
def payment_reverse(
    id: str, data: ReasonInput, request: Request, db=Depends(get_db), user=Depends(auth)
):
    return run(
        request,
        db,
        user,
        data,
        lambda: svc.reverse_payment(db, user, svc.require(db, Payment, id), data),
    )


@app.patch("/api/v1/settings")
def settings(data: SettingsInput, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        if data.logo and not re.fullmatch(
            r"data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+", data.logo
        ):
            raise HTTPException(422, "Importez un logo au format PNG, JPEG ou WebP.")
        s = db.get(Setting, 1)
        s.data = data.model_dump(mode="json")
        return {"ok": True}

    return run(request, db, user, data, action)


@app.get("/api/v1/invoices/{id}/print", response_class=HTMLResponse)
def invoice(id: str, db=Depends(get_db), user=Depends(auth)):
    from .invoice import render

    d = svc.require(db, Document, id)
    if not d.snapshot:
        raise HTTPException(409, "Confirmez d’abord la facture.")
    return render(d, company_logo=db.get(Setting, 1).data.get("logo", ""))


@app.get("/api/v1/receipts/{id}/print", response_class=HTMLResponse)
def receipt(id: str, db=Depends(get_db), user=Depends(auth)):
    from .receipt import render

    receipt = svc.require(db, Receipt, id)
    payment = svc.require(db, Payment, receipt.payment_id)
    return render(
        receipt, company_logo=db.get(Setting, 1).data.get("logo", ""), reversed=payment.reversed
    )


@app.get("/api/v1/backups")
def backups():
    from .local_backups import list_backups

    return list_backups()


@app.post("/api/v1/backups")
def backup_now():
    from .local_backups import backup

    return backup()


@app.post("/api/v1/backups/restore")
def restore(data: RestoreInput):
    from .local_backups import restore

    if not data.confirmed:
        raise HTTPException(422, "Confirmez d’abord la restauration.")
    return restore(data.backup)


@app.get("/api/v1/backups/{name}/export")
def backup_export(name: str):
    from fastapi.responses import FileResponse
    from .local_backups import resolve_backup

    return FileResponse(resolve_backup(name), media_type="application/octet-stream", filename=name)


@app.post("/api/v1/backups/import")
async def backup_import(request: Request):
    from .local_backups import import_backup

    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > 200 * 1024 * 1024:
            raise HTTPException(413, "La sauvegarde dépasse 200 Mo.")
    from starlette.concurrency import run_in_threadpool

    return await run_in_threadpool(import_backup, bytes(content))


@app.get("/api/v1/preferences")
def preferences():
    from .preferences import read

    return read()


@app.patch("/api/v1/preferences")
def set_preferences(data: dict):
    from .preferences import write_language

    if set(data) != {"language"} or data["language"] not in ("fr",):
        raise HTTPException(422, "Le français est la seule langue disponible.")
    write_language(data["language"])
    return {"ok": True}


@app.patch("/api/v1/warehouses/{id}")
def warehouse_edit(
    id: str, data: NameInput, request: Request, db=Depends(get_db), user=Depends(auth)
):
    def action():
        w = svc.require(db, Warehouse, id)
        w.name = data.name
        svc.activity(db, user, "warehouse.updated", w.name)
        return {"id": id}

    return run(request, db, user, data, action)


@app.delete("/api/v1/warehouses/{id}")
def warehouse_remove(id: str, request: Request, db=Depends(get_db), user=Depends(auth)):
    from .documents import remove_warehouse

    return run(request, db, user, {}, lambda: remove_warehouse(db, user, id))


@app.post("/api/v1/warehouses/{id}/restore")
def warehouse_restore(id: str, request: Request, db=Depends(get_db), user=Depends(auth)):
    def action():
        svc.require(db, Warehouse, id).active = True
        return {"id": id}

    return run(request, db, user, {}, action)


@app.post("/api/v1/documents/{id}/convert")
def document_convert(
    id: str, data: ConvertInput, request: Request, db=Depends(get_db), user=Depends(auth)
):
    from .documents import convert

    return run(request, db, user, data, lambda: convert(db, user, id, data.kind))


# Keep the catch-all static mount after every API endpoint.
static_root = Path(
    os.environ.get("INVENTORY_FRONTEND", Path(__file__).resolve().parents[2] / "frontend" / "out")
)
if static_root.is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=static_root, html=True), name="desktop-interface")
