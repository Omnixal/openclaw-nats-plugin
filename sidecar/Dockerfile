FROM docker.io/oven/bun:latest AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .

FROM docker.io/oven/bun:latest
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3104
CMD ["bun", "run", "src/index.ts"]
