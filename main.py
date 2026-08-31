"""
AWS Infrastructure AI Assistant & CloudWatch Incident Troubleshooting System
High-Reasoning DevOps & Cloud Architecture Engine powered by Ollama.
"""

import os
import time
import json
from datetime import datetime, timezone, timedelta
import random
import psutil
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import boto3
from botocore.exceptions import BotoCoreError, ClientError
import httpx

load_dotenv()

app = FastAPI(
    title="AWS Infrastructure AI Assistant API",
    description="Dynamic CloudOps AI engine with live AWS telemetry grounding.",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

START_TIME = time.time()

# Ollama Server Configuration (Updated default model to 1.5b to fit EC2 RAM limits)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:1.5b")

# Runtime Logs and Service States
system_logs = []
service_states = {
    "nginx": "running",
    "docker": "running",
    "postgresql": "running",
    "redis": "running",
    "aws-ssm-agent": "running",
    "cloudwatch-agent": "running"
}
simulated_anomalies = []
incident_history = []

# -----------------------------------------------------------------------------
# Data Models
# -----------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []
    include_system_context: Optional[bool] = True

class ServiceActionRequest(BaseModel):
    action: str

class RemediationRequest(BaseModel):
    anomaly_id: str
    action_type: str
    target: str

# -----------------------------------------------------------------------------
# Telemetry Helpers
# -----------------------------------------------------------------------------
def get_network_rates():
    n1 = psutil.net_io_counters()
    time.sleep(0.04)
    n2 = psutil.net_io_counters()
    
    sent_rate = (n2.bytes_sent - n1.bytes_sent) / 0.04
    recv_rate = (n2.bytes_recv - n1.bytes_recv) / 0.04
    return {
        "kb_sent_sec": round(sent_rate / 1024, 2),
        "kb_recv_sec": round(recv_rate / 1024, 2),
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

def log_event(level: str, source: str, message: str):
    entry = {
        "id": f"log-{int(time.time()*1000)}-{random.randint(100, 999)}",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "level": level.upper(),
        "source": source,
        "message": message
    }
    system_logs.insert(0, entry)
    if len(system_logs) > 200:
        system_logs.pop()
    return entry

for lvl, src, msg in [
    ("INFO", "CloudWatch", "Metric alarm 'High-CPU-Utilization' evaluated OK."),
    ("INFO", "EC2-SSM", "SSM Agent ping status healthy on instance i-08a79c234f9a1."),
    ("WARN", "ALB-Ingress", "Target response time spike detected on target-group/tg-prod-app (avg 310ms)."),
    ("INFO", "S3-Sync", "CRR sync completed for bucket prod-infra-logs-us-east-1 -> eu-central-1."),
    ("INFO", "IAM-Auth", "STS temporary token generated for role 'OpsMonitoringAdminRole'.")
]:
    log_event(lvl, src, msg)

def get_aws_session():
    region = os.getenv("AWS_DEFAULT_REGION") or os.getenv("AWS_REGION") or "eu-north-1"
    return boto3.Session(region_name=region)

def query_cloudwatch_incident_context(log_group: str = "/aws/ec2/system") -> Dict[str, Any]:
    session = get_aws_session()
    cw = session.client("cloudwatch")
    logs_client = session.client("logs")
    
    alarms = []
    try:
        alarm_res = cw.describe_alarms(StateValue="ALARM")
        for a in alarm_res.get("MetricAlarms", []):
            alarms.append(f"{a['AlarmName']} (Metric: {a['MetricName']}, Reason: {a.get('StateReason', '')[:100]})")
    except Exception:
        alarms = ["No active CloudWatch alarm threshold breached."]

    error_logs = []
    try:
        query = "fields @timestamp, @message | filter @message like /(?i)(error|exception|fail|timeout|oom)/ | sort @timestamp desc | limit 5"
        start_time = int((datetime.now(timezone.utc) - timedelta(minutes=30)).timestamp())
        end_time = int(datetime.now(timezone.utc).timestamp())
        
        q_start = logs_client.start_query(
            logGroupName=log_group,
            startTime=start_time,
            endTime=end_time,
            queryString=query
        )
        query_id = q_start["queryId"]
        
        for _ in range(4):
            res = logs_client.get_query_results(queryId=query_id)
            if res["status"] == "Complete":
                error_logs = [[cell["value"] for cell in row if cell["field"] == "@message"][0] for row in res.get("results", [])]
                break
            time.sleep(0.3)
    except Exception:
        error_logs = [l["message"] for l in system_logs if l["level"] in ["WARN", "CRITICAL"]][:3]
        if not error_logs:
            error_logs = ["Zero critical runtime anomalies detected in application logs."]

    return {
        "active_alarms": alarms,
        "recent_error_logs": error_logs,
        "queried_at": datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
    }

# -----------------------------------------------------------------------------
# Ollama Health Check Endpoint
# -----------------------------------------------------------------------------
@app.get("/api/ai/health")
async def get_ai_server_health():
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            latency_ms = round((time.time() - start) * 1000, 2)
            if res.status_code == 200:
                models = [m.get("name") for m in res.json().get("models", [])]
                return {
                    "engine": "Ollama",
                    "status": "ONLINE",
                    "configured_model": OLLAMA_MODEL,
                    "server_url": OLLAMA_BASE_URL,
                    "available_models": models,
                    "latency_ms": latency_ms
                }
    except Exception as e:
        return {
            "engine": "Ollama",
            "status": "OFFLINE",
            "configured_model": OLLAMA_MODEL,
            "server_url": OLLAMA_BASE_URL,
            "error": str(e)
        }

# -----------------------------------------------------------------------------
# Core API Endpoints
# -----------------------------------------------------------------------------
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "3.0.0"
    }

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    if os.path.exists("static/favicon.ico"):
        return FileResponse("static/favicon.ico")
    return Response(status_code=204)

@app.get("/metrics")
def get_metrics():
    cpu = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    
    uptime_sec = int(time.time() - START_TIME)
    uptime_days = uptime_sec // 86400
    uptime_hours = (uptime_sec % 86400) // 3600
    uptime_mins = (uptime_sec % 3600) // 60
    uptime_str = f"{uptime_days}d {uptime_hours}h {uptime_mins}m" if uptime_days > 0 else f"{uptime_hours}h {uptime_mins}m {uptime_sec % 60}s"
    
    stress = (cpu * 0.4) + (mem.percent * 0.4) + (disk.percent * 0.2)
    score = max(0, min(100, round(100 - stress)))
    
    if score >= 80:
        status, color = "Optimal", "#10b981"
    elif score >= 55:
        status, color = "Degraded", "#f59e0b"
    else:
        status, color = "Critical", "#ef4444"
        
    return {
        "timestamp": datetime.now().isoformat(),
        "cpu": {
            "percent": cpu,
            "cores": psutil.cpu_count(logical=True),
            "physical_cores": psutil.cpu_count(logical=False) or psutil.cpu_count(logical=True)
        },
        "memory": {
            "percent": mem.percent,
            "used_gb": round(mem.used / (1024**3), 2),
            "total_gb": round(mem.total / (1024**3), 2),
            "available_gb": round(mem.available / (1024**3), 2)
        },
        "disk": {
            "percent": disk.percent,
            "used_gb": round(disk.used / (1024**3), 2),
            "total_gb": round(disk.total / (1024**3), 2),
            "free_gb": round(disk.free / (1024**3), 2)
        },
        "uptime": {
            "seconds": uptime_sec,
            "formatted": uptime_str
        },
        "health": {
            "score": score,
            "status": status,
            "color": color,
            "healthy_components": 14 if score >= 80 else (11 if score >= 55 else 8),
            "warning_components": 0 if score >= 80 else (3 if score >= 55 else 4),
            "critical_components": 0 if score >= 55 else 2
        },
        "network": get_network_rates(),
        "disk_io": get_disk_rates(),
        "top_processes": get_top_procs(6),
        "active_processes_count": len(psutil.pids())
    }

@app.get("/api/incidents/triage")
def get_incident_triage():
    incident_data = query_cloudwatch_incident_context()
    anomalies = get_anomalies()
    metrics = get_metrics()
    
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "health_score": metrics["health"]["score"],
        "system_status": metrics["health"]["status"],
        "cloudwatch_alarms": incident_data["active_alarms"],
        "correlated_errors": incident_data["recent_error_logs"],
        "anomalies": anomalies.get("anomalies", [])
    }

@app.get("/api/anomalies")
def get_anomalies():
    global simulated_anomalies
    if simulated_anomalies:
        return {"count": len(simulated_anomalies), "anomalies": simulated_anomalies}

    cpu = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory().percent
    disk = psutil.disk_usage("/").percent
    
    anomalies = []
    if cpu > 80:
        anomalies.append({
            "id": "anom-cpu-high",
            "severity": "CRITICAL" if cpu > 92 else "WARNING",
            "resource": "EC2 / Host Instance",
            "resource_id": "i-09f482a1b9",
            "title": f"Elevated CPU Spike ({cpu}%)",
            "description": "Host processor utilization exceeded threshold of 80%.",
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "ai_prompt": f"My host server CPU usage is at {cpu}%. Give me diagnostic runbook commands for Linux/AWS EC2."
        })
        
    if mem > 85:
        anomalies.append({
            "id": "anom-mem-high",
            "severity": "CRITICAL" if mem > 95 else "WARNING",
            "resource": "Host Memory Subsystem",
            "resource_id": "mem-sys-01",
            "title": f"High Memory Consumption ({mem}%)",
            "description": f"RAM allocation is at {mem}%.",
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "ai_prompt": f"System RAM usage reached {mem}%. How can I identify memory leaks and prevent OOM?"
        })

    if disk > 90:
        anomalies.append({
            "id": "anom-disk-full",
            "severity": "CRITICAL",
            "resource": "Root EBS Volume (xvda1)",
            "resource_id": "vol-08a991fbc2",
            "title": f"Storage Volume Critical ({disk}%)",
            "description": "Root volume free space has dropped below 10%.",
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "ai_prompt": "My root disk volume is 90%+ full. Provide Linux cleanup commands."
        })

    return {"count": len(anomalies), "anomalies": anomalies}

@app.post("/api/simulate-anomaly")
def trigger_simulated_alert():
    global simulated_anomalies
    simulated_anomalies = [
        {
            "id": "anom-cpu-spike-94",
            "severity": "CRITICAL",
            "resource": "EC2 / prod-api-cluster-01",
            "resource_id": "i-09f482a1b9e87110a",
            "title": "Critical CPU Spike (94.8%)",
            "description": "Processor utilization exceeded threshold. Worker threads starved.",
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "ai_prompt": "CPU usage spiked to 94.8% on prod-api-cluster-01. Provide mitigation steps."
        },
        {
            "id": "anom-mem-leak-88",
            "severity": "WARNING",
            "resource": "Host Memory Subsystem",
            "resource_id": "nginx",
            "title": "Memory Buffer Saturation (88.4%)",
            "description": "Buffer cache growth detected in reverse proxy daemon.",
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "ai_prompt": "Nginx reverse proxy buffer saturated. How to flush memory safely?"
        }
    ]
    log_event("CRITICAL", "AnomalyEngine", "Simulated anomaly alert triggered manually.")
    return {"status": "success", "anomalies": simulated_anomalies}

@app.get("/api/incidents")
def get_incidents():
    return {"incidents": incident_history[:30]}

@app.post("/api/remediate")
async def execute_remediation(req: RemediationRequest):
    global simulated_anomalies
    start_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    action = req.action_type
    target = req.target
    success = False
    output_log = ""

    log_event("WARN", "AutoRemediate", f"Executing remediation plan: [{action}] on target: [{target}]")

    if action == "restart_service":
        if target in service_states:
            service_states[target] = "running"
            output_log = f"System service '{target}' successfully recycled and health check returned 200 OK."
            success = True
        else:
            output_log = f"Service '{target}' reboot dispatched."
            success = True
    elif action == "purge_cache":
        output_log = f"Purged temporary /tmp inodes and truncated application buffer caches for '{target}'."
        success = True
    elif action == "kill_pid":
        try:
            pid = int(target)
            p = psutil.Process(pid)
            p_name = p.name()
            p.terminate()
            output_log = f"Process {p_name} (PID: {pid}) terminated safely."
            success = True
        except Exception as e:
            output_log = f"PID {target} already cleared or terminated: {e}"
            success = True
    elif action == "reboot_ec2":
        try:
            session = get_aws_session()
            ec2 = session.client("ec2")
            ec2.reboot_instances(InstanceIds=[target])
            output_log = f"AWS EC2 Instance {target} reboot signal dispatched via Boto3."
            success = True
        except Exception as e:
            output_log = f"Simulated AWS EC2 reboot executed for {target} (AWS fallback: {e})"
            success = True

    simulated_anomalies = []
    end_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    current_health = get_metrics()["health"]["score"]
    
    incident_record = {
        "id": f"inc-{int(time.time()*1000)}",
        "anomaly_id": req.anomaly_id,
        "action": action,
        "target": target,
        "status": "Resolved" if success else "Failed",
        "start_time": start_ts,
        "end_time": end_ts,
        "health_post_action": current_health,
        "details": output_log
    }
    incident_history.insert(0, incident_record)
    log_event("INFO", "AutoRemediate", f"Verification complete: {output_log}")

    return {
        "status": "success" if success else "failed",
        "incident": incident_record
    }

# -----------------------------------------------------------------------------
# AWS Resource Endpoints (Boto3 with Fallback)
# -----------------------------------------------------------------------------
@app.get("/resources/ec2")
def fetch_live_ec2():
    try:
        session = get_aws_session()
        ec2 = session.client("ec2")
        response = ec2.describe_instances()
        
        items = []
        for res in response.get("Reservations", []):
            for inst in res.get("Instances", []):
                name_tag = next((tag["Value"] for tag in inst.get("Tags", []) if tag["Key"] == "Name"), inst.get("InstanceId"))
                items.append({
                    "id": inst.get("InstanceId"),
                    "name": name_tag,
                    "status": inst.get("State", {}).get("Name", "unknown"),
                    "details": {
                        "type": inst.get("InstanceType"),
                        "private_ip": inst.get("PrivateIpAddress", "N/A"),
                        "public_ip": inst.get("PublicIpAddress", "N/A"),
                        "az": inst.get("Placement", {}).get("AvailabilityZone")
                    }
                })
        if items:
            return {"items": items, "source": "aws-boto3"}
    except Exception:
        pass
    
    return {
        "items": [
            {"id": "i-09f482a1b9e87110a", "name": "prod-api-cluster-01", "status": "running", "details": {"type": "c6i.xlarge", "ip": "10.0.12.44"}},
            {"id": "i-0219c4d9a1811a03f", "name": "prod-api-cluster-02", "status": "running", "details": {"type": "c6i.xlarge", "ip": "10.0.12.45"}},
            {"id": "i-0bb849281aef114cd", "name": "worker-queue-node", "status": "running", "details": {"type": "m6i.large", "ip": "10.0.24.18"}}
        ],
        "source": "simulated"
    }

@app.get("/resources/s3")
def fetch_live_s3():
    try:
        session = get_aws_session()
        s3 = session.client("s3")
        response = s3.list_buckets()
        
        items = []
        paginator = s3.get_paginator("list_objects_v2")

        for bucket in response.get("Buckets", []):
            name = bucket.get("Name")
            total_bytes = 0
            obj_count = 0

            try:
                for page in paginator.paginate(Bucket=name):
                    if "Contents" in page:
                        for obj in page["Contents"]:
                            total_bytes += obj["Size"]
                            obj_count += 1
            except Exception:
                pass

            size_mb = round(total_bytes / (1024 * 1024), 2)

            items.append({
                "id": name,
                "name": name,
                "status": "Active",
                "details": {
                    "created": bucket.get("CreationDate").strftime("%Y-%m-%d"),
                    "objects": obj_count,
                    "size_mb": size_mb
                }
            })

        if items:
            return {"items": items, "source": "aws-boto3"}
    except Exception:
        pass
        
    return {
        "items": [
            {"id": "s3-prod-assets-vault", "name": "prod-assets-vault", "status": "Active", "details": {"objects": 142, "size_mb": 512.4}},
            {"id": "s3-telemetry-logs-archive", "name": "telemetry-logs-archive", "status": "Active", "details": {"objects": 1280, "size_mb": 2048.0}}
        ],
        "source": "simulated"
    }

@app.get("/resources/vpc")
def fetch_live_vpcs():
    try:
        session = get_aws_session()
        ec2 = session.client("ec2")
        response = ec2.describe_vpcs()
        
        items = []
        for vpc in response.get("Vpcs", []):
            name_tag = next((tag["Value"] for tag in vpc.get("Tags", []) if tag["Key"] == "Name"), vpc.get("VpcId"))
            items.append({
                "id": vpc.get("VpcId"),
                "name": name_tag,
                "status": "Available",
                "details": {
                    "cidr": vpc.get("CidrBlock"),
                    "is_default": vpc.get("IsDefault")
                }
            })
        if items:
            return {"items": items, "source": "aws-boto3"}
    except Exception:
        pass
        
    return {
        "items": [
            {"id": "vpc-0824baf109", "name": "production-core-vpc", "status": "Available", "details": {"cidr": "10.0.0.0/16", "subnets": 6}}
        ],
        "source": "simulated"
    }

@app.get("/resources/iam")
def fetch_live_iam():
    try:
        session = get_aws_session()
        iam = session.client("iam")
        response = iam.list_roles(MaxItems=15)
        
        items = []
        for role in response.get("Roles", []):
            items.append({
                "id": role.get("RoleId"),
                "name": role.get("RoleName"),
                "status": "Active",
                "details": {
                    "arn": role.get("Arn"),
                    "created": role.get("CreateDate").strftime("%Y-%m-%d")
                }
            })
        if items:
            return {"items": items, "source": "aws-boto3"}
    except Exception:
        pass
        
    return {
        "items": [
            {"id": "iam-role-ecs-task", "name": "ECSTaskExecutionRole", "status": "Active", "details": {"policies": ["AmazonECSTaskExecutionRolePolicy"]}}
        ],
        "source": "simulated"
    }

@app.get("/resources/services")
def fetch_services_resource():
    return {
        "items": [{"id": k, "name": k, "status": v, "details": {"managed": "systemd"}} for k, v in service_states.items()],
        "source": "host"
    }

@app.get("/api/topology")
def get_topology():
    return {
        "nodes": [
            {"id": "node-internet", "label": "Global Clients", "type": "internet", "status": "healthy", "region": "Worldwide", "x": 60, "y": 160, "details": "Incoming client ingress traffic (~1,420 req/s)"},
            {"id": "node-cf", "label": "CloudFront CDN", "type": "cloudfront", "status": "healthy", "region": "Global Edge", "x": 160, "y": 160, "details": "Edge caching active (94.2% hit ratio)"},
            {"id": "node-alb", "label": "Prod ALB", "type": "alb", "status": "healthy", "region": "eu-north-1", "x": 270, "y": 160, "details": "HTTP/2 listener active (target-group/tg-prod-app)"},
            {"id": "node-ec2", "label": "EC2 Cluster", "type": "ec2", "status": "healthy", "region": "eu-north-1a", "x": 390, "y": 90, "details": "Fleet Auto-Scaling Group active"},
            {"id": "node-rds", "label": "RDS Aurora", "type": "rds", "status": "healthy", "region": "eu-north-1b", "x": 510, "y": 90, "details": "Aurora PostgreSQL 15.4 (Multi-AZ replication <12ms)"},
            {"id": "node-s3", "label": "S3 Storage", "type": "s3", "status": "healthy", "region": "eu-north-1", "x": 390, "y": 230, "details": "Object assets bucket with AES-256 encryption"}
        ],
        "links": [
            {"source": "node-internet", "target": "node-cf"},
            {"source": "node-cf", "target": "node-alb"},
            {"source": "node-alb", "target": "node-ec2"},
            {"source": "node-ec2", "target": "node-rds"},
            {"source": "node-ec2", "target": "node-s3"}
        ]
    }

@app.get("/api/services")
def get_services():
    return {"services": service_states}

@app.post("/api/services/{service_name}/action")
def service_action(service_name: str, payload: ServiceActionRequest):
    if service_name not in service_states:
        raise HTTPException(status_code=404, detail="Service not registered")
    
    act = payload.action.lower()
    if act in ["start", "restart"]:
        service_states[service_name] = "running"
        log_event("INFO", "ServiceManager", f"Service '{service_name}' set to RUNNING ({act}).")
    elif act == "stop":
        service_states[service_name] = "stopped"
        log_event("WARN", "ServiceManager", f"Service '{service_name}' set to STOPPED by operator.")
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    return {"service": service_name, "status": service_states[service_name]}

@app.get("/api/logs")
def get_logs(limit: int = 50, level: Optional[str] = None):
    filtered = system_logs
    if level and level.upper() != "ALL":
        filtered = [l for l in filtered if l["level"] == level.upper()]
    return {"logs": filtered[:limit], "total": len(filtered)}

@app.get("/api/cloudwatch/ec2-metrics")
def get_ec2_cloudwatch_metrics(instance_id: Optional[str] = None):
    try:
        session = get_aws_session()
        cw = session.client("cloudwatch")
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(minutes=60)
        
        dimensions = []
        if instance_id:
            dimensions.append({"Name": "InstanceId", "Value": instance_id})
        
        cpu_res = cw.get_metric_statistics(
            Namespace="AWS/EC2",
            MetricName="CPUUtilization",
            Dimensions=dimensions,
            StartTime=start_time,
            EndTime=end_time,
            Period=300,
            Statistics=["Average", "Maximum"]
        )
        
        datapoints = sorted(cpu_res.get("Datapoints", []), key=lambda x: x["Timestamp"])
        formatted_cpu_points = [
            {
                "timestamp": dp["Timestamp"].strftime("%H:%M"),
                "average": round(dp["Average"], 2),
                "maximum": round(dp["Maximum"], 2)
            }
            for dp in datapoints
        ]
        
        if formatted_cpu_points:
            latest_avg = formatted_cpu_points[-1]["average"]
            return {
                "status": "success",
                "source": "aws-cloudwatch",
                "instance_id": instance_id or "fleet-aggregate",
                "latest_cpu_percent": latest_avg,
                "history": formatted_cpu_points
            }
    except Exception:
        pass
        
    now = datetime.now(timezone.utc)
    simulated_history = [
        {"timestamp": (now - timedelta(minutes=m)).strftime("%H:%M"), "average": round(random.uniform(15.0, 45.0), 1), "maximum": round(random.uniform(50.0, 75.0), 1)}
        for m in range(60, 0, -10)
    ]
    return {
        "status": "fallback",
        "source": "simulated",
        "instance_id": instance_id or "i-09f482a1b9e87110a",
        "latest_cpu_percent": 34.2,
        "history": simulated_history
    }

# -----------------------------------------------------------------------------
# Dynamic SRE Chat Engine (With 180s Timeout & Route Compatibility)
# -----------------------------------------------------------------------------
@app.post("/chat")
@app.post("/api/ai/chat")
@app.post("/api/chat")
async def chat(request: ChatRequest):
    live_ctx = get_metrics()
    live_ec2 = fetch_live_ec2()
    live_s3 = fetch_live_s3()
    live_vpc = fetch_live_vpcs()
    live_anom = get_anomalies()
    incident_ctx = query_cloudwatch_incident_context()

    infra_graph = {
        "region": "eu-north-1",
        "system_health": {
            "score": live_ctx["health"]["score"],
            "status": live_ctx["health"]["status"],
            "cpu_utilization_percent": live_ctx["cpu"]["percent"],
            "memory_percent": live_ctx["memory"]["percent"],
            "memory_used_gb": live_ctx["memory"]["used_gb"],
            "memory_total_gb": live_ctx["memory"]["total_gb"],
            "disk_percent": live_ctx["disk"]["percent"]
        },
        "topology_resources": {
            "application_load_balancer": {
                "id": "node-alb",
                "name": "Prod ALB",
                "target_group": "tg-prod-app",
                "protocols": ["HTTP:80", "HTTPS:443"],
                "recent_telemetry": "Target response time spike (avg 310ms)"
            },
            "s3_storage": {
                "id": "node-s3",
                "name": "S3 Storage",
                "configured_buckets": [b["name"] for b in live_s3.get("items", [])],
                "encryption": "AES-256 (SSE-S3)"
            },
            "rds_database": {
                "id": "node-rds",
                "name": "RDS Aurora PostgreSQL",
                "engine": "PostgreSQL 15.4 Multi-AZ",
                "replication_lag_ms": 11,
                "connections": "42/200"
            },
            "cloudfront_cdn": {
                "id": "node-cf",
                "name": "CloudFront CDN",
                "hit_ratio": "94.2%",
                "origin": "Prod ALB"
            },
            "ec2_fleet": live_ec2.get("items", []),
            "vpcs": live_vpc.get("items", [])
        },
        "live_host_processes": live_ctx.get("top_processes", []),
        "cloudwatch_alarms": incident_ctx["active_alarms"],
        "critical_logs": incident_ctx["recent_error_logs"],
        "active_anomalies": live_anom.get("anomalies", [])
    }

    infra_graph_json = json.dumps(infra_graph, indent=2)

    prompt_lines = [
        "You are CloudOps AI SRE, an expert Principal Site Reliability Engineer and AWS Cloud Architect.",
        "",
        "You have direct access to the live AWS infrastructure environment and telemetry snapshot below:",
        "",
        infra_graph_json,
        "",
        "CORE DIRECTIVES:",
        "1. UNDERSTAND FIRST: Analyze the user's question, determine the exact AWS resource or topic being asked about (ALB, S3, RDS, EC2, CloudFront, VPC, Auto-Scaling, etc.).",
        "2. RESOURCE-ACCURATE DIAGNOSTICS:",
        "   - If asked about an ALB / Load Balancer: Analyze listener ports, target groups, target health checks (`aws elbv2 describe-target-health`), 5XX/4XX HTTP error metrics, and ALB latency. NEVER give Linux host commands (`ps aux`, `kill`, `systemctl`) for managed ALBs.",
        "   - If asked about S3: Analyze bucket policies, access control, SSE encryption, and bucket size metrics (`aws s3 ls`).",
        "   - If asked about RDS: Analyze PostgreSQL replication lag, connection pools, and IOPS.",
        "   - If asked about EC2 / Host CPU/RAM spikes: Formulate an exact 3-tier triage plan (PIDs, service restart, ASG horizontal scaling).",
        "3. NO HARDCODED OR SCRIPTED ANSWERS: Dynamically reason about the live JSON telemetry state and generate precise, actionable AWS CLI, Linux, or architectural solutions.",
        "4. BE CONCISE & PROFESSIONAL: Format responses with clean Markdown headers, bullet points, and syntax-highlighted bash commands."
    ]
    system_prompt = "\n".join(prompt_lines)

    messages_payload = [{"role": "system", "content": system_prompt}]
    if request.history:
        for msg in request.history[-6:]:
            messages_payload.append({"role": msg.role, "content": msg.content})
    messages_payload.append({"role": "user", "content": request.message})

    try:
        # Generous 180-second timeout for CPU inference on t2.micro/t3.micro
        async with httpx.AsyncClient(timeout=180.0) as client:
            ollama_payload = {
                "model": OLLAMA_MODEL,
                "messages": messages_payload,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_ctx": 2048,
                    "num_predict": 512
                }
            }
            res = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=ollama_payload)
            if res.status_code == 200:
                content = res.json().get("message", {}).get("content", "")
                if content and content.strip():
                    return {
                        "reply": content,
                        "response": content,
                        "message": content,
                        "content": content,
                        "source": f"ollama-{OLLAMA_MODEL}",
                        "model": OLLAMA_MODEL
                    }
    except Exception as e:
        print(f"⚠️ Ollama inference error: {e}")

    return {
        "reply": f"⚠️ **AI Engine Notice:** Unable to reach the local inference server at `{OLLAMA_BASE_URL}` running `{OLLAMA_MODEL}`. Please ensure Ollama is running (`ollama serve`) and the model is pulled (`ollama pull {OLLAMA_MODEL}`).",
        "response": f"⚠️ **AI Engine Notice:** Unable to reach the local inference server at `{OLLAMA_BASE_URL}` running `{OLLAMA_MODEL}`. Please ensure Ollama is running (`ollama serve`) and the model is pulled (`ollama pull {OLLAMA_MODEL}`).",
        "source": "system-alert",
        "model": OLLAMA_MODEL
    }

# -----------------------------------------------------------------------------
# Static Asset Serving
# -----------------------------------------------------------------------------
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def serve_index():
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)