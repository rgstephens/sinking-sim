IMAGE ?= registry.gstephens.org/sinking-sim
override VERSION := $(shell node -p "require('./package.json').version")
BUILD_DATE ?= 29 Sep 2026
OCI_CREATED ?= 2026-09-29T00:00:00Z

.PHONY: docker-login docker-build-all docker-verify-images docker-push-all docker-release

docker-login:
	docker login registry.gstephens.org

docker-build-all:
	docker buildx build --platform linux/amd64 \
		--build-arg VERSION=$(VERSION) --build-arg BUILD_DATE="$(BUILD_DATE)" --build-arg OCI_CREATED=$(OCI_CREATED) \
		--tag $(IMAGE):$(VERSION)-amd64 --load .
	docker buildx build --platform linux/arm64 \
		--build-arg VERSION=$(VERSION) --build-arg BUILD_DATE="$(BUILD_DATE)" --build-arg OCI_CREATED=$(OCI_CREATED) \
		--tag $(IMAGE):$(VERSION)-arm64 --load .

docker-verify-images:
	test "$$(docker image inspect $(IMAGE):$(VERSION)-amd64 --format '{{.Architecture}}')" = amd64
	test "$$(docker image inspect $(IMAGE):$(VERSION)-arm64 --format '{{.Architecture}}')" = arm64
	test "$$(docker image inspect $(IMAGE):$(VERSION)-amd64 --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" = "$(VERSION)"
	test "$$(docker image inspect $(IMAGE):$(VERSION)-arm64 --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" = "$(VERSION)"
	docker image inspect $(IMAGE):$(VERSION)-amd64 --format '{{index .Config.Labels "org.opencontainers.image.created"}}' | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$$'
	docker image inspect $(IMAGE):$(VERSION)-arm64 --format '{{index .Config.Labels "org.opencontainers.image.created"}}' | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$$'

docker-push-all: docker-build-all docker-verify-images
	docker push $(IMAGE):$(VERSION)-amd64
	docker push $(IMAGE):$(VERSION)-arm64
	docker buildx imagetools create --tag $(IMAGE):$(VERSION) \
		$(IMAGE):$(VERSION)-amd64 $(IMAGE):$(VERSION)-arm64
	docker buildx imagetools inspect $(IMAGE):$(VERSION) --raw | node scripts/verify-manifest.mjs

docker-release: docker-login docker-push-all
