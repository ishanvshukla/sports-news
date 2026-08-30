# Stage 1: build the frontend
FROM node:20-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig*.json tailwind.config.js postcss.config.js ./
COPY public ./public
COPY src ./src
# Vite inlines VITE_* vars into the bundle at build time, not at container
# runtime, so this has to arrive as a Docker build arg (Render: service
# Settings -> Build -> Docker Build Args) rather than a regular env var —
# a plain runtime envVar here would silently ship a build with no client id.
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

# Stage 2: run the backend, serving the built frontend as static files
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
COPY --from=frontend /app/dist ./dist

EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
