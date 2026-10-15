from html import escape
from decimal import Decimal
from .services import money

def render(doc):
    s=doc.snapshot;c=s.get("company",{});p=s.get("party") or {};ar=s.get("language")=="ar"
    def tr(en,arabic):return arabic if ar else en
    def e(v):return escape(str(v or ""),quote=True)
    def amount(v):return f"{money(Decimal(str(v or 0))):,.2f}"
    unit_names={"unit":"وحدة","piece":"قطعة","kg":"كيلوغرام","meter":"متر","carton":"كرتونة","liter":"لتر"}
    lines="".join("<tr><td>"+e(l["name"])+"</td><td>"+e(l["quantity"])+" "+e(unit_names.get(l["unit"],l["unit"]) if ar else l["unit"])+"</td><td>"+amount(l["price"])+"</td><td>"+amount(Decimal(l["quantity"])*Decimal(l["price"]))+"</td></tr>" for l in s["lines"])
    total=Decimal(s["total"]);paid=Decimal(s.get("paid_at_issue","0"))
    logo=f'<img src="{e(c["logo"])}" alt="">' if c.get("logo") else ""
    header=tr("INVOICE","فاتورة") if doc.kind=="sale" else tr("PURCHASE RECORD","سجل شراء")
    delivery_label=tr("Delivery recorded","تاريخ التسليم") if doc.kind=="sale" else tr("Receipt recorded","تاريخ الاستلام")
    delivery_date=e(str(doc.fulfilled_at)[:10]) if doc.fulfilled_at else tr("Pending","قيد الانتظار")
    rows=[(tr("Subtotal","المجموع الفرعي"),s["subtotal"]),(tr("Discount","الخصم"),s["discount"]),(tr("Total","المجموع"),total),(tr("Paid at issue","المدفوع عند الإصدار"),paid),(tr("Remaining at issue","المتبقي عند الإصدار"),total-paid)]
    totals="".join(f'<div class="{"total" if i==2 else ""}"><span>{label}</span><strong>{amount(value)} MAD</strong></div>' for i,(label,value) in enumerate(rows))
    return f"""<!doctype html><html lang="{'ar' if ar else 'en'}" dir="{'rtl' if ar else 'ltr'}"><head><meta charset="utf-8"><title>{e(doc.number)}</title><style>
    body{{font-family:Arial,sans-serif;max-width:850px;margin:40px auto;padding:20px;color:#213c2b}}header{{display:flex;justify-content:space-between;border-bottom:3px solid #24694f;padding-bottom:20px}}h1{{margin:0}}p{{line-height:1.8;color:#7a8b73}}table{{width:100%;border-collapse:collapse;margin-top:35px}}th,td{{padding:14px 10px;text-align:start;border-bottom:1px solid #e4ebdf}}th{{background:#f4f7ef}}.totals{{width:340px;margin-inline-start:auto;margin-top:30px}}.totals div{{display:flex;justify-content:space-between;padding:10px}}.total{{font-size:22px;border-top:2px solid #24694f}}button{{padding:11px 22px;background:#24694f;color:white;border:0;border-radius:6px;margin-bottom:25px;cursor:pointer}}img{{max-height:70px;max-width:160px}}@media print{{button{{display:none}}body{{margin:0;padding:15mm;max-width:none}}@page{{size:A4;margin:8mm}}}}</style></head><body>
    <button onclick="window.print()">{tr("Print / Save as PDF","طباعة / حفظ PDF")}</button>
    <header><div>{logo}<h1>{e(c.get("company_name_ar") or c.get("company_name") if ar else c.get("company_name"))}</h1><p>{e(c.get("address"))}<br>{e(c.get("phone"))}</p></div><div><h2>{header}</h2><strong>{e(doc.number)}</strong><p>{e(str(doc.issued_at or doc.created_at)[:10])}</p></div></header>
    <p>{tr("Bill to","العميل") if doc.kind=="sale" else tr("Supplier","المورد")}: <strong>{e(p.get("name") or tr("Walk-in customer","عميل عابر"))}</strong><br>{e(p.get("address"))}</p>
    <table><thead><tr><th>{tr("Product","المنتج")}</th><th>{tr("Quantity","الكمية")}</th><th>{tr("Unit price","سعر الوحدة")}</th><th>{tr("Total","المجموع")}</th></tr></thead><tbody>{lines}</tbody></table>
    <p>{delivery_label}: {delivery_date}</p><div class="totals">{totals}</div><p>{tr("Due date","تاريخ الاستحقاق")}: {e(doc.due_date or "—")}</p>
    </body></html>"""
