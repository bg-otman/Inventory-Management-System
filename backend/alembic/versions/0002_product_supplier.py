"""Link products to suppliers, add optional starting cost, and remove tax settings."""
from alembic import op
import sqlalchemy as sa

revision="0002"
down_revision="0001"
branch_labels=None
depends_on=None

def upgrade():
    # SQLite recreates the table for a foreign key; retain its v1 unnamed checks.
    retained_checks=(sa.CheckConstraint("threshold >= 0",name="ck_products_threshold"),
                     sa.CheckConstraint("price IS NULL OR price >= 0",name="ck_products_price"))
    with op.batch_alter_table("products",table_args=retained_checks) as batch:
        batch.add_column(sa.Column("supplier_id",sa.String(36),nullable=True))
        batch.add_column(sa.Column("purchase_cost",sa.Numeric(16,2),nullable=True))
        batch.create_foreign_key("fk_products_supplier","parties",["supplier_id"],["id"])
        batch.create_check_constraint("ck_products_purchase_cost","purchase_cost IS NULL OR purchase_cost >= 0")
    # Backfill only when an actual confirmed purchase identifies the supplier.
    op.execute(sa.text("""UPDATE products SET supplier_id=(
        SELECT d.party_id FROM document_lines l
        JOIN documents d ON d.id=l.document_id
        JOIN parties p ON p.id=d.party_id
        WHERE l.product_id=products.id AND d.kind='purchase'
          AND d.status='confirmed' AND p.kind='supplier'
        ORDER BY d.issued_at DESC, d.created_at DESC, d.id DESC LIMIT 1
    )"""))
    settings=sa.table("settings",sa.column("id",sa.Integer),sa.column("data",sa.JSON))
    connection=op.get_bind()
    for row in connection.execute(sa.select(settings)).mappings():
        data={k:v for k,v in row["data"].items() if k not in ("tax_id","default_tax")}
        connection.execute(settings.update().where(settings.c.id==row["id"]).values(data=data))
    # Issued invoice snapshots/totals and legacy columns are intentionally untouched.

def downgrade():
    with op.batch_alter_table("products") as batch:
        batch.drop_constraint("fk_products_supplier",type_="foreignkey")
        batch.drop_constraint("ck_products_purchase_cost",type_="check")
        batch.drop_column("purchase_cost")
        batch.drop_column("supplier_id")
