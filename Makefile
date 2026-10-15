SHELL := /bin/sh

COMPOSE ?= docker compose
BACKUP_DIR ?= ./backups
export BACKUP_HOST_DIR := $(BACKUP_DIR)

.PHONY: up start down stop restart ps logs build backup test typecheck clean

up: .env backup-dir
	$(COMPOSE) up --build -d

start: up

.env:
	python3 ops/setup_env.py

backup-dir:
	mkdir -p "$(BACKUP_HOST_DIR)"

down:
	$(COMPOSE) down

down-v:
	$(COMPOSE) down --volumes --remove-orphans

stop:
	$(COMPOSE) stop

restart:
	$(COMPOSE) restart

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs --tail=100 -f

build:
	$(COMPOSE) build

backup:
	$(COMPOSE) exec backup-worker python -m app.backups backup

test:
	PYTHONPATH=. .venv/bin/pytest -q backend/tests
	npm --prefix frontend ci
	node frontend/tests/demo-workflows.cjs

typecheck:
	npm --prefix frontend run typecheck

clean:
	$(COMPOSE) down

re:
	$(MAKE) down
	$(MAKE) up
.PHONY: all up re start down stop restart ps logs build backup test typecheck clean