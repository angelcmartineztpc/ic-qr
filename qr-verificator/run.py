"""Arranque del dashboard: `bun`-agnóstico, solo Python. Uso: python run.py"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run("qrauditor.server:app", host="127.0.0.1", port=8000)
