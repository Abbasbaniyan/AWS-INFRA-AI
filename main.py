import os
import time
import json
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="AWS Infrastructure Assistant")

# Configuration via environment variables
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION", "eu-north-1")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:1.5b")

# Generous timeouts for CPU-based inference on EC2 instances
HTTPX_TIMEOUT = httpx.Timeout(180.0, connect=10.0, read=180.0, write=30.0)

# Serve static frontend files if directory exists
if os.path.isdir("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    prompt: Optional[str] = None


@app.get("/")
def read_root():
    if os.path.exists("static/index.html"):
        with open("static/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return {
        "service": "AWS Infra AI Assistant",
        "status": "RUNNING",
        "model": OLLAMA_MODEL
    }


@app.get("/health")
def health_check():
    return {"status": "healthy", "region": AWS_DEFAULT_REGION}


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
            return {
                "engine": "Ollama",
                "status": "OFFLINE",
                "detail": f"Ollama HTTP {resp.status_code}"
            }
    except Exception as e:
        return {
            "engine": "Ollama",
            "status": "OFFLINE",
            "error": str(e),
            "server_url": OLLAMA_BASE_URL
        }


@app.post("/api/ai/chat")
async def ai_chat(payload: Request):
    # Parse incoming payload flexibly
    body = await payload.json()
    user_prompt = body.get("message") or body.get("prompt")
    messages = body.get("messages", [])

    if not messages:
        if user_prompt:
            messages = [
                {
                    "role": "system",
                    "content": "You are an expert AWS Site Reliability Engineer (SRE) Assistant. "
                               "Provide direct, concise, and structured diagnostic insights."
                },
                {
                    "role": "user",
                    "content": user_prompt
                }
            ]
        else:
            raise HTTPException(status_code=400, detail="Missing 'message' or 'messages' payload.")

    try:
        async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
            ollama_payload = {
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
                "keep_alive": "10m",
                "options": {
                    "num_ctx": 2048,
                    "num_predict": 512,
                    "temperature": 0.2
                }
            }

            resp = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=ollama_payload)

            if resp.status_code == 200:
                result = resp.json()
                content = result.get("message", {}).get("content", "")
                return {"response": content, "message": content, "content": content}
            else:
                return {
                    "response": f"⚠️ AI Engine Notice: Ollama returned status {resp.status_code} - {resp.text}"
                }

    except httpx.ConnectError:
        return {
            "response": f"⚠️ AI Engine Notice: Unable to reach the local inference server at `{OLLAMA_BASE_URL}` running `{OLLAMA_MODEL}`. Please ensure Ollama is running (`ollama serve`) and the model is pulled (`ollama pull {OLLAMA_MODEL}`)."
        }
    except httpx.ReadTimeout:
        return {
            "response": "⚠️ Inference timed out after 180s. The CPU is under high load; please try a shorter query or keep the model pre-warmed."
        }
    except Exception as e:
        return {"response": f"⚠️ Inference Error: {str(e)}"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)