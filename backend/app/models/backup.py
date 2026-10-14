from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, BigInteger, DateTime
from app.database import Base

class BackupRecord(Base):
    __tablename__ = "backup_records"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    filepath = Column(String(500), nullable=False)
    size_bytes = Column(BigInteger, nullable=False, default=0)
    status = Column(String(30), nullable=False)  # success, failed
    backup_type = Column(String(30), nullable=False)  # scheduled, manual, pre_restore
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
