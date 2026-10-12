# syntax=docker/dockerfile:1
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/worker ./cmd/worker

# Imagem final mínima (~10 MB), sem shell, usuário não-root.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/worker /worker
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/worker"]
