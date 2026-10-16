export type Lang = "en" | "ar";
export type Page = "dashboard"|"stock"|"sales"|"purchases"|"customers"|"suppliers"|"settings";
export type Product = {id:string;name:string;category_id:string;supplier_id:string|null;purchase_cost:string|null;description:string;sku:string|null;barcode:string|null;unit:string;price:string|null;threshold:string;active:boolean;created_at?:string};
export type Party = {id:string;kind:"customer"|"supplier";name:string;phone:string;address:string;notes:string};
export type Line = {id?:string;product_id:string;name?:string;unit?:string;quantity:string;price:string|null};
export type Doc = {id:string;kind:"sale"|"purchase";party_id:string|null;warehouse_id:string;number:string|null;status:"draft"|"confirmed"|"reversed";fulfilled:boolean;fulfilled_at?:string|null;items:Line[];subtotal:string;discount:string;total:string;paid:string;due_date:string|null;language:Lang;reference:string;created_at:string;issued_at?:string;snapshot?:Record<string,any>};
export type Payment = {id:string;party_id:string|null;amount:string;available:string;paid_at:string;method:string;reference:string;reversed:boolean;allocations:{document_id:string;amount:string}[]};
export type Activity = {id:string;action:string;label:string;created_at:string;actor?:string};
export type AppState = {schema_version?:number;workspace:{name:string};user:{role:"workspace"};categories:{id:string;name:string}[];warehouses:{id:string;name:string}[];products:Product[];stock:{product_id:string;warehouse_id:string;quantity:string}[];parties:Party[];documents:Doc[];payments:Payment[];movements:{id:string;product_id:string;warehouse_id:string;quantity:string;reason:string;created_at:string}[];activity:Activity[];settings:{company_name:string;company_name_ar:string;phone:string;address:string;logo:string}};
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "true";
export const money = (value:string|number,lang:Lang="en") => new Intl.NumberFormat(lang==="ar"?"ar-MA":"en-GB",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));
export const today = () => new Date().toISOString().slice(0,10);
export const number = (v:any)=>Number(v||0);
export const balance = (d:Doc)=>d.status==="confirmed"?Math.max(0,number(d.total)-number(d.paid)):0;
export const sum = <T,>(rows:T[], fn:(r:T)=>number)=>rows.reduce((n,r)=>n+fn(r),0);
export const dateLabel = (value:string,lang:Lang="en")=>new Intl.DateTimeFormat(lang==="ar"?"ar-MA":"en-GB",{day:"numeric",month:"short",year:"numeric"}).format(new Date(value.length===10?value+"T12:00:00":value));
export function totals(items:Line[],discount:string){
 const subtotal=items.reduce((s,l)=>s+Math.round(Math.round(number(l.quantity)*1000)*Math.round(number(l.price)*100)/1000),0);
 const off=Math.round(number(discount)*100);
 return {subtotal:subtotal/100,discount:off/100,total:(subtotal-off)/100};
}

/** Reference cost only: the latest confirmed purchase, falling back to the starting cost. */
export function purchaseReference(s:AppState,p:Product){
 const purchases=s.documents.filter(d=>d.kind==="purchase"&&d.status==="confirmed")
  .sort((a,b)=>(b.issued_at||b.created_at).localeCompare(a.issued_at||a.created_at)||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
 for(const d of purchases){const line=d.items.find(l=>l.product_id===p.id&&l.price!==null&&l.price!=="");if(line)return {cost:line.price,fromPurchase:true};}
 return {cost:p.purchase_cost??null,fromPurchase:false};
}
