FROM python:3.12-slim

WORKDIR /app

# Install MySQL client libraries required by mysqlclient
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    pkg-config \
    default-libmysqlclient-dev \
    gosu \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Fix Windows CRLF line endings on the entrypoint script
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

# Non-root user (Finding #1 — containers must not run as root)
RUN groupadd -r django && useradd -r -g django -d /app django
RUN chown -R django:django /app

EXPOSE 8000

# Entrypoint runs as root, fixes volume-mount ownership, then drops to django via gosu
ENTRYPOINT ["./entrypoint.sh"]
