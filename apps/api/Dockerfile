FROM python:3.13-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -e ".[dev]"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
