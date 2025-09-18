# Base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy and install dependencies
COPY ../../requirements.txt .
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Copy agent code
COPY . .

# Expose port
EXPOSE 8080

# Run FastAPI with Uvicorn
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8080"]
