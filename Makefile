COMPOSE = docker compose --env-file .env

all: up

env:
	@if [ ! -f .env ]; then python3 ops/setup_env.py; fi

up: env
	@$(COMPOSE) up --build -d

down:
	@$(COMPOSE) down --remove-orphans

down-v:
	@$(COMPOSE) down --volumes --remove-orphans

re: down up

logs:
	@$(COMPOSE) logs --tail=100 -f

ps:
	@$(COMPOSE) ps

.PHONY: all env up down down-v re logs ps