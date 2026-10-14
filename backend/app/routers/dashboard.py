from datetime import datetime, date, time
from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func
from app.database import get_db
from app.models.sale import Sale
from app.models.purchase import Purchase
from app.models.inventory import StockBalance, Warehouse
from app.models.catalog import Product
from app.models.audit import ActivityLog
from app.models.user import User
from app.schemas.dashboard import DashboardStatsResponse, ActivityItem
from app.schemas.inventory import LowStockAlertResponse
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    today_start = datetime.combine(date.today(), time.min)
    today_end = datetime.combine(date.today(), time.max)

    # 1. Sales today
    sales_today_query = db.query(
        func.coalesce(func.sum(Sale.total_amount), 0.00),
        func.count(Sale.id)
    ).filter(
        Sale.issue_date >= today_start,
        Sale.issue_date <= today_end
    ).first()
    sales_today_amount = Decimal(str(sales_today_query[0]))
    sales_today_count = int(sales_today_query[1])

    # 2. Customers owe us (total outstanding receivables on invoices)
    customers_owe_us = db.query(
        func.coalesce(func.sum(Sale.remaining_amount), 0.00)
    ).filter(
        Sale.customer_id.isnot(None),
        Sale.payment_status.in_(["unpaid", "partially_paid"])
    ).scalar()
    customers_owe_us = Decimal(str(customers_owe_us))

    # 3. We owe suppliers (total outstanding payables on recorded supplier invoices)
    we_owe_suppliers = db.query(
        func.coalesce(func.sum(Purchase.remaining_amount), 0.00)
    ).filter(
        Purchase.invoice_status == "recorded",
        Purchase.payment_status.in_(["unpaid", "partially_paid"])
    ).scalar()
    we_owe_suppliers = Decimal(str(we_owe_suppliers))

    # 4. Low stock alerts
    alert_rows = db.query(
        StockBalance, Product, Warehouse
    ).join(
        Product, StockBalance.product_id == Product.id
    ).join(
        Warehouse, StockBalance.warehouse_id == Warehouse.id
    ).filter(
        Product.is_active == True,
        Warehouse.is_active == True,
        StockBalance.quantity <= Product.low_stock_threshold
    ).order_by(StockBalance.quantity.asc()).limit(20).all()

    low_stock_alerts = [
        LowStockAlertResponse(
            product_id=prod.id,
            product_name=prod.name,
            warehouse_id=wh.id,
            warehouse_name=wh.name,
            current_stock=bal.quantity,
            threshold=prod.low_stock_threshold,
            unit=prod.unit
        )
        for bal, prod, wh in alert_rows
    ]

    # 5. Recent activity stream
    recent_logs = db.query(ActivityLog).outerjoin(User, ActivityLog.user_id == User.id).order_by(
        ActivityLog.created_at.desc()
    ).limit(15).all()

    recent_activities = [
        ActivityItem(
            id=log.id,
            user_name=log.user.full_name if log.user else "System",
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=log.details,
            created_at=log.created_at
        )
        for log in recent_logs
    ]

    return DashboardStatsResponse(
        sales_today_amount=sales_today_amount,
        sales_today_count=sales_today_count,
        customers_owe_us=customers_owe_us,
        we_owe_suppliers=we_owe_suppliers,
        low_stock_count=len(low_stock_alerts),
        low_stock_alerts=low_stock_alerts,
        recent_activities=recent_activities
    )
