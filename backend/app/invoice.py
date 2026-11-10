"""Printable A4 invoice matching the customer's supplied table template."""

from datetime import date
from decimal import Decimal
from html import escape
import re
from .services import money
from .decimal_type import price_text

PRINT_CSS = '@page{size:A4;margin:20mm 15mm}\n*{box-sizing:border-box}\nbody{margin:0;color:#111;background:#ececec;font-family:Arial,"DejaVu Sans",sans-serif;font-size:10.5pt;line-height:1.45}\n.toolbar{max-width:210mm;margin:18px auto;text-align:end;padding:0 15mm}\n.toolbar button{padding:10px 18px;border:1px solid #333;border-radius:5px;background:#222;color:#fff;cursor:pointer;font:inherit}\n.sheet{width:210mm;min-height:297mm;margin:0 auto 20px;padding:20mm 15mm;background:white}\n.masthead{display:table;width:100%;table-layout:fixed;margin-bottom:10mm;padding-bottom:6mm;border-bottom:2px solid #222}\n.company{display:table-cell;width:68%;vertical-align:top}\n.invoice-title{display:table-cell;width:32%;vertical-align:top;text-align:end;font-size:17pt;font-weight:700;line-height:1.25;padding-top:1mm;text-decoration:underline;text-underline-offset:3px}\n.company-identity{display:table;width:100%;table-layout:auto}\n.logo-cell{display:table-cell;width:1%;vertical-align:middle;padding-inline-end:5mm}\n.company-logo{display:block;max-width:32mm;max-height:18mm;object-fit:contain}\nh1{display:table-cell;vertical-align:middle;font-size:17pt;line-height:1.25;margin:0;font-weight:700;overflow-wrap:anywhere}\n.company-contact{margin-top:4mm;white-space:pre-line;overflow-wrap:anywhere}\n.parties{display:table;width:100%;table-layout:fixed;margin-bottom:10mm;border:1px solid #555}\n.bill-to{display:table-cell;width:56%;vertical-align:top;white-space:pre-line;overflow-wrap:anywhere;padding:4mm 5mm;border-inline-end:1px solid #555}\n.bill-label{font-weight:700;margin-bottom:1mm}\n.metadata-wrap{display:table-cell;width:44%;vertical-align:top;padding:4mm}\n.metadata{border-collapse:collapse;width:100%;line-height:1.65}\n.metadata th{font-weight:700;text-align:end;padding:0 4mm 0 0;width:57%}\n.metadata td{text-align:end;padding:0;overflow-wrap:anywhere}\n[dir=rtl] .metadata th{padding:0 0 0 4mm}\n.items{width:100%;table-layout:fixed;border-collapse:collapse}\n.items th,.items .item td{border:1px solid #555;padding:2mm 2mm;vertical-align:top}\n.items th{text-align:center;background:#ededed;font-size:9pt;font-weight:700}\n.items td{overflow-wrap:anywhere}\n.quantity{text-align:center}\n.description{text-align:start;white-space:pre-line}\n.number{text-align:end;font-variant-numeric:tabular-nums}\n.unit{display:block;font-size:8pt;color:#555}\n.items thead{display:table-header-group}\n.item{break-inside:avoid;page-break-inside:avoid}\n.summary{break-inside:avoid;page-break-inside:avoid}\n.summary td{text-align:end;padding:2.5mm;border:1px solid #555}\n.adjustment td{font-size:10pt}\n.total td{font-size:12pt;font-weight:700;background:#ededed}\n.total-amount bdi{font-variant-numeric:tabular-nums}\n@media screen and (max-width:820px){.sheet{width:100%;min-height:0;padding:24px}.toolbar{padding:0 24px}}\n@media print{body{background:#fff}.toolbar{display:none}.sheet{width:auto;min-height:0;margin:0;padding:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}\n'


def print_amount(value, arabic=False):
    """French decimal comma and narrow no-break grouping; retain Arabic layout."""
    formatted = f"{Decimal(str(value or 0)):,.2f}"
    return formatted.replace(",", "\u202f").replace(".", ",")


def print_unit_price(value, arabic=False):
    whole, fraction = price_text(value).split(".")
    grouped = f"{int(whole):,}"
    return grouped.replace(",", "\u202f") + "," + fraction


def render(doc, company_logo=None):
    snapshot = doc.snapshot
    company = snapshot.get("company", {})
    party = snapshot.get("party") or {}
    arabic = False

    def tr(fr, ar):
        return fr

    def e(value):
        return escape(str(value if value is not None else ""), quote=True)

    def amount(value):
        return print_amount(money(Decimal(str(value or 0))), arabic)

    def printed_date(value):
        if not value:
            return "—"
        try:
            return date.fromisoformat(str(value)[:10]).strftime("%d/%m/%Y")
        except ValueError:
            return str(value)[:10]

    french_units = {
        "unit": "unité",
        "piece": "pièce",
        "kg": "kg",
        "meter": "mètre",
        "carton": "carton",
        "liter": "litre",
    }
    lines = []
    multiple_warehouses = len({line.get("warehouse_id") for line in snapshot["lines"]}) > 1
    for line in snapshot["lines"]:
        quantity = format(Decimal(str(line["quantity"])).normalize(), "f")
        quantity = quantity.replace(".", ",")
        unit = line.get("unit", "unit")
        unit_label = french_units.get(unit, unit)
        unit_html = (
            f'<small class="unit">{e(unit_label)}</small>' if unit not in ("unit", "piece") else ""
        )
        warehouse_html = (
            f"""<small class="unit">{'Entrepôt'} : {e(line.get('warehouse_name', ''))}</small>"""
            if multiple_warehouses
            else ""
        )
        price_cells = "" if doc.kind == "delivery" else (
            f"""<td class="number"><bdi>{print_unit_price(line['price'], arabic)}</bdi></td><td class="number"><bdi>{amount(Decimal(str(line['quantity'])) * Decimal(str(line['price'])))}</bdi></td>"""
        )
        lines.append(
            f"""<tr class="item"><td class="description">{e(line['name'])}{warehouse_html}</td><td class="quantity"><bdi>{e(quantity)}</bdi>{unit_html}</td>{price_cells}</tr>"""
        )
    logo_value = company_logo if company_logo is not None else company.get("logo", "")
    logo = ""
    if logo_value and re.fullmatch("data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+", logo_value):
        logo = f"""<span class="logo-cell"><img class="company-logo" src="{e(logo_value)}" alt="{'Logo de l’entreprise'}"></span>"""
    company_name = company.get("company_name")
    heading = {
        "sale": "FACTURE",
        "purchase": "FACTURE D’ACHAT",
        "quote": "DEVIS",
        "delivery": "BON DE LIVRAISON",
    }[doc.kind]
    party_label = "Fournisseur" if doc.kind == "purchase" else "Client"
    party_name = party.get("name") or "Client de passage"
    currency = "MAD"
    discount = Decimal(str(snapshot.get("discount", 0)))
    adjustments = ""
    if discount:
        adjustments = f"""<tr class="adjustment"><td colspan="3">{'Sous-total'}</td><td><bdi>{amount(snapshot['subtotal'])}</bdi></td></tr><tr class="adjustment"><td colspan="3">{'Remise'}</td><td><bdi>−{amount(discount)}</bdi></td></tr>"""

    if doc.kind == "delivery":
          table_columns = '<col style="width:82%"><col style="width:18%">'
          table_headers = "<th>DÉSIGNATION</th><th>QTÉ</th>"
          summary = ""
    else:
          table_columns = '<col style="width:43%"><col style="width:12%"><col style="width:22%"><col style="width:23%">'
          table_headers = "<th>DÉSIGNATION</th><th>QTÉ</th><th>PRIX UNITAIRE</th><th>MONTANT</th>"
          summary = f"""<tbody class="summary">{adjustments}<tr class="total"><td colspan="3">{'TOTAL'}</td><td class="total-amount"><bdi>{amount(snapshot['total'])}</bdi> {currency}</td></tr></tbody>"""

    def contacts(obj):
        address = f"<div>{e(obj.get('address'))}</div>" if obj.get("address") else ""
        phone = (
            f"""<div><bdi dir="ltr">{e(obj.get('phone'))}</bdi></div>""" if obj.get("phone") else ""
        )
        return address + phone

    company_contact = contacts(company)
    party_contact = contacts(party)
    extra = (
        '<p style="white-space:pre-wrap">' + e(snapshot.get("notes", "")) + "</p>"
        if snapshot.get("notes")
        else ""
    )
    if doc.status == "reversed":
        extra += "<p>DOCUMENT ANNULÉ</p>"
    return f"""<!doctype html>\n<html lang="{'fr'}" dir="{'ltr'}"><head>\n<meta charset="utf-8"><title>{e(doc.number)}</title>\n<style>\n{PRINT_CSS}\n</style></head><body>\n<div class="toolbar"><button onclick="window.print()">{'Imprimer / Enregistrer en PDF'}</button></div>\n<main class="sheet">\n<header class="masthead"><div class="company"><div class="company-identity">{logo}<h1>{e(company_name)}</h1></div><div class="company-contact">{company_contact}</div></div><div class="invoice-title">{heading}</div></header>\n<section class="parties"><div class="bill-to"><div class="bill-label">{party_label}</div><div>{e(party_name)}</div>{party_contact}</div><div class="metadata-wrap"><table class="metadata">\n<tr><th>{'Numéro'}</th><td><bdi>{e(doc.number)}</bdi></td></tr>\n<tr><th>{'Date'}</th><td><bdi>{e(printed_date(doc.issued_at or doc.created_at))}</bdi></td></tr>\n<tr><th>{'Valable jusqu’au' if doc.kind=='quote' else 'Échéance'}</th><td><bdi>{e(printed_date(doc.due_date))}</bdi></td></tr>\n</table></div></section>\n<table class="items"><colgroup>{table_columns}</colgroup>\n<thead><tr>{table_headers}</tr></thead>\n<tbody>{''.join(lines)}</tbody>{summary}</table>\n{extra}</main></body></html>"""
