# Multi-stage build for dotrc-server

# Stage 1: Build
FROM rust:1.94-bookworm AS builder
WORKDIR /app

# Copy workspace files
COPY Cargo.toml Cargo.toml
COPY crates/ crates/

# Build release binary
RUN cargo build --release -p dotrc-server

# Stage 2: Runtime
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/dotrc-server /usr/local/bin/dotrc-server
COPY crates/dotrc-server/migrations/ /app/migrations/

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["dotrc-server"]
