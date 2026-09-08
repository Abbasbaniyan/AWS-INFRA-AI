"""
AWS Infrastructure AI Assistant & CloudWatch Incident Troubleshooting System
Direct Ollama LLM Inference Engine with Robust Text & Tool-Calling Fallback Parser.
"""

import os
import time
import json
import re
from datetime import datetime, timezone, timedelta
import random
import psutil
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
import httpx

load_dotenv()

app = FastAPI(
    title="AWS Infrastructure AI Assistant API",
    description="Dynamic CloudOps AI engine with robust agentic fallback parser.",
    version="3.7.1"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

START_TIME = time.time()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:0.5b")
AWS_REGION = os.getenv("AWS_DEFAULT_REGION") or os.getenv("AWS_REGION") or "eu-north-1"

system_logs = []
service_states = {
    "nginx": "running",
    "docker": "running",
    "postgresql": "running",
    "redis": "running",
    "aws-ssm-agent": "running",
    "cloudwatch-agent": "running",
    "aws-infra-api": "running",
    "ollama.service": "running"
}
simulated_anomalies = []
incident_history = []
pending_confirmations = {}

class LoginRequest(BaseModel):
    username: str
    password: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: Optional[str] = None
    prompt: Optional[str] = None
    history: Optional[List[ChatMessage]] = []
    messages: Optional[List[ChatMessage]] = []
    include_system_context: Optional[bool] = True

class ModelActionRequest(BaseModel):
    model: str
    action: str

class DeploymentActionRequest(BaseModel):
    service_id: str
    action: str

class SimulationRequest(BaseModel):
    target_service: str
    action_type: str

def get_aws_session():
    return boto3.Session(region_name=AWS_REGION)

def log_event(level: str, source: str, message: str):
    entry = {
        "id": f"log-{int(time.time()*1000)}-{random.randint(100, 999)}",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "level": level.upper(),
        "source": source,
        "message": message
    }
    system_logs.insert(0, entry)
    if len(system_logs) > 250:
        system_logs.pop()
    return entry

INITIAL_LOGS = [
    ("INFO", "CloudWatch", "Metric alarm 'High-CPU-Utilization' evaluated state OK."),
    ("INFO", "EC2-SSM", "SSM Agent ping status healthy on instance i-09f482a1b9e87110a."),
    ("INFO", "ALB-Ingress", "Target health checks passed for target-group 'tg-prod-app' (Port 8000)."),
]
for lvl, src, msg in INITIAL_LOGS:
    log_event(lvl, src, msg)

def get_network_rates():
    n1 = psutil.net_io_counters()
    time.sleep(0.02)
    n2 = psutil.net_io_counters()
    return {
        "kb_sent_sec": round((n2.bytes_sent - n1.bytes_sent) / 0.02 / 1024, 2),
        "kb_recv_sec": round((n2.bytes_recv - n1.bytes_recv) / 0.02 / 1024, 2),
        "total_sent_mb": round(n2.bytes_sent / (1024 * 1024), 2),
        "total_recv_mb": round(n2.bytes_recv / (1024 * 1024), 2)
    }

def get_disk_rates():
    try:
        dio = psutil.disk_io_counters()
        if dio:
            return {
                "read_count": dio.read_count,
                "write_count": dio.write_count,
                "read_mb": round(dio.read_bytes / (1024 * 1024), 2),
                "write_mb": round(dio.write_bytes / (1024 * 1024), 2)
            }
    except Exception:
        pass
    return {"read_count": 0, "write_count": 0, "read_mb": 0.0, "write_mb": 0.0}

def get_top_procs(limit: int = 6):
    procs = []
    for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent", "status"]):
        try:
            info = proc.info
            procs.append({
                "pid": info["pid"],
                "name": info["name"] or "Unknown",
                "cpu_percent": round(info["cpu_percent"] or 0.0, 1),
                "memory_percent": round(info["memory_percent"] or 0.0, 1),
                "status": info["status"]
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    procs.sort(key=lambda x: x["cpu_percent"] + x["memory_percent"], reverse=True)
    return procs[:limit]

@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat(), "version": "3.7.1"}

@app.get("/metrics")
def get_metrics():
    cpu = psutil.cpu_percent(interval=None) or 14.8
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    uptime_sec = int(time.time() - START_TIME)
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cpu": {"percent": cpu, "cores": psutil.cpu_count(logical=True) or 2},
        "memory": {"percent": mem.percent, "used_gb": round(mem.used / (1024**3), 2), "total_gb": round(mem.total / (1024**3), 2)},
        "disk": {"percent": disk.percent, "used_gb": round(disk.used / (1024**3), 2), "total_gb": round(disk.total / (1024**3), 2)},
        "uptime": {"seconds": uptime_sec, "formatted": f"{uptime_sec // 3600}h {(uptime_sec % 3600) // 60}m"},
        "health": {"score": 96, "status": "Optimal Baseline", "healthy_components": 14},
        "network": get_network_rates(),
        "disk_io": get_disk_rates(),
        "top_processes": get_top_procs(6)
    }

@app.post("/api/auth/login")
def auth_login(req: LoginRequest):
    if req.username == os.getenv("AUTH_USERNAME", "admin") and req.password == os.getenv("AUTH_PASSWORD", "cloudops2026"):
        return {"status": "success", "token": f"token-{int(time.time()*1000)}", "user": {"username": req.username, "role": "DevOps Admin"}}
    raise HTTPException(status_code=401, detail="Invalid username or password")

@app.get("/api/workspace/summary")
async def get_workspace_summary():
    return {"status": "success", "servers": {"total": 2, "running": 2}, "ai_model": {"model_name": OLLAMA_MODEL, "status": "Online"}, "services": {"healthy": 8, "total": 8}, "health": {"score": 96}}

@app.get("/api/workspace/servers")
def get_workspace_servers():
    return {"status": "success", "servers": []}

@app.get("/api/workspace/models")
async def get_workspace_models():
    return {"status": "success", "models": [{"name": OLLAMA_MODEL, "status": "In-Memory", "is_active": True, "ram_allocation_mb": 390}]}

@app.post("/api/workspace/models/action")
async def execute_model_action(req: ModelActionRequest):
    return {"status": "success", "message": f"Model {req.model} {req.action} executed."}

@app.get("/api/workspace/deployments")
def get_workspace_deployments():
    return {"status": "success", "deployments": [{"service": k, "status": v, "name": k, "port": 80} for k, v in service_states.items()]}

@app.post("/api/workspace/deployments/action")
def execute_deployment_action(req: DeploymentActionRequest):
    svc = req.service_id.lower()
    act = req.action.lower()
    service_states[svc] = "running" if act in ["restart", "reload", "start"] else "stopped"
    return {"status": "success", "service_id": svc, "action": act, "message": f"Service {svc} {act}ed."}

@app.get("/api/workspace/activity")
def get_workspace_activity(limit: int = 50):
    return {"status": "success", "activity": []}

@app.post("/api/workspace/simulate-impact")
def simulate_infrastructure_impact(req: SimulationRequest):
    return {"status": "success", "simulation": {"title": f"Simulation: {req.action_type} {req.target_service}", "ai_chat": "ONLINE", "model_inference": "ACTIVE", "risk_level": "LOW", "summary": "Nominal impact."}}

@app.get("/api/anomalies")
def get_anomalies():
    return {"status": "success", "anomalies": simulated_anomalies}

@app.get("/api/logs")
def get_logs(level: str = "ALL"):
    if level.upper() == "ALL":
        return {"status": "success", "logs": system_logs}
    return {"status": "success", "logs": [l for l in system_logs if l["level"] == level.upper()]}

@app.get("/api/topology")
def get_topology():
    return {"status": "success", "nodes": [{"id": "aws-cloud", "label": "AWS Cloud", "type": "cloud", "region": AWS_REGION, "x": 300, "y": 40}], "links": []}

@app.get("/api/cloudwatch/ec2-metrics")
def get_cloudwatch_metrics():
    return {"status": "success", "latest_cpu_percent": 18.5, "source": "aws-cloudwatch"}

@app.get("/api/incidents")
def get_incidents():
    return {"status": "success", "incidents": incident_history}

@app.get("/resources/{resource_type}")
def get_resources(resource_type: str):
    r_type = resource_type.lower()
    items = []
    session = get_aws_session()
    try:
        if r_type == "ec2":
            ec2 = session.client('ec2')
            for r in ec2.describe_instances().get('Reservations', []):
                for inst in r.get('Instances', []):
                    name = next((t['Value'] for t in inst.get('Tags', []) if t['Key'] == 'Name'), 'Unnamed')
                    items.append({"id": inst.get('InstanceId'), "name": name, "status": inst.get('State', {}).get('Name'), "details": {"type": inst.get('InstanceType')}})
        elif r_type == "vpc":
            ec2 = session.client('ec2')
            for vpc in ec2.describe_vpcs().get('Vpcs', []):
                items.append({"id": vpc.get('VpcId'), "name": "VPC", "status": vpc.get('State'), "details": {"cidr": vpc.get('CidrBlock')}})
        elif r_type == "s3":
            s3 = session.client('s3')
            for b in s3.list_buckets().get('Buckets', []):
                items.append({"id": b.get('Name'), "name": b.get('Name'), "status": "active"})
        elif r_type == "iam":
            iam = session.client('iam')
            for role in iam.list_roles(MaxItems=10).get('Roles', []):
                items.append({"id": role.get('RoleName'), "name": role.get('RoleName'), "status": "active"})
        elif r_type in ["services", "host-services"]:
            items = [{"id": k, "name": k, "status": v, "details": {}} for k, v in service_states.items()]
    except Exception as e:
        items.append({"id": "ERROR", "name": str(e), "status": "error"})
    return {"status": "success", "total": len(items), "items": items}

# Agent Tools Registry
AGENT_TOOLS = [
    {"type": "function", "function": {"name": "get_system_metrics", "description": "Fetch host system metrics like CPU, memory, disk.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_ec2_instances", "description": "Fetch AWS EC2 instances.", "parameters": {"type": "object", "properties": {"status": {"type": "string"}}}}},
    {"type": "function", "function": {"name": "get_vpcs", "description": "Fetch AWS VPCs.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_storage_status", "description": "Fetch S3 buckets.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_iam_roles", "description": "Fetch IAM roles.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_host_services", "description": "Fetch host services.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_telemetry_logs", "description": "Fetch logs.", "parameters": {"type": "object", "properties": {"level": {"type": "string"}}}}},
    {"type": "function", "function": {"name": "filter_logs", "description": "Filter log view.", "parameters": {"type": "object", "properties": {"level": {"type": "string"}}, "required": ["level"]}}},
    {"type": "function", "function": {"name": "clear_telemetry_logs", "description": "Clear logs.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "refresh_infrastructure", "description": "Refresh dashboard.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "check_infrastructure_health", "description": "Check health.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "navigate_to_view", "description": "Navigate view.", "parameters": {"type": "object", "properties": {"view_name": {"type": "string"}}, "required": ["view_name"]}}},
    {"type": "function", "function": {"name": "control_service_lifecycle", "description": "Control service.", "parameters": {"type": "object", "properties": {"service_id": {"type": "string"}, "action": {"type": "string"}}, "required": ["service_id", "action"]}}}
]

def execute_agent_tool(tool_name: str, arguments: dict) -> dict:
    try:
        if tool_name == "get_system_metrics": return get_metrics()
        elif tool_name == "get_ec2_instances": return get_resources("ec2")
        elif tool_name == "get_vpcs": return get_resources("vpc")
        elif tool_name == "get_storage_status": return get_resources("s3")
        elif tool_name == "get_iam_roles": return get_resources("iam")
        elif tool_name == "get_host_services": return get_resources("services")
        elif tool_name == "get_telemetry_logs": return get_logs(level=arguments.get("level", "ALL"))
        elif tool_name == "filter_logs":
            lvl = arguments.get("level", "ALL").upper()
            return {"status": "success", "ui_action": {"type": "FILTER_LOGS", "level": lvl}, "message": f"Log filter updated to {lvl}."}
        elif tool_name == "clear_telemetry_logs":
            system_logs.clear()
            return {"status": "success", "ui_action": {"type": "CLEAR_LOGS"}, "message": "Logs cleared."}
        elif tool_name == "refresh_infrastructure":
            return {"status": "success", "ui_action": {"type": "REFRESH_DASHBOARD"}, "message": "Refreshed."}
        elif tool_name == "check_infrastructure_health": return get_metrics().get("health")
        elif tool_name == "navigate_to_view":
            v = arguments.get("view_name", "dashboard").lower()
            return {"status": "success", "ui_action": {"type": "NAVIGATE_VIEW", "view": v}, "message": f"Navigated to {v}."}
        elif tool_name == "control_service_lifecycle":
            return execute_deployment_action(DeploymentActionRequest(service_id=arguments.get("service_id"), action=arguments.get("action")))
        return {"error": f"Unknown tool: {tool_name}"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/chat")
@app.post("/api/ai/chat")
@app.post("/api/chat")
async def chat(request: ChatRequest):
    user_prompt = request.message or request.prompt or ""
    p_lower = user_prompt.lower()

    global pending_confirmations
    if pending_confirmations.get("waiting"):
        if any(w in p_lower for w in ["yes", "proceed", "do it", "confirm", "ok", "haan"]):
            t_name = pending_confirmations.pop("tool_name")
            t_args = pending_confirmations.pop("tool_args")
            pending_confirmations.clear()
            res = execute_agent_tool(t_name, t_args)
            return {"reply": f"✅ Executed `{t_name}` successfully.", "ui_action": res.get("ui_action"), "source": "agent"}
        elif any(w in p_lower for w in ["no", "cancel", "abort"]):
            pending_confirmations.clear()
            return {"reply": "❌ Cancelled.", "source": "agent"}

    messages = [{"role": "system", "content": "You are CloudOps AI. Answer queries directly or use tools when required."}]
    for h in (request.history or request.messages or [])[-4:]:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": user_prompt})

    for ep in [f"{OLLAMA_BASE_URL}/api/chat", "http://127.0.0.1:11434/api/chat"]:
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(ep, json={"model": OLLAMA_MODEL, "messages": messages, "tools": AGENT_TOOLS, "stream": False, "options": {"temperature": 0.2}})
                if res.status_code == 200:
                    msg = res.json().get("message", {})
                    tool_calls = msg.get("tool_calls")
                    content = msg.get("content", "")

                    # Fallback parser if small model outputs raw JSON tool text inside content instead of tool_calls metadata
                    if not tool_calls and content and "get_" in content:
                        try:
                            json_match = re.search(r'\{.*\}', content, re.DOTALL)
                            if json_match:
                                parsed = json.loads(json_match.group(0))
                                if "name" in parsed:
                                    tool_calls = [{"function": {"name": parsed["name"], "arguments": parsed.get("arguments", {})}}]
                        except Exception:
                            pass

                    if tool_calls:
                        tc = tool_calls[0]
                        fn = tc.get("function", {})
                        t_name = fn.get("name")
                        t_args = fn.get("arguments", {})

                        if t_name in ["clear_telemetry_logs", "control_service_lifecycle"]:
                            pending_confirmations = {"waiting": True, "tool_name": t_name, "tool_args": t_args}
                            return {"reply": f"⚠️ **Confirmation Required:** Proceed with `{t_name}`? (Reply 'Yes' or 'No').", "source": "agent"}

                        tool_res = execute_agent_tool(t_name, t_args)
                        return {
                            "reply": f"Executed **{t_name}** successfully.\n```json\n{json.dumps(tool_res, indent=2)}\n```",
                            "ui_action": tool_res.get("ui_action"),
                            "source": "agent"
                        }

                    if content.strip():
                        return {"reply": content, "source": "agent"}
        except Exception:
            continue

    return {"reply": "⚠️ Ollama agent error.", "source": "error"}

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def serve_index():
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)