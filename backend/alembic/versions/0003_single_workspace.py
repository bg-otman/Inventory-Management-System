"""Remove application accounts and sessions for the single-workspace deployment."""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table("operations", recreate="always") as batch:
        batch.drop_column("user_id")
        batch.create_unique_constraint("uq_operations_key", ["key"])
    op.drop_table("sessions")
    op.drop_table("users")

def downgrade():
    with op.batch_alter_table("operations") as batch:
        batch.drop_constraint("uq_operations_key", type_="unique")
        batch.add_column(sa.Column("user_id", sa.String(36), nullable=True))
        batch.create_unique_constraint("user_id", ["user_id", "key"])
    op.create_table("users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("username", sa.String(100), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False))
    op.create_table("sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("csrf_hash", sa.String(64), nullable=False),
        sa.Column("expires", sa.DateTime(), nullable=False))