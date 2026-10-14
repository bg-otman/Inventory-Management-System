from app.routers.auth import router as auth_router
from app.routers.users import router as users_router
from app.routers.categories import router as categories_router
from app.routers.products import router as products_router
from app.routers.warehouses import router as warehouses_router
from app.routers.stock import router as stock_router
from app.routers.customers import router as customers_router
from app.routers.suppliers import router as suppliers_router
from app.routers.sales import router as sales_router
from app.routers.purchases import router as purchases_router
from app.routers.payments import router as payments_router
from app.routers.dashboard import router as dashboard_router
from app.routers.settings import router as settings_router
from app.routers.backups import router as backups_router

__all__ = [
    "auth_router",
    "users_router",
    "categories_router",
    "products_router",
    "warehouses_router",
    "stock_router",
    "customers_router",
    "suppliers_router",
    "sales_router",
    "purchases_router",
    "payments_router",
    "dashboard_router",
    "settings_router",
    "backups_router",
]
