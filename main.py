import os
import time
import psutil
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

app = FastAPI(title="AWS Infra AI - CloudOps Assistant")

# Configuration
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION", "eu-north-1")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:1.5b")

# High timeout for CPU-based local LLM execution
HTTPX_TIMEOUT = httpx.Timeout(180.0, connect=10.0, read=180.0, write=30.0)

# Serve frontend static assets
if os.path.isdir("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def read_root():
    if os.path.exists("static/index.html"):
        with open("static/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return {"status": "RUNNING", "service": "AWS Infra AI Backend"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "region": AWS_DEFAULT_REGION}


# ==========================================
# DASHBOARD TELEMETRY & SYSTEM METRICS
# ==========================================

@app.get("/api/metrics/system")
def get_system_metrics():
    cpu_pct = psutil.cpu_percent(interval=None)
    cpu_count = psutil.cpu_count(logical=True) or 1
    
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    net_io = psutil.net_io_counters()

    # Health score algorithm
    score = int(100 - (cpu_pct * 0.4 + mem.percent * 0.4 + disk.percent * 0.2))
    score = max(min(score, 100), 10)

    return {
        "health_score": score,
        "cpu_utilization": round(cpu_pct, 1),
        "cpu_cores": cpu_count,
        "memory_percent": round(mem.percent, 1),
        "memory_used_gb": round(mem.used / (1024 ** 3), 2),
        "memory_total_gb": round(mem.total / (1024 ** 3), 2),
        "disk_percent": round(disk.percent, 1),
        "disk_used_gb": round(disk.used / (1024 ** 3), 2),
        "disk_total_gb": round(disk.total / (1024 ** 3), 2),
        "bytes_sent_kb": round(net_io.bytes_sent / 1024, 1),
        "bytes_recv_kb": round(net_io.bytes_recv / 1024, 1),
        "fleet_cpu": round(cpu_pct * 0.85 + 5.0, 1),
        "uptime": "Live",
        "region": AWS_DEFAULT_REGION,
        "healthy_count": 14,
        "warning_count": 0,
        "critical_count": 0
    }


@app.get("/api/infra/topology")
def get_infra_topology():
    return {
        "nodes": [
            {"id": "node-alb", "label": "Prod ALB", "type": "alb", "status": "healthy", "ip": "13.60.209.185"},
            {"id": "node-app-1", "label": "App Cluster EC2", "type": "ec2", "status": "healthy", "ip": "172.31.23.67"},
            {"id": "node-db", "label": "Aurora MySQL Primary", "type": "rds", "status": "healthy", "ip": "172.31.40.12"},
            {"id": "node-s3", "label": "S3 Data Lake", "type": "s3", "status": "healthy", "bucket": "aws-infra-assets-prod"}
        ],
        "edges": [
            {"from": "node-alb", "to": "node-app-1", "label": "HTTP/8000"},
            {"from": "node-app-1", "to": "node-db", "label": "MySQL/3306"},
            {"from": "node-app-1", "to": "node-s3", "label": "IAM/S3"}
        ]
    }


@app.get("/api/anomalies")
def get_anomalies():
    return {
        "detected_count": 0,
        "anomalies": [],
        "message": "All monitored thresholds are within standard parameters."
    }


@app.get("/api/incidents")
def get_incidents():
    return {
        "total_records": 0,
        "incidents": []
    }


@app.get("/api/resources/ec2")
def get_ec2_resources():
    return [
        {"instance_id": "i-09f1234a56b78c901", "name": "aws-infra-master-node", "type": "t3.micro", "state": "running", "private_ip": "172.31.23.67"},
        {"instance_id": "i-08a9876b54c32d102", "name": "aws-infra-worker-01", "type": "t3.micro", "state": "running", "private_ip": "172.31.38.194"}
    ]


# ==========================================
# OLLAMA AI SRE ASSISTANT INTEGRATION
# ==========================================

@app.get("/api/ai/health")
async def ai_health():
    start_time = time.time()
    try:
        async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name") for m in data.get("models", [])]
                latency = round((time.time() - start_time) * 1000, 2)
                return {
                    "engine": "Ollama",
                    "status": "ONLINE",
                    "configured_model": OLLAMA_MODEL,
                    "server_url": OLLAMA_BASE_URL,
                    "available_models": models,
                    "latency_ms": latency
                }
            return {"engine": "Ollama", "status": "OFFLINE", "detail": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"engine": "Ollama", "status": "OFFLINE", "error": str(e), "server_url": OLLAMA_BASE_URL}


@app.post("/api/ai/chat")
async def ai_chat(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    user_prompt = body.get("message") or body.get("prompt")
    messages = body.get("messages", [])

    if not messages:
        if user_prompt:
            messages = [
                {
                    "role": "system",
                    "content": "You are an expert AWS Site Reliability Engineer (SRE). Provide concise, technical diagnoses of infrastructure events and metrics."
                },
                {
                    "role": "user",
                    "content": str(user_prompt)
                }
            ]
        else:
            raise HTTPException(status_code=400, detail="Missing message or prompt in request body.")

    try:
        async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "num_ctx": 2048,
                        "num_predict": 512,
                        "temperature": 0.2
                    }
                }
            )

            if resp.status_code == 200:
                result = resp.json()
                reply = result.get("message", {}).get("content", "")
                return {"response": reply, "message": reply, "content": reply}
            else:
                return {"response": f"⚠️ AI Engine Notice: Ollama error (HTTP {resp.status_code}): {resp.text}"}

    except httpx.ConnectError:
        return {
            "response": f"⚠️ AI Engine Notice: Unable to reach inference server at `{OLLAMA_BASE_URL}`. Ensure Ollama is running (`ollama serve`)."
        }
    except httpx.ReadTimeout:
        return {
            "response": "⚠️ Inference timed out after 180s. The EC2 CPU is under heavy utilization; please query again in a moment."
        }
    except Exception as e:
        return {"response": f"⚠️ Error executing query: {str(e)}"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)