"""Numbered account-operation receipts; they never create sales or stock."""

from datetime import date
from decimal import Decimal
from html import escape
import re
from .invoice import PRINT_CSS, print_amount


def render(receipt, company_logo=None, reversed=False):
    s = receipt.snapshot
    ar = False

    def tr(fr, arabic):
        return fr

    def e(value):
        return escape(str(value if value is not None else ""), quote=True)

    def amount(value):
        return print_amount(value, ar)

    def day(value):
        try:
            return date.fromisoformat(str(value)[:10]).strftime("%d/%m/%Y")
        except ValueError:
            return "—"

    currency = "MAD"

    def cash(value):
        return f"<bdi>{amount(value)}</bdi> {currency}"

    def balance(value):
        if value is None:
            return "—"
        n = Decimal(value)
        label = "À recevoir" if n > 0 else "À payer" if n < 0 else "Compte soldé"
        return f"{label}: {cash(abs(n))}"

    company = s.get("company", {})
    party = s.get("party") or {}
    company_name = company.get("company_name")
    logo_value = company_logo if company_logo is not None else company.get("logo", "")
    logo = ""
    if logo_value and re.fullmatch("data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+", logo_value):
        logo = f"""<span class="logo-cell"><img class="company-logo" src="{e(logo_value)}" alt="{'Logo de l’entreprise'}"></span>"""
    titles = {
        "payment": "REÇU DE PAIEMENT",
        "allocation": "AFFECTATION D’AVANCE",
        "reversal": "ANNULATION DE PAIEMENT",
    }
    heading = titles[receipt.action]
    method = {
        "cash": "Espèces",
        "transfer": "Virement bancaire",
        "cheque": "Chèque",
        "other": "Autre",
    }.get(s["method"], s["method"])
    incoming = s["direction"] == "received"
    direction = "Montant reçu de ce compte" if incoming else "Montant versé à ce compte"
    if receipt.action == "allocation":
        direction = "Avance existante affectée ; aucun nouvel échange d’argent"
    if receipt.action == "reversal":
        direction = "Paiement précédent annulé ; aucun nouvel échange d’argent"
    details = [("Opération", direction), ("Mode de paiement", e(method))]
    if receipt.action == "payment" and Decimal(s.get("credit_offset", "0")) > 0:
        details.append(("Avance réglée / crédit restitué", cash(s["credit_offset"])))
    if receipt.action != "reversal" and Decimal(s.get("available", "0")) > 0:
        details.append(("Montant non affecté après l’opération", cash(s["available"])))
    if s.get("notes"):
        details.append(("Notes / motif", e(s["notes"])))
    detail_rows = "".join(
        (f'<tr class="item"><td>{label}</td><td>{value}</td></tr>' for label, value in details)
    )
    invoice_rows = "".join(
        (
            f"""<tr class="item"><td><bdi>{e(i['number'])}</bdi></td><td class="number">{cash(i['change'])}</td><td class="number">{cash(i['remaining'])}</td></tr>"""
            for i in s["invoices"]
        )
    )
    allocation = ""
    if invoice_rows:
        allocation = f"""<h2>{'Factures liées'}</h2><table class="items"><thead><tr><th>{'Facture'}</th><th>{'Variation du montant payé'}</th><th>{'Reste à payer après l’opération'}</th></tr></thead><tbody>{invoice_rows}</tbody></table>"""
    elif receipt.action == "payment":
        allocation = f"""<p class="note">{'Opération enregistrée sur ce compte. Toute avance ou tout crédit restitué est inclus dans le solde ci-dessous.'}</p>"""

    def contacts(obj):
        address = f"<div>{e(obj.get('address'))}</div>" if obj.get("address") else ""
        phone = (
            f"""<div><bdi dir="ltr">{e(obj.get('phone'))}</bdi></div>""" if obj.get("phone") else ""
        )
        return address + phone

    warning = (
        f"""<p class="reversal-note">{'Ce paiement a été annulé. Les détails de l’opération d’origine sont conservés ci-dessous.'}</p>"""
        if reversed and receipt.action != "reversal"
        else ""
    )
    balances = ""
    if s.get("balance_before") is not None:
        balances = f"""<section class="balance-block"><p><strong>{'Solde avant l’opération'}</strong><span>{balance(s['balance_before'])}</span></p><p><strong>{'Solde après l’opération'}</strong><span>{balance(s['balance_after'])}</span></p></section>"""
    return f"""<!doctype html><html lang="{'fr'}" dir="{'ltr'}"><head><meta charset="utf-8"><title>{e(receipt.number)}</title>\n<style>{PRINT_CSS}\n.masthead{{margin-bottom:16mm}}.parties{{margin-bottom:10mm}}h2{{font-size:11pt;margin:9mm 0 3mm}}.details td:first-child{{width:34%;font-weight:700}}.details td{{white-space:pre-line}}.note{{color:#444;margin:6mm 0}}.balance-block{{margin-top:8mm;break-inside:avoid;border-top:1px solid #999;padding-top:3mm}}.balance-block p{{display:table;width:100%;margin:3mm 0}}.balance-block strong,.balance-block span{{display:table-cell;width:50%}}.balance-block span{{text-align:end}}.reversal-note{{border:1px solid #999;padding:3mm}}.receipt-footer{{font-size:9pt;color:#555;margin-top:8mm}}\n</style></head><body><div class="toolbar"><button onclick="window.print()">{'Imprimer / Enregistrer en PDF'}</button></div><main class="sheet">\n<header class="masthead"><div class="company"><div class="company-identity">{logo}<h1>{e(company_name)}</h1></div><div class="company-contact">{contacts(company)}</div></div><div class="invoice-title">{heading}</div></header>\n<section class="parties"><div class="bill-to"><div class="bill-label">{'Compte'}</div><div>{e(party.get('name') or 'Client de passage')}</div>{contacts(party)}</div><div class="metadata-wrap"><table class="metadata"><tr><th>{'N° de reçu'}</th><td><bdi>{e(receipt.number)}</bdi></td></tr><tr><th>{'Date du paiement'}</th><td><bdi>{day(s['paid_at'])}</bdi></td></tr><tr><th>{'Enregistré le'}</th><td><bdi>{day(receipt.created_at)}</bdi></td></tr></table></div></section>\n{warning}<table class="items details"><tbody>{detail_rows}</tbody><tbody class="summary"><tr class="total"><td>{'MONTANT'}</td><td class="total-amount">{cash(s['amount'])}</td></tr></tbody></table>{allocation}{balances}\n<p class="receipt-footer">{'Reçu d’opération de compte. Les soldes sont enregistrés au moment de cette opération. Ce reçu ne crée aucune nouvelle vente ni aucun nouvel achat.'}</p></main></body></html>"""
