import io
from decimal import Decimal
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from app.models.sale import Sale
from app.models.settings import CompanySettings

def generate_invoice_pdf(sale: Sale, company: CompanySettings) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm
    )

    is_arabic = (sale.language == "ar")
    styles = getSampleStyleSheet()

    # Custom typography styles
    title_style = ParagraphStyle(
        'InvoiceTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#1E293B')
    )

    normal_style = ParagraphStyle(
        'InvoiceNormal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#334155')
    )

    bold_style = ParagraphStyle(
        'InvoiceBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#0F172A')
    )

    story = []

    # Header section: Company Info and Invoice Meta
    comp_name = company.company_name_ar if is_arabic and company.company_name_ar else company.company_name
    inv_title = "فاتورة / INVOICE" if is_arabic else "INVOICE"
    
    header_data = [
        [
            Paragraph(f"<b>{comp_name}</b><br/>{company.address or ''}<br/>ICE: {company.ice_number or '-'}<br/>Tél: {company.phone or '-'}", normal_style),
            Paragraph(f"<font color='#0284C7'><b>{inv_title}</b></font><br/><b>N°:</b> {sale.invoice_number}<br/><b>Date:</b> {sale.issue_date.strftime('%Y-%m-%d')}<br/><b>Statut:</b> {sale.payment_status.upper()}", normal_style)
        ]
    ]

    header_table = Table(header_data, colWidths=[100 * mm, 80 * mm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 15))

    # Bill To section
    client_label = "عميل / Client:" if is_arabic else "Bill To / Client:"
    due_label = "Date d'échéance:" if not is_arabic else "تاريخ الاستحقاق:"
    due_str = sale.due_date.strftime('%Y-%m-%d') if sale.due_date else "-"
    
    client_info = f"<b>{client_label}</b> {sale.customer_name_snapshot}"
    if sale.due_date:
        client_info += f"<br/><b>{due_label}</b> {due_str}"

    story.append(Paragraph(client_info, normal_style))
    story.append(Spacer(1, 15))

    # Line Items Table
    headers = ["Article / Item", "Qté / Qty", "Unité / Unit", "P.U (MAD)", "Total (MAD)"]
    if is_arabic:
        headers = ["المنتج / Item", "الكمية / Qty", "الوحدة / Unit", "السعر / P.U", "المجموع / Total"]

    items_data = [headers]
    for line in sale.lines:
        items_data.append([
            line.product_name_snapshot,
            f"{line.quantity:.2f}",
            line.unit_snapshot,
            f"{line.unit_price:.2f}",
            f"{line.line_total:.2f}"
        ])

    items_table = Table(items_data, colWidths=[70 * mm, 25 * mm, 25 * mm, 30 * mm, 30 * mm])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 15))

    # Summary Totals Section
    subtotal_lbl = "Sous-total H.T:" if not is_arabic else "المجموع دون ضريبة:"
    discount_lbl = "Remise / Discount:" if not is_arabic else "خصم:"
    vat_lbl = f"TVA ({sale.tax_rate:.1f}%):" if not is_arabic else f"الضريبة ({sale.tax_rate:.1f}%):"
    total_lbl = "TOTAL T.T.C (MAD):" if not is_arabic else "المجموع الإجمالي (درهم):"
    paid_lbl = "Montant Payé / Paid:" if not is_arabic else "المبلغ المدفوع:"
    rem_lbl = "Reste à Payer / Balance:" if not is_arabic else "المبلغ المتبقي:"

    summary_data = [
        [subtotal_lbl, f"{sale.subtotal:.2f} MAD"],
        [discount_lbl, f"-{sale.discount:.2f} MAD"],
        [vat_lbl, f"{sale.tax_amount:.2f} MAD"],
        [total_lbl, f"{sale.total_amount:.2f} MAD"],
        [paid_lbl, f"{sale.paid_amount:.2f} MAD"],
        [rem_lbl, f"{sale.remaining_amount:.2f} MAD"]
    ]

    summary_table = Table(summary_data, colWidths=[120 * mm, 60 * mm])
    summary_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, 3), (-1, 3), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 3), (-1, 3), 11),
        ('TEXTCOLOR', (0, 3), (-1, 3), colors.HexColor('#0284C7')),
        ('BACKGROUND', (0, 3), (-1, 3), colors.HexColor('#F0F9FF')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(summary_table)

    if sale.notes:
        story.append(Spacer(1, 15))
        story.append(Paragraph(f"<b>Notes:</b> {sale.notes}", normal_style))

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
