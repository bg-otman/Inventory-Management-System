from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine
from app.models import Base
from app.routers import (
    auth_router,
    users_router,
    categories_router,
    products_router,
    warehouses_router,
    stock_router,
    customers_router,
    suppliers_router,
    sales_router,
    purchases_router,
    payments_router,
    dashboard_router,
    settings_router,
    backups_router
)
from app.services.backup_service import start_scheduler, stop_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables exist
    Base.metadata.create_all(bind=engine)
    # Start backup scheduler
    start_scheduler()
    yield
    # Shutdown: stop backup scheduler
    stop_scheduler()

app = FastAPI(
    title="Mizan API",
    description="Stock, Invoices, and Balances Management API for Moroccan Businesses",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost",
        "http://127.0.0.1",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all API routers under /api/v1
api_v1_prefix = "/api/v1"
app.include_router(auth_router, prefix=api_v1_prefix)
app.include_router(users_router, prefix=api_v1_prefix)
app.include_router(categories_router, prefix=api_v1_prefix)
app.include_router(products_router, prefix=api_v1_prefix)
app.include_router(warehouses_router, prefix=api_v1_prefix)
app.include_router(stock_router, prefix=api_v1_prefix)
app.include_router(customers_router, prefix=api_v1_prefix)
app.include_router(suppliers_router, prefix=api_v1_prefix)
app.include_router(sales_router, prefix=api_v1_prefix)
app.include_router(purchases_router, prefix=api_v1_prefix)
app.include_router(payments_router, prefix=api_v1_prefix)
app.include_router(dashboard_router, prefix=api_v1_prefix)
app.include_router(settings_router, prefix=api_v1_prefix)
app.include_router(backups_router, prefix=api_v1_prefix)

@app.get("/api/v1/health")
def health_check():
    return {
        "status": "healthy",
        "app": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT
    }
