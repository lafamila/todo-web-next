# Dockerfile for Development
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Start a new stage from node:20-alpine for a lightweight final image
FROM node:20-alpine

# Add curl for health checks
RUN apk --no-cache add curl

WORKDIR /usr/src/app

# Copy Next.js specific files from builder
COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/package-lock.json ./package-lock.json
COPY --from=builder /usr/src/app/next.config.mjs ./next.config.mjs

# Expose the port Next.js uses by default
EXPOSE 3030

# Start the Next.js application
CMD ["npm", "run", "start"]