.PHONY: run test lint build
run:
	go run ./cmd/worker
test:
	go test -race -count=1 ./...
lint:
	gofmt -l . && go vet ./...
build:
	go build -o bin/worker ./cmd/worker
