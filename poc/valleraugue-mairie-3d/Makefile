SHELL := /usr/bin/env bash

.PHONY: check run run-clean validate clean

check:
	@command -v docker >/dev/null
	@command -v git >/dev/null
	@command -v python3 >/dev/null
	@docker info >/dev/null
	@python3 -m json.tool config/area.geojson >/dev/null
	@bash -n run-poc.sh validate.sh
	@echo "Pré-requis et configuration valides."

run: check
	bash run-poc.sh

run-clean: check
	CLEAN=1 bash run-poc.sh

validate:
	bash validate.sh

clean:
	rm -rf output .work
