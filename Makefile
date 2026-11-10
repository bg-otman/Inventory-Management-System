.PHONY: dev prod

dev:
	node scripts/dev.cjs

prod:
	npm ci --ignore-scripts
	npm --prefix frontend ci
	python3 scripts/prepare_windows.py
	npm run build:frontend
	npm run package:windows