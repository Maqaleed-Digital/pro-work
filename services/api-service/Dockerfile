FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod .
COPY main.go .
RUN go build -o api-service .

FROM alpine:3.19
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder /app/api-service .
USER app
EXPOSE 8080
CMD ["./api-service"]
