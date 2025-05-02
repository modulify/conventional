TARGET_HEADER=@printf '===== \033[34m%s\033[0m\n' $@
YARN=yarn

.PHONY: .yarnrc.yml
.yarnrc.yml:  ## Generates yarn configuration
	$(TARGET_HEADER)
	cp .yarnrc.dist.yml .yarnrc.yml

.PHONY: pnp
pnp: package.json yarn.lock ## Installs dependencies
	$(TARGET_HEADER)
	$(YARN) install --silent
	@touch .pnp.loader.mjs || true

.PHONY: build
build: pnp ## Creates a dist catalogue with library build
	$(TARGET_HEADER)
	$(YARN) build

.PHONY: eslint
eslint: pnp ## Runs eslint
	$(TARGET_HEADER)
	$(YARN) lint

.PHONY: test
test: pnp ## Runs autotests
	$(TARGET_HEADER)
	$(YARN) test

.PHONY: test-coverage
test-coverage: pnp ## Runs autotests with --coverage
	$(TARGET_HEADER)
	$(YARN) test:coverage

.PHONY: help
help: ## Calls recipes list
	@cat $(MAKEFILE_LIST) | grep -e "^[a-zA-Z_\-]*: *.*## *" | awk '\
	    BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

# Colors
$(call computable,CC_BLACK,$(shell tput -Txterm setaf 0 2>/dev/null))
$(call computable,CC_RED,$(shell tput -Txterm setaf 1 2>/dev/null))
$(call computable,CC_GREEN,$(shell tput -Txterm setaf 2 2>/dev/null))
$(call computable,CC_YELLOW,$(shell tput -Txterm setaf 3 2>/dev/null))
$(call computable,CC_BLUE,$(shell tput -Txterm setaf 4 2>/dev/null))
$(call computable,CC_MAGENTA,$(shell tput -Txterm setaf 5 2>/dev/null))
$(call computable,CC_CYAN,$(shell tput -Txterm setaf 6 2>/dev/null))
$(call computable,CC_WHITE,$(shell tput -Txterm setaf 7 2>/dev/null))
$(call computable,CC_END,$(shell tput -Txterm sgr0 2>/dev/null))