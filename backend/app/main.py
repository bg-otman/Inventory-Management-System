import os, json, hashlib, hmac, re
from pathlib import Path
from fastapi import FastAPI, Depends, Request, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from .db import get_db
from .models import *
from .schemas import *
from . import services as svc

app=FastAPI(title="Inventory API", version="0.2.0")
ACTOR="local"
CONTROL=Path(os.environ.get("CONTROL_DIR","/tmp/inventory-control"))

@app.middleware("http")
async def maintenance(request,call_next):
    if (CONTROL/"maintenance").exists() and request.url.path!="/api/v1/health":
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail":"Maintenance in progress. Please try again shortly."},status_code=503)
    response=await call_next(request)
    response.headers["Cache-Control"]="no-store"
    response.headers["X-Content-Type-Options"]="nosniff"
    return response

def auth(): return ACTOR

def mutation(request,db,user,fn):
    key=request.headers.get("Idempotency-Key","")
    if not 8<=len(key)<=100: raise HTTPException(422,"An operation identifier is required.")
    # The singleton lock serializes business writes for this small-business MVP.
    # Every mutating domain endpoint follows this path.
    db.scalar(select(Setting).where(Setting.id==1).with_for_update())
    raw=request.state.payload
    fingerprint=hashlib.sha256((request.method+request.url.path+json.dumps(raw,sort_keys=True,default=str)).encode()).hexdigest()
    previous=db.scalar(select(Operation).where(Operation.key==key))
    if previous:
        if not hmac.compare_digest(previous.request_hash,fingerprint): raise HTTPException(409,"This operation identifier was used for different input.")
        return previous.response
    try:
        result=fn()
        db.flush()
        db.add(Operation(key=key,request_hash=fingerprint,response=result))
        db.commit()
        return result
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,"A matching name, SKU, barcode, or reference already exists.")

def run(request,db,user,body,fn):
    request.state.payload=body.model_dump(mode="json") if hasattr(body,"model_dump") else body
    return mutation(request,db,user,fn)

@app.get("/api/v1/health")
def health(): return {"status":"ok"}

@app.get("/api/v1/state")
def get_state(db=Depends(get_db),user=Depends(auth)): return svc.state(db,user)

@app.post("/api/v1/categories")
def category(data:NameInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    def action():
        key=" ".join(data.name.split()).casefold()
        c=db.scalar(select(Category).where(Category.normalized==key))
        if not c:
            c=Category(name=" ".join(data.name.split()),normalized=key);db.add(c);db.flush()
            svc.activity(db,user,"category.created",c.name)
        return {"id":c.id}
    return run(request,db,user,data,action)

@app.post("/api/v1/warehouses")
def warehouse(data:NameInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    def action():
        w=Warehouse(name=data.name);db.add(w);db.flush();return {"id":w.id}
    return run(request,db,user,data,action)

@app.post("/api/v1/products")
def product(data:ProductInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    return run(request,db,user,data,lambda:svc.product_save(db,user,data))

@app.patch("/api/v1/products/{id}")
def edit_product(id:str,data:ProductInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    return run(request,db,user,data,lambda:svc.product_save(db,user,data,id))

@app.post("/api/v1/parties")
def party(data:PartyInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    def action():
        p=Party(**data.model_dump());db.add(p);db.flush();svc.activity(db,user,"party.created",p.name);return {"id":p.id}
    return run(request,db,user,data,action)

@app.patch("/api/v1/parties/{id}")
def party_edit(id:str,data:PartyInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    def action():
        p=svc.require(db,Party,id)
        if p.kind!=data.kind: raise HTTPException(422,"Account type cannot change.")
        for k,v in data.model_dump().items():setattr(p,k,v)
        return {"id":p.id}
    return run(request,db,user,data,action)

@app.post("/api/v1/stock/adjust")
def adjust(data:AdjustInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    def action():
        svc.move(db,user,data.product_id,data.warehouse_id,data.quantity,data.reason)
        svc.activity(db,user,"stock.adjusted",data.reason);return {"ok":True}
    return run(request,db,user,data,action)

@app.post("/api/v1/stock/transfer")
def transfer(data:TransferInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    def action():
        if data.from_warehouse_id==data.to_warehouse_id: raise HTTPException(422,"Choose a different destination warehouse.")
        svc.move(db,user,data.product_id,data.from_warehouse_id,-data.quantity,"Warehouse transfer")
        svc.move(db,user,data.product_id,data.to_warehouse_id,data.quantity,"Warehouse transfer")
        return {"ok":True}
    return run(request,db,user,data,action)

@app.post("/api/v1/documents")
def document(data:DocumentInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    return run(request,db,user,data,lambda:svc.save_document(db,user,data))

@app.patch("/api/v1/documents/{id}")
def document_edit(id:str,data:DocumentInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    return run(request,db,user,data,lambda:svc.save_document(db,user,data,id))

@app.post("/api/v1/documents/{id}/confirm")
def confirm(id:str,data:PostInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    def action():
        d=svc.require(db,Document,id);svc.confirm(db,user,d,data.payment)
        if data.fulfill:svc.fulfill(db,user,d)
        return {"id":d.id}
    return run(request,db,user,data,action)

@app.post("/api/v1/documents/{id}/fulfill")
def fulfill(id:str,request:Request,db=Depends(get_db),user=Depends(auth)):
    def action():
        d=svc.require(db,Document,id);svc.fulfill(db,user,d);return {"id":d.id}
    return run(request,db,user,{},action)

@app.post("/api/v1/documents/{id}/reverse")
def reverse_doc(id:str,data:ReasonInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    def action():
        svc.reverse_document(db,user,svc.require(db,Document,id),data.reason);return {"ok":True}
    return run(request,db,user,data,action)

@app.post("/api/v1/payments")
def payment(data:PaymentInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    return run(request,db,user,data,lambda:svc.record_payment(db,user,data))

@app.post("/api/v1/payments/{id}/allocate")
def payment_allocate(id:str,data:AllocateInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    def action():
        svc.allocate(db,user,svc.require(db,Payment,id),data.allocations);return {"ok":True}
    return run(request,db,user,data,action)

@app.post("/api/v1/payments/{id}/reverse")
def payment_reverse(id:str,data:ReasonInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    def action():
        p=svc.require(db,Payment,id)
        if p.reversed:raise HTTPException(409,"Already reversed.")
        p.reversed=True;svc.activity(db,user,"payment.reversed",data.reason);return {"ok":True}
    return run(request,db,user,data,action)

@app.patch("/api/v1/settings")
def settings(data:SettingsInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    def action():
        if data.logo and not re.fullmatch(r"data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+",data.logo):
            raise HTTPException(422,"Upload a PNG, JPEG, or WebP logo.")
        s=db.get(Setting,1);s.data=data.model_dump(mode="json");return {"ok":True}
    return run(request,db,user,data,action)

@app.get("/api/v1/invoices/{id}/print",response_class=HTMLResponse)
def invoice(id:str,db=Depends(get_db),user=Depends(auth)):
    from .invoice import render
    d=svc.require(db,Document,id)
    if not d.snapshot:raise HTTPException(409,"Confirm the invoice first.")
    return render(d)

@app.get("/api/v1/backups")
def backups(user=Depends(auth)):
    from .backups import list_backups
    return list_backups()

@app.post("/api/v1/backups")
def backup_now(request:Request,db=Depends(get_db),user=Depends(auth)):
    from .backups import enqueue
    return run(request,db,user,{},lambda:enqueue("backup",user,key=request.headers.get("Idempotency-Key")))

@app.post("/api/v1/backups/restore")
def restore(data:RestoreInput,request:Request,db=Depends(get_db),user=Depends(auth)):
    if not data.confirmed: raise HTTPException(422,"Confirm restoration before continuing.")
    from .backups import enqueue
    return run(request,db,user,{"backup":data.backup,"confirmed":data.confirmed},lambda:enqueue("restore",user,data.backup,key=request.headers.get("Idempotency-Key")))
