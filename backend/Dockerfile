FROM postgres:18
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1
COPY requirements.lock.txt .
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY . .
CMD ["sh","-c","alembic upgrade head && python -m app.bootstrap && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
