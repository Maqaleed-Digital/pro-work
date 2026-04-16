FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY main.go .
RUN go mod init placeholder && go build -o placeholder .

FROM alpine:3.19
RUN addgroup -S app && adduser -S app -G app
USER app
COPY --from=builder /app/placeholder /placeholder
EXPOSE 8080
ENTRYPOINT ["/placeholder"]
