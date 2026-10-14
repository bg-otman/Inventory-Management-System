from pydantic import BaseModel
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
from app.schemas.inventory import LowStockAlertResponse

class ActivityItem(BaseModel):
    id: int
    user_name: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    details: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class DashboardStatsResponse(BaseModel):
    sales_today_amount: Decimal = Decimal("0.00")
    sales_today_count: int = 0
    customers_owe_us: Decimal = Decimal("0.00")      # Total unpaid receivables
    we_owe_suppliers: Decimal = Decimal("0.00")      # Total unpaid payables
    low_stock_count: int = 0
    low_stock_alerts: List[LowStockAlertResponse] = []
    recent_activities: List[ActivityItem] = []
