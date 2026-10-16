import { AppState, Doc, Line, Product, Party, number, today, totals, balance } from "./types";
const STORE="inventory-preview-v1";
const id=()=>crypto.randomUUID();
const time=(days=0)=>new Date(Date.now()-days*86400000).toISOString();
const cash=(n:number)=>n.toFixed(2);
function base():AppState{return {schema_version:3,workspace:{name:"Local workspace"},user:{role:"workspace"},categories:[],warehouses:[{id:"w1",name:"Main warehouse"},{id:"w2",name:"Reserve warehouse"}],products:[],stock:[],parties:[],documents:[],payments:[],movements:[],activity:[],settings:{company_name:"Inventory Trading",company_name_ar:"تجارة المخزون",phone:"+212 5 22 00 00 00",address:"Casablanca, Morocco",logo:""}};}
function snapshot(s:AppState,d:Doc){return {company:{...s.settings},party:s.parties.find(p=>p.id===d.party_id)||null,lines:structuredClone(d.items),paid_at_issue:d.paid,total:d.total,subtotal:d.subtotal,discount:d.discount,language:d.language,due_date:d.due_date};}
export function seed():AppState{
 const s=base();
 s.categories=[{id:"c1",name:"Food & pantry"},{id:"c2",name:"Household"},{id:"c3",name:"Office supplies"},{id:"c4",name:"Hardware"}];
 const products=[
 ["p1","Extra virgin olive oil","c1","5-liter bottle","liter","72","10","18"],
 ["p2","Premium coffee beans","c1","Medium roast, sold by kilogram","kg","145","8","4"],
 ["p3","Liquid detergent","c2","12 bottles per carton","carton","180","5","3"],
 ["p4","A4 copy paper","c3","80 gsm, 500-sheet ream","piece","42","10","56"],
 ["p5","LED bulb · warm white","c4","9W, E27 fitting","piece","28","15","8"],
 ["p6","Cotton kitchen towel","c2","Natural cotton, 40 × 60 cm","piece","35","10","38"],
 ["p7","Packing tape","c3","Clear, 48 mm × 100 m","piece","18","10","64"],
 ["p8","Almonds","c1","Raw, shelled","kg","110","5","22"]
 ];
 s.products=products.map((p,i)=>({id:p[0],name:p[1],category_id:p[2],supplier_id:p[2]==="c1"?"su2":"su1",purchase_cost:["54","105","132","30","18","24","12","80"][i],description:p[3],unit:p[4],price:p[5],threshold:p[6],active:true,sku:i%3===0?"MZ-"+String(i+1).padStart(3,"0"):null,barcode:i===0?"0612345678901":null,created_at:time(30-i)}));
 s.stock=products.map(p=>({product_id:p[0],warehouse_id:"w1",quantity:p[7]}));
 s.parties=[{id:"cu1",kind:"customer",name:"Atlas Market",phone:"+212 6 00 11 22 33",address:"Casablanca",notes:""},
 {id:"cu2",kind:"customer",name:"Maison Amal",phone:"+212 6 00 22 33 44",address:"Rabat",notes:""},
 {id:"cu3",kind:"customer",name:"Youssef El Idrissi",phone:"+212 6 00 33 44 55",address:"Casablanca",notes:""},
 {id:"cu4",kind:"customer",name:"Café Les Oliviers",phone:"+212 6 00 44 55 66",address:"Marrakech",notes:""},
 {id:"su1",kind:"supplier",name:"Nord Distribution",phone:"+212 5 00 11 22 33",address:"Tangier",notes:""},
 {id:"su2",kind:"supplier",name:"Terroir du Maroc",phone:"+212 5 00 22 33 44",address:"Meknes",notes:""}];
 const add=(docid:string,kind:"sale"|"purchase",party:string|null,prod:string,q:number,price:number,paid:number,days:number,fulfilled=true)=>{
 const p=s.products.find(p=>p.id===prod)!;
 const d:Doc={id:docid,kind,party_id:party,warehouse_id:"w1",number:(kind==="sale"?"INV-":"PUR-")+String(s.documents.filter(d=>d.kind===kind).length+1).padStart(6,"0"),status:"confirmed",fulfilled,fulfilled_at:fulfilled?time(days):null,items:[{product_id:p.id,name:p.name,unit:p.unit,quantity:String(q),price:String(price)}],subtotal:cash(q*price),discount:"0",total:cash(q*price),paid:cash(paid),due_date:new Date(Date.now()+14*86400000).toISOString().slice(0,10),language:"en",reference:"",created_at:time(days),issued_at:time(days)};
 d.snapshot=snapshot(s,d);s.documents.unshift(d);
 if(paid)s.payments.push({id:"pay"+docid,party_id:party,amount:cash(paid),available:"0",paid_at:time(days).slice(0,10),method:"cash",reference:"",reversed:false,allocations:[{document_id:docid,amount:cash(paid)}]});
 };
 add("s1","sale","cu1","p1",25,72,1800,6);add("s2","sale","cu2","p6",48,35,500,4);
 add("s3","sale","cu4","p2",12,145,0,2,false);add("s4","sale","cu1","p4",60,42,2520,1);
 add("s5","sale","cu3","p8",15,110,650,0);add("s6","sale",null,"p5",8,28,224,0);
 add("b1","purchase","su1","p4",100,30,1500,9);add("b2","purchase","su2","p1",80,54,2000,8);
 s.payments.push({id:"dep1",party_id:"cu1",amount:"500",available:"500",paid_at:today(),method:"transfer",reference:"Advance",reversed:false,allocations:[]});
 s.activity=[{id:"a1",action:"sale.confirmed",label:"INV-000006",created_at:time()},{id:"a2",action:"payment.recorded",label:"650.00 MAD",created_at:new Date(Date.now()-3600000).toISOString()},{id:"a3",action:"sale.confirmed",label:"INV-000005",created_at:new Date(Date.now()-7200000).toISOString()},{id:"a4",action:"product.created",label:"Almonds",created_at:time(1)}];
 return s;
}
export function readDemo():AppState {
 const saved=localStorage.getItem(STORE);
 if(saved){try{
  const s=JSON.parse(saved);
  if(s.schema_version!==2){
   const samples=seed();
   delete s.settings.tax_id;delete s.settings.default_tax;
   if(s.settings.company_name==="inventory Trading")s.settings.company_name="Inventory Trading";
   if(s.settings.company_name_ar==="تجارة ميزان")s.settings.company_name_ar="تجارة المخزون";
   for(const d of s.documents){
    delete d.tax;delete d.tax_rate;
    if(d.snapshot){delete d.snapshot.tax;delete d.snapshot.tax_rate;if(d.snapshot.company){delete d.snapshot.company.tax_id;delete d.snapshot.company.default_tax;}}
    if(d.status==="draft"){const t=totals(d.items,d.discount);d.subtotal=cash(t.subtotal);d.total=cash(t.total);}
   }
   for(const p of s.products){
    const sample=samples.products.find(x=>x.id===p.id&&x.name===p.name);
    const buy=s.documents.filter((d:Doc)=>d.kind==="purchase"&&d.status==="confirmed"&&d.items.some(l=>l.product_id===p.id)).sort((a:Doc,b:Doc)=>(b.issued_at||b.created_at).localeCompare(a.issued_at||a.created_at))[0];
    const known=buy?.party_id||sample?.supplier_id;
    p.supplier_id=p.supplier_id||(s.parties.some((v:Party)=>v.id===known&&v.kind==="supplier")?known:null);
    p.purchase_cost=p.purchase_cost??sample?.purchase_cost??null;
   }
   s.schema_version=2;write(s);
  }
  return s;
 }catch{}}
 const s=seed();write(s);return s;
}
function write(s:AppState){localStorage.setItem(STORE,JSON.stringify(s));}
export function resetDemo(empty=false){const s=empty?base():seed();write(s);return s;}
const fail=(msg:string):never=>{throw new Error(msg);};
function recalcPayments(s:AppState){
 s.documents.forEach(d=>{d.paid=cash(s.payments.filter(p=>!p.reversed).flatMap(p=>p.allocations).filter(a=>a.document_id===d.id).reduce((n,a)=>n+number(a.amount),0));});
 s.payments.forEach(p=>p.available=p.reversed?"0":cash(number(p.amount)-p.allocations.reduce((n,a)=>n+number(a.amount),0)));
}
function movement(s:AppState,product_id:string,warehouse_id:string,quantity:number,reason:string){
 const p=s.products.find(p=>p.id===product_id)!;
 if(!p)fail("Product not found.");
 if(["unit","piece","carton"].includes(p.unit)&&!Number.isInteger(quantity))fail("This product requires a whole quantity.");
 let st=s.stock.find(v=>v.product_id===product_id&&v.warehouse_id===warehouse_id);
 if(!st){st={product_id,warehouse_id,quantity:"0"};s.stock.push(st);}
 if(number(st.quantity)+quantity<0)fail("Not enough stock for this operation.");
 st.quantity=String(Math.round((number(st.quantity)+quantity)*1000)/1000);
 s.movements.unshift({id:id(),product_id,warehouse_id,quantity:String(quantity),reason,created_at:time()});
}
function fulfill(s:AppState,d:Doc){if(d.fulfilled)return;if(d.status==="reversed")fail("Already reversed.");if(d.kind==="sale"&&d.status!=="confirmed")fail("Confirm the invoice first.");d.items.forEach(l=>movement(s,l.product_id,d.warehouse_id,number(l.quantity)*(d.kind==="sale"?-1:1),d.kind==="sale"?"Sale delivery":"Purchase receipt"));d.fulfilled=true;d.fulfilled_at=time();}
function confirm(s:AppState,d:Doc,payment:number){
 if(d.status!=="draft")fail("Only a draft can be confirmed.");
 if(d.items.some(l=>l.price===null||l.price===""))fail("Enter an explicit price for every product.");
 if(!d.party_id&&Math.round(payment*100)!==Math.round(number(d.total)*100))fail("Walk-in sales must be paid in full. Select a customer for credit or deposits.");
 if(payment>number(d.total))fail("Record an extra deposit from the account.");
 const n=Math.max(0,...s.documents.filter(x=>x.kind===d.kind&&x.number).map(x=>Number(x.number!.split("-")[1])))+1;
 d.number=(d.kind==="sale"?"INV-":"PUR-")+String(n).padStart(6,"0");d.status="confirmed";d.issued_at=time();d.paid=cash(payment);
 if(payment)s.payments.unshift({id:id(),party_id:d.party_id,amount:cash(payment),available:"0",paid_at:today(),method:"cash",reference:"",reversed:false,allocations:[{document_id:d.id,amount:cash(payment)}]});
 d.snapshot=snapshot(s,d);
}
export async function demoCommand(path:string,body:any,method="POST"){
 if(path.startsWith("/documents")&&("tax_rate" in body||"tax" in body))fail("Unsupported field.");
 if(path==="/settings"&&("tax_id" in body||"default_tax" in body))fail("Unsupported field.");
 const s=structuredClone(readDemo());let result:any={ok:true},label="",action="document.saved";const parts=path.split("/").filter(Boolean);
 if(path==="/categories"){const name=body.name.trim();if(!name)fail("Enter a name.");let c=s.categories.find(c=>c.name.toLowerCase()===name.toLowerCase());if(!c){c={id:id(),name};s.categories.push(c);}result={id:c.id};label=name;action="category.created";}
 else if(path==="/warehouses"){const w={id:id(),name:body.name.trim()};s.warehouses.push(w);result={id:w.id};}
 else if(parts[0]==="products"){
  const sku=body.sku?.trim().toUpperCase()||null,barcode=body.barcode?.trim()||null;
  if(!body.name.trim()||!body.category_id)fail("Enter a name and category.");
  if(!s.parties.some(p=>p.id===body.supplier_id&&p.kind==="supplier"))fail("Select a supplier for this product.");
  if(body.purchase_cost!==null&&body.purchase_cost!==undefined&&body.purchase_cost!==""&&(!Number.isFinite(Number(body.purchase_cost))||Number(body.purchase_cost)<0))fail("Enter a valid purchase cost.");
  if(s.products.some(p=>p.id!==parts[1]&&((sku&&p.sku===sku)||(barcode&&p.barcode===barcode))))fail("A matching name, SKU, barcode, or reference already exists.");
  const old=s.products.find(p=>p.id===parts[1]);
  if(old&&old.unit!==body.unit&&s.movements.some(m=>m.product_id===old.id))fail("A product unit cannot change after stock activity.");
  const p={description:"",unit:"unit",threshold:"0",active:true,...body,id:old?.id||id(),sku,barcode,purchase_cost:body.purchase_cost===""?null:body.purchase_cost??null,price:body.price===""?null:body.price??null,created_at:old?.created_at||time()} as Product;
  if(old)s.products=s.products.map(x=>x.id===old.id?p:x);else s.products.unshift(p);result={id:p.id};label=p.name;action=old?"product.updated":"product.created";
 } else if(parts[0]==="parties"){const old=s.parties.find(p=>p.id===parts[1]);const p={...body,id:old?.id||id()};if(old)s.parties=s.parties.map(x=>x.id===p.id?p:x);else s.parties.push(p);result={id:p.id};label=p.name;action="party.created";}
 else if(path==="/stock/adjust"){if(!number(body.quantity))fail("Quantity must not be zero.");movement(s,body.product_id,body.warehouse_id,number(body.quantity),body.reason);label=body.reason;action="stock.adjusted";}
 else if(path==="/stock/transfer"){if(body.from_warehouse_id===body.to_warehouse_id)fail("Choose a different destination warehouse.");movement(s,body.product_id,body.from_warehouse_id,-number(body.quantity),"Warehouse transfer");movement(s,body.product_id,body.to_warehouse_id,number(body.quantity),"Warehouse transfer");}
 else if(parts[0]==="documents"){
  let d=s.documents.find(d=>d.id===parts[1]);
  if(parts.length===1||method==="PATCH"){
   if(!body.items.length)fail("Add at least one product.");
   if(body.kind==="purchase"&&!body.party_id)fail("Select a supplier.");
   if(d&&d.status!=="draft")fail("Posted invoices cannot be edited.");
   if(d?.fulfilled&&(JSON.stringify(d.items.map(l=>[l.product_id,number(l.quantity)]))!==JSON.stringify(body.items.map((l:Line)=>[l.product_id,number(l.quantity)]))||d.warehouse_id!==body.warehouse_id))fail("Received quantities and warehouse cannot change.");
   const items=body.items.map((l:Line)=>{const p=s.products.find(p=>p.id===l.product_id);if(!p)fail("Select a product.");if(number(l.quantity)<=0)fail("Enter a positive quantity.");return {...l,name:p!.name,unit:p!.unit,price:l.price===""?null:l.price};});
   const t=totals(items,body.discount);if(t.total<0||number(body.discount)>t.subtotal)fail("Discount exceeds the subtotal.");
   const next:Doc={...body,id:d?.id||id(),number:null,items,subtotal:cash(t.subtotal),total:cash(t.total),paid:"0",status:"draft",fulfilled:d?.fulfilled||false,created_at:d?.created_at||time()};
   if(d)s.documents=s.documents.map(x=>x.id===d!.id?next:x);else s.documents.unshift(next);d=next;
   if(body.confirm)confirm(s,d,number(body.payment));
   if(body.fulfill&&(body.kind==="purchase"||body.confirm))fulfill(s,d);
  } else if(d){
   if(parts[2]==="confirm"){confirm(s,d,number(body.payment));if(body.fulfill)fulfill(s,d);}
   if(parts[2]==="fulfill")fulfill(s,d);
   if(parts[2]==="reverse"){if(number(d.paid)>0)fail("Reverse allocated payments first.");if(d.status==="reversed")fail("Already reversed.");if(d.fulfilled)d.items.forEach(l=>movement(s,l.product_id,d!.warehouse_id,number(l.quantity)*(d!.kind==="sale"?1:-1),"Reversal: "+body.reason));d.status="reversed";}
  } else fail("Record not found.");
  result={id:d!.id};label=d!.number||"Draft";action=d!.kind==="sale"?"sale.confirmed":"purchase.invoiced";
 } else if(parts[0]==="payments"){
  let p=s.payments.find(p=>p.id===parts[1]);
  if(parts.length===1){p={id:id(),...body,available:body.amount,reversed:false,allocations:[]};s.payments.unshift(p!);}
  if(!p)fail("Payment not found.");
  if(parts[2]==="reverse")p!.reversed=true;
  else for(const a of body.allocations||[]){
   const d=s.documents.find(d=>d.id===a.document_id);
   recalcPayments(s);
   if(!d||d.party_id!==p!.party_id||p!.reversed||number(a.amount)>balance(d)||number(a.amount)>number(p!.available)||number(a.amount)<=0)fail("Allocation exceeds the available payment or invoice balance.");
   p!.allocations.push(a);
  }
  result={id:p!.id};label=String(p!.amount)+" MAD";action="payment.recorded";
 } else if(path==="/settings"){s.settings=body;action="settings.updated";}
 else fail("This action is available in production.");
 recalcPayments(s);s.activity.unshift({id:id(),action,label,created_at:time()});s.activity=s.activity.slice(0,50);write(s);return result;
}
