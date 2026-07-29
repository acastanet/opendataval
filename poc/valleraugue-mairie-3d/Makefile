PYTHON ?= .venv/Scripts/python.exe
CONFIG ?= config/poc-200m.conf

.PHONY: check test validate terrain ortho glb web enhance all serve

check:
	$(PYTHON) poc.py --config $(CONFIG) check

test:
	$(PYTHON) -m unittest discover -s test -v

validate:
	$(PYTHON) poc.py --config $(CONFIG) validate

terrain:
	$(PYTHON) poc.py --config $(CONFIG) terrain

ortho:
	$(PYTHON) poc.py --config $(CONFIG) ortho

glb:
	$(PYTHON) poc.py --config $(CONFIG) glb

web:
	$(PYTHON) poc.py --config $(CONFIG) web

enhance:
	$(PYTHON) poc.py --config $(CONFIG) enhance

all:
	$(PYTHON) poc.py --config $(CONFIG) all

serve:
	$(PYTHON) poc.py --config $(CONFIG) serve
