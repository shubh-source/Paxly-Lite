FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Force fresh layer build - Cache Bust
# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create media directory if it doesn't exist
RUN mkdir -p media

# Expose the API port
EXPOSE 8000

# Run the application with Gunicorn using Uvicorn workers for production
# Increased timeout to 120s to allow for database initialization (metadata.create_all)
CMD ["gunicorn", "-w", "2", "-k", "uvicorn.workers.UvicornWorker", "app.main:app", "--bind", "0.0.0.0:8000", "--timeout", "120"]
