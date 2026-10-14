all:
	@docker compose up --build -d

up: all

down:
	@docker compose down --remove-orphans

down-v:
	@docker compose down --volumes --remove-orphans

re: down all

.PHONY: all down down-v re up