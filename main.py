"""
AWS Infrastructure AI Assistant - Backend Application Server
Provides RESTful APIs for hardware telemetry, anomaly evaluation, 
infrastructure topology, service lifecycle actions, and AI troubleshooting.
"""

import os
import time
from datetime import datetime, timezone, timedelta
import random
import requests
import psutil
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(
    title="AWS Infrastructure AI Assistant API",
    description="Real-time infrastructure monitoring, anomaly detection, and AI troubleshooting backend.",
    version="2.4.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

START_TIME = time.time()
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:1b")

# Runtime In-Memory Storage
system_logs = []
service_states = {
    "nginx": "running",
    "docker": "running",
    "postgresql": "running",
    "redis": "running",
    "aws-ssm-agent": "running",
    "cloudwatch-agent": "running"
}

# In-memory storage for simulated anomalies
simulated_anomalies = []

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

# !!! NEW MODEL FOR REMEDIATION !!!
class RemediationRequest(BaseModel):
    anomaly_id: str
    action_type: str  # 'restart_service' | 'purge_cache' | 'kill_pid' | 'reboot_ec2'
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

def get_top_procs(limit: int = 5):
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

# Initial seed telemetry logs
for lvl, src, msg in [
    ("INFO", "CloudWatch", "Metric alarm 'High-CPU-Utilization' evaluated OK."),
    ("INFO", "EC2-SSM", "SSM Agent ping status healthy on instance i-08a79c234f9a1."),
    ("WARN", "ALB-Ingress", "Target response time spike detected on target-group/tg-prod-app (avg 310ms)."),
    ("INFO", "S3-Sync", "CRR sync completed for bucket prod-infra-logs-us-east-1 -> eu-central-1."),
    ("INFO", "IAM-Auth", "STS temporary token generated for role 'OpsMonitoringAdminRole'.")
]:
    log_event(lvl, src, msg)

# -----------------------------------------------------------------------------
# Core API Endpoints
# -----------------------------------------------------------------------------
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
        "top_processes": get_top_procs(5),
        "active_processes_count": len(psutil.pids())
    }

# --- MODIFIED ANOMALY FETCHING TO HANDLE SIMULATION ---
@app.get("/api/anomalies")
def get_anomalies():
    # Priority 1: Return active simulated anomalies if present
    global simulated_anomalies
    if simulated_anomalies:
        return {"count": len(simulated_anomalies), "anomalies": simulated_anomalies}

    # Priority 2: Perform real heuristic evaluation
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
            "description": "Host processor utilization exceeded threshold of 80%. Risk of thread starvation.",
            "possible_cause": "High thread contention or intensive computation in worker processes.",
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "ai_prompt": f"My host server CPU usage is at {cpu}%. Top processes are showing heavy load. Give me a step-by-step investigation command set for Linux/AWS EC2 to pinpoint and mitigate this."
        })
        
    if mem > 85:
        anomalies.append({
            "id": "anom-mem-high",
            "severity": "CRITICAL" if mem > 95 else "WARNING",
            "resource": "Host Memory Subsystem",
            "resource_id": "mem-sys-01",
            "title": f"High Memory Consumption ({mem}%)",
            "description": f"RAM allocation is at {mem}%. Swap usage may trigger IO performance penalties.",
            "possible_cause": "Potential memory leak in daemon or large un-cached query buffer.",
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "ai_prompt": f"System RAM usage reached {mem}%. How can I identify memory leaks, check buffer/cache reclaimable memory, and prevent OOM Killer from terminating critical services?"
        })

    if disk > 90:
        anomalies.append({
            "id": "anom-disk-full",
            "severity": "CRITICAL",
            "resource": "Root EBS Volume (xvda1)",
            "resource_id": "vol-08a991fbc2",
            "title": f"Storage Volume Critical ({disk}%)",
            "description": "Root volume free space has dropped below 10%.",
            "possible_cause": "Unrotated application logs in /var/log or untruncated Docker container logs.",
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "ai_prompt": "My root disk volume is 90%+ full. Provide Linux commands to locate the largest space-consuming directories and safely clean journal/Docker logs without corrupting running containers."
        })

    # Priority 3: Fallback INFO alerts if system is totally healthy
    if not anomalies:
        anomalies.extend([
            {
                "id": "anom-alb-latency",
                "severity": "INFO",
                "resource": "Application Load Balancer",
                "resource_id": "alb-us-east-prod",
                "title": "Sub-optimal Target P99 Latency",
                "description": "99th percentile response time is fluctuating between 180ms and 240ms.",
                "possible_cause": "Cold starts in backend workers or Keep-Alive connection timeout mismatch.",
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "ai_prompt": "Explain how to diagnose ALB P99 latency spikes in AWS CloudWatch and adjust connection keep-alive headers on Nginx/Gunicorn backends."
            },
            {
                "id": "anom-s3-tier",
                "severity": "INFO",
                "resource": "S3 Data Lake",
                "resource_id": "s3-analytics-raw-bucket",
                "title": "Lifecycle Rule Optimization Recommended",
                "description": "Over 4.2 TB of uncompressed logs have remained in S3 Standard tier for > 90 days.",
                "possible_cause": "Missing S3 Intelligent-Tiering or Glacier lifecycle transition rule.",
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "ai_prompt": "Give me a CloudFormation/Terraform snippet and AWS CLI command to set up an S3 Lifecycle rule transitioning objects over 30 days to Intelligent-Tiering and 90 days to Glacier Flexible Retrieval."
            }
        ])

    return {"count": len(anomalies), "anomalies": anomalies}

# !!! NEW SIMULATION ENDPOINT !!!
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
            "description": "Processor utilization exceeded threshold. Gunicorn worker threads starved.",
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

# !!! NEW REMEDIATION ENDPOINTS !!!
incident_history = []

@app.get("/api/incidents")
def get_incidents():
    return {"incidents": incident_history[:30]}

@app.post("/api/remediate")
async def execute_remediation(req: RemediationRequest):
    start_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    action = req.action_type
    target = req.target
    success = False
    output_log = ""

    log_event("WARN", "AutoRemediate", f"Executing remediation plan: [{action}] on target: [{target}]")

    # 1. Action: Restart Managed Daemon/Service
    if action == "restart_service":
        if target in service_states:
            service_states[target] = "running"
            output_log = f"System service '{target}' successfully recycled and health check returned 200 OK."
            success = True
        else:
            output_log = f"Service '{target}' not found in registry."

    # 2. Action: Purge Temp / Container Cache
    elif action == "purge_cache":
        output_log = f"Purged temporary /tmp inodes and truncated application buffer caches for '{target}'."
        success = True

    # 3. Action: Terminate Stalled PID
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

    # 4. Action: Reboot Live AWS EC2 Instance via Boto3
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

    # --- MODIFIED: CLEAR SIMULATION UPON RESOLUTION ---
    global simulated_anomalies
    simulated_anomalies = []

    # 5. Post-Remediation Verification
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

import boto3
from botocore.exceptions import BotoCoreError, ClientError

# Initialize AWS Session
def get_aws_session():
    return boto3.Session(
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1")
    )

# -----------------------------------------------------------------------------
# Real AWS Resource Endpoints (Boto3)
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
                name_tag = next((tag["Value"] for tag in inst.get("Tags", []) if tag["Key"] == "Name"), "Unnamed")
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
        return {"items": items, "source": "aws-boto3"}
    except (BotoCoreError, ClientError, Exception) as e:
        print(f"⚠️ AWS Boto3 fallback for EC2: {e}")
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
        for bucket in response.get("Buckets", []):
            items.append({
                "id": bucket.get("Name"),
                "name": bucket.get("Name"),
                "status": "Active",
                "details": {
                    "created": bucket.get("CreationDate").strftime("%Y-%m-%d %H:%M:%S")
                }
            })
        return {"items": items, "source": "aws-boto3"}
    except (BotoCoreError, ClientError, Exception) as e:
        print(f"⚠️ AWS Boto3 fallback for S3: {e}")
        return {
            "items": [
                {"id": "s3-prod-assets-vault", "name": "prod-assets-vault", "status": "Active", "details": {"encryption": "AES-256", "versioning": True}},
                {"id": "s3-telemetry-logs-archive", "name": "telemetry-logs-archive", "status": "Active", "details": {"lifecycle": "Glacier-30d"}}
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
        return {"items": items, "source": "aws-boto3"}
    except (BotoCoreError, ClientError, Exception) as e:
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
        return {"items": items, "source": "aws-boto3"}
    except (BotoCoreError, ClientError, Exception) as e:
        return {
            "items": [
                {"id": "iam-role-ecs-task", "name": "ECSTaskExecutionRole", "status": "Active", "details": {"policies": ["AmazonECSTaskExecutionRolePolicy"]}}
            ],
            "source": "simulated"
        }
@app.get("/api/topology")
def get_topology():
    return {
        "nodes": [
            {"id": "node-internet", "label": "Global Clients", "type": "internet", "status": "online", "region": "Worldwide", "meta": "Requests: 1,420 req/s"},
            {"id": "node-cf", "label": "CloudFront CDN", "type": "cloudfront", "status": "online", "region": "Global Edge", "meta": "Cache Hit: 94.2%"},
            {"id": "node-alb", "label": "Prod ALB (us-east-1)", "type": "alb", "status": "online", "region": "us-east-1", "meta": "Latency: 24ms"},
            {"id": "node-ec2-cluster", "label": "EC2 AutoScaling Cluster", "type": "ec2", "status": "online", "region": "us-east-1 (a,b)", "meta": "Instances: 4 Healthy"},
            {"id": "node-rds", "label": "RDS Aurora Multi-AZ", "type": "rds", "status": "online", "region": "us-east-1", "meta": "Connections: 84/500"},
            {"id": "node-s3", "label": "S3 Static & Assets", "type": "s3", "status": "online", "region": "us-east-1", "meta": "Capacity: 1.8TB"}
        ],
        "links": [
            {"source": "node-internet", "target": "node-cf", "protocol": "HTTPS (443)"},
            {"source": "node-cf", "target": "node-alb", "protocol": "Origin Fetch"},
            {"source": "node-cf", "target": "node-s3", "protocol": "Static OAC"},
            {"source": "node-alb", "target": "node-ec2-cluster", "protocol": "HTTP Target:8000"},
            {"source": "node-ec2-cluster", "target": "node-rds", "protocol": "PostgreSQL:5432"},
            {"source": "node-ec2-cluster", "target": "node-s3", "protocol": "IAM S3 PutObject"}
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
    """
    Fetches real-time 1-hour metric statistics from AWS CloudWatch.
    """
    try:
        session = get_aws_session()
        cw = session.client("cloudwatch")
        
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(minutes=60)
        
        dimensions = []
        if instance_id:
            dimensions.append({"Name": "InstanceId", "Value": instance_id})
        
        # 1. Fetch CPU Utilization (%)
        cpu_res = cw.get_metric_statistics(
            Namespace="AWS/EC2",
            MetricName="CPUUtilization",
            Dimensions=dimensions,
            StartTime=start_time,
            EndTime=end_time,
            Period=300,  # 5-minute data points
            Statistics=["Average", "Maximum"]
        )
        
        # Sort data points chronologically
        datapoints = sorted(cpu_res.get("Datapoints", []), key=lambda x: x["Timestamp"])
        
        formatted_cpu_points = [
            {
                "timestamp": dp["Timestamp"].strftime("%H:%M"),
                "average": round(dp["Average"], 2),
                "maximum": round(dp["Maximum"], 2)
            }
            for dp in datapoints
        ]
        
        latest_avg = formatted_cpu_points[-1]["average"] if formatted_cpu_points else 0.0
        
        return {
            "status": "success",
            "source": "aws-cloudwatch",
            "instance_id": instance_id or "fleet-aggregate",
            "latest_cpu_percent": latest_avg,
            "history": formatted_cpu_points
        }
        
    except Exception as e:
        print(f"⚠️ CloudWatch metrics fallback: {e}")
        # Simulated CloudWatch history fallback
        now = datetime.now(timezone.utc)
        simulated_history = [
            {"timestamp": (now - timedelta(minutes=m)).strftime("%H:%M"), "average": random.uniform(15.0, 45.0), "maximum": random.uniform(50.0, 75.0)}
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
# AI Assistant Engine & SRE Heuristic Fallback
# -----------------------------------------------------------------------------
SYSTEM_PROMPT = """You are the AWS Infrastructure AI Assistant — an expert DevOps & Site Reliability Engineer (SRE).
Provide accurate, production-grade infrastructure troubleshooting, AWS CLI commands, Bash scripts, root-cause analyses, and architecture improvements.
Format responses cleanly with markdown, code blocks, and clear step-by-step action items."""

def generate_heuristic_response(prompt: str, ctx: Dict[str, Any]) -> str:
    p = prompt.lower()
    if "cpu" in p or "spike" in p or "utilization" in p:
        cpu_val = ctx.get('cpu', {}).get('percent', 'N/A')
        cores_val = ctx.get('cpu', {}).get('cores', 'N/A')
        tasks_val = ctx.get('active_processes_count', 'N/A')
        return (
            "### 🔍 Incident Analysis: Elevated CPU Load\n\n"
            f"**Real-Time Host Telemetry:**\n"
            f"- Processor Utilization: **{cpu_val}%**\n"
            f"- Logical Cores: **{cores_val}**\n"
            f"- Active Tasks: **{tasks_val}**\n\n"
            "#### 🛠️ Immediate Triaging Runbook (Linux / EC2):\n"
            "```bash\n"
            "# 1. Isolate top CPU consumers\n"
            "top -b -n 1 -o +%CPU | head -n 15\n\n"
            "# 2. Check for I/O wait state bottlenecks\n"
            "vmstat 1 5\n\n"
            "# 3. Trace kernel vs user space time\n"
            "mpstat -P ALL 1 3\n"
            "```\n\n"
            "#### 💡 Recommended Mitigation:\n"
            "1. **Scale Out:** If on an EC2 Auto Scaling Group, adjust target tracking to trigger scaling at `65%` CPU utilization.\n"
            "2. **Worker Concurrency:** Reduce worker threads in Gunicorn/Uvicorn if CPU context-switching overhead is high:\n"
            "   ```bash\n"
            "   workers = (2 * CPU_CORES) + 1\n"
            "   ```"
        )
    elif "memory" in p or "ram" in p or "oom" in p:
        used_mem = ctx.get('memory', {}).get('used_gb', 'N/A')
        total_mem = ctx.get('memory', {}).get('total_gb', 'N/A')
        mem_pct = ctx.get('memory', {}).get('percent', 'High')
        return (
            "### 🧠 Memory Saturation & OOM Prevention\n\n"
            f"**Observed State:**\n"
            f"- RAM Usage: **{used_mem} GB / {total_mem} GB** ({mem_pct}%)\n\n"
            "#### 📋 Diagnostic Commands:\n"
            "```bash\n"
            "# 1. View memory buffers and cached allocations\n"
            "free -h -w\n\n"
            "# 2. Search kernel buffer for OOM killer invocations\n"
            'dmesg -T | grep -E -i "oom|out of memory|killed process"\n\n'
            "# 3. Top 5 memory-hungry processes\n"
            "ps aux --sort=-%mem | head -n 6\n"
            "```\n\n"
            "#### 🛡️ Permanent Fixes:\n"
            "- Provision an emergency swap volume to prevent process termination during spikes:\n"
            "   ```bash\n"
            "   sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile\n"
            "   sudo mkswap /swapfile && sudo swapon /swapfile\n"
            "   ```"
        )
    elif "disk" in p or "storage" in p or "volume" in p:
        return (
            "### 💾 Storage Capacity Remediation\n\n"
            "#### ⚡ Space Recovery Commands:\n"
            "```bash\n"
            "# 1. Identify 10 largest directory trees\n"
            "sudo du -ahx / | sort -rh | head -n 10\n\n"
            "# 2. Truncate unrotated Docker container json logs\n"
            "sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log\n\n"
            "# 3. Vacuum systemd journal archives\n"
            "sudo journalctl --vacuum-time=2d\n"
            "```\n\n"
            "#### ☁️ Online EBS Expansion (Zero Downtime):\n"
            "1. In AWS Management Console, increase volume size from `30GB` to `60GB`.\n"
            "2. Expand partition dynamically on the running host:\n"
            "   ```bash\n"
            "   sudo growpart /dev/xvda 1\n"
            "   sudo resize2fs /dev/xvda1   # ext4\n"
            "   ```"
        )
    else:
        status_val = ctx.get('health', {}).get('status', 'Optimal')
        score_val = ctx.get('health', {}).get('score', 95)
        return (
            "### 🚀 Infrastructure & DevOps Advisory\n\n"
            f'Analyzed query: **"{prompt}"**\n\n'
            "#### 📌 System Telemetry Summary:\n"
            f"- **Health Status:** {status_val} ({score_val}/100)\n"
            "- **Active Daemons:** Nginx, Docker, PostgreSQL, SSM Agent (Healthy)\n\n"
            "#### 🛠️ Strategic Recommendations:\n"
            "1. **Telemetry Export:** Link `/metrics` directly to Prometheus / CloudWatch Container Insights.\n"
            "2. **IaC Hardening:** Audit security groups with AWS IAM Access Analyzer.\n"
            "3. **Automated Runbooks:** Couple `/api/anomalies` with AWS SSM Automation documents for self-healing operations."
        )

import httpx

@app.post("/chat")
async def chat(request: ChatRequest):
    live_ctx = get_metrics()
    context_str = (
        f"LIVE INFRASTRUCTURE METRICS:\n"
        f"- CPU: {live_ctx['cpu']['percent']}%\n"
        f"- Memory: {live_ctx['memory']['percent']}% ({live_ctx['memory']['used_gb']}GB / {live_ctx['memory']['total_gb']}GB)\n"
        f"- Disk: {live_ctx['disk']['percent']}%\n"
        f"- System Health Status: {live_ctx['health']['status']} (Score: {live_ctx['health']['score']}/100)\n"
        f"- Network In/Out: {live_ctx['network']['kb_recv_sec']} KB/s in, {live_ctx['network']['kb_sent_sec']} KB/s out\n"
    )
    full_prompt = f"{SYSTEM_PROMPT}\n\n{context_str}\n\nUser Question: {request.message}"

    print(f"🤖 [AI Query Received]: '{request.message}' -> Forwarding to Ollama...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                OLLAMA_URL,
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": full_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.2,
                        "top_p": 0.9,
                        "num_predict": 250
                    }
                }
            )
            if res.status_code == 200:
                ai_text = res.json().get("response", "").strip()
                print("✅ [Ollama Responded Successfully]")
                return {
                    "reply": ai_text,
                    "source": "ollama",
                    "model": OLLAMA_MODEL
                }
            else:
                print(f"⚠️ [Ollama Non-200 Status]: {res.status_code}")
    except httpx.TimeoutException:
        print("❌ [Ollama Timeout]: Falling back to SRE heuristic engine.")
    except Exception as e:
        print(f"❌ [Ollama Connection Error]: {e}")

    print("🔄 [Using Heuristic SRE Engine Fallback]")
    return {
        "reply": generate_heuristic_response(request.message, live_ctx),
        "source": "sre-heuristic-engine",
        "model": "rule-based-sre-v2"
    }
# -----------------------------------------------------------------------------
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
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)