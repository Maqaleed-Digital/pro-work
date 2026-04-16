FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod .
COPY main.go .
RUN go build -o agent-orchestrator .

FROM alpine:3.19
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder /app/agent-orchestrator .
USER app
EXPOSE 8080
CMD ["./agent-orchestrator"]
