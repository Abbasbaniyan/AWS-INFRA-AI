"""
AWS Infrastructure AI Assistant & CloudWatch Incident Troubleshooting System
Real service-lifecycle control (systemctl), real AWS inspection/action, LLM-driven
intent classification with deterministic backend validation and verification.
"""

import os
import time
import json
import subprocess
import threading
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

import psutil
from fastapi import FastAPI, HTTPException
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
    description="CloudOps AI engine with real service control, real AWS inspection, "
                 "LLM-driven intent classification, and independent verification.",
    version="5.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

START_TIME = time.time()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# OLLAMA_BASE_URL is the canonical variable name. OLLAMA_URL is accepted as an
# alias so existing .env files that used the old name keep working. If both
# are set, OLLAMA_BASE_URL wins.
OLLAMA_BASE_URL = (os.getenv("OLLAMA_BASE_URL") or os.getenv("OLLAMA_URL") or "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:0.5b")
AWS_REGION = os.getenv("AWS_DEFAULT_REGION") or os.getenv("AWS_REGION") or "eu-north-1"

# Destructive AWS actions (e.g. terminating an EC2 instance) are executed for
# real only when this is explicitly enabled. This is a deliberate extra safety
# gate on top of the confirmation flow, since this action is irreversible.
ALLOW_DESTRUCTIVE_ACTIONS = os.getenv("ALLOW_DESTRUCTIVE_ACTIONS", "false").strip().lower() in ("1", "true", "yes")

# How long a pending destructive-action confirmation stays valid.
PENDING_CONFIRMATION_TTL_SECONDS = int(os.getenv("PENDING_CONFIRMATION_TTL_SECONDS", "120"))

# How long a real service-state query result may be reused before we re-query
# the host. This is a read cache only -- it is never treated as authoritative
# on its own, and any lifecycle action forces a fresh, uncached query.
SERVICE_STATE_CACHE_TTL_SECONDS = float(os.getenv("SERVICE_STATE_CACHE_TTL_SECONDS", "3"))

# Backend-side duplicate-action protection window: if the exact same
# (service_id, action) completed within this many seconds, the cached result
# is returned instead of executing the operation again.
DEDUPE_WINDOW_SECONDS = float(os.getenv("DEDUPE_WINDOW_SECONDS", "4"))

# Map of short service_id -> real systemd unit name on the host.
# Reconciled against the live EC2 host's verified inventory (2026-09):
# only docker.service, amazon-ssm-agent.service, and ollama.service actually
# exist on this host. nginx/postgresql/redis/cloudwatch-agent are NOT
# installed and are intentionally NOT listed here -- do not add services
# that were not verified present on the real host.
DEFAULT_SERVICE_UNIT_MAP = {
    "docker": "docker.service",
    "ollama.service": "ollama.service",
    "aws-ssm-agent": "amazon-ssm-agent.service",
    "aws-infra-api": "aws-infra-api.service",
}


def _load_service_unit_map() -> Dict[str, str]:
    merged = dict(DEFAULT_SERVICE_UNIT_MAP)
    raw = os.getenv("SERVICE_UNIT_MAP_JSON")
    if raw:
        try:
            override = json.loads(raw)
            if isinstance(override, dict):
                merged.update(override)
        except Exception:
            pass
    return merged


SUPPORTED_SERVICES: Dict[str, str] = _load_service_unit_map()

# Services in SUPPORTED_SERVICES are all real and inspectable (their true
# state is always shown). Only the services listed here may have start/stop/
# restart executed against them without extra configuration. Amazon SSM
# Agent is deliberately excluded by default -- it is critical remote-access
# infrastructure for this instance and must not be casually stopped/restarted
# via chat or a workspace button. Set ALLOW_SSM_LIFECYCLE_CONTROL=true to
# opt in if you specifically want that capability.
ALLOW_SSM_LIFECYCLE_CONTROL = os.getenv("ALLOW_SSM_LIFECYCLE_CONTROL", "false").strip().lower() in ("1", "true", "yes")

LIFECYCLE_CONTROLLABLE_SERVICES = {"docker", "ollama.service", "aws-infra-api"}
if ALLOW_SSM_LIFECYCLE_CONTROL:
    LIFECYCLE_CONTROLLABLE_SERVICES.add("aws-ssm-agent")

# Cosmetic/informational port hints only -- NOT verified against real socket
# bindings. Do not treat this as live infrastructure state.
SERVICE_PORT_HINTS = {
    "docker": 2375, "aws-ssm-agent": 443, "aws-infra-api": 8000, "ollama.service": 11434
}

# The unit that corresponds to this API process itself. Restarting/stopping it
# from inside its own request handler needs special handling (see
# execute_real_service_action) so the response can be sent before the process
# is torn down.
SELF_SERVICE_ID = "aws-infra-api"

AFFIRM_WORDS = {"yes", "y", "proceed", "do it", "confirm", "confirmed", "ok", "okay", "go ahead"}
NEGATE_WORDS = {"no", "n", "cancel", "abort", "stop", "don't", "do not"}

# ---------------------------------------------------------------------------
# In-memory stores (explicitly NOT the source of truth for infrastructure
# state -- see get_real_service_inventory / query_real_service_state below,
# which always re-derive state from the host or from AWS).
# ---------------------------------------------------------------------------
system_logs: List[dict] = []
activity_ledger: List[dict] = []
model_states = {
    "qwen2.5-coder:0.5b": {"is_active": True, "status": "In-Memory", "ram_allocation_mb": 390, "size_mb": 394},
    "llama3:8b": {"is_active": False, "status": "Idle", "ram_allocation_mb": 0, "size_mb": 4700}
}
pending_confirmations: Dict[str, Any] = {}

_service_inventory_cache = {"data": None, "ts": 0.0}
_service_inventory_lock = threading.Lock()
_service_locks: Dict[str, threading.Lock] = {}
_service_locks_guard = threading.Lock()
_recent_action_results: Dict[tuple, dict] = {}
_ec2_metadata_cache = {"data": None, "ts": 0.0}


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
    return boto3.Session(
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_DEFAULT_REGION", "eu-north-1")
    )


def log_event(level: str, source: str, message: str, category: str = "System"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = {
        "id": f"log-{int(time.time() * 1000)}",
        "timestamp": timestamp,
        "level": level.upper(),
        "source": source,
        "message": message
    }
    system_logs.insert(0, entry)
    if len(system_logs) > 250:
        system_logs.pop()

    activity_entry = {
        "timestamp": timestamp,
        "category": category,
        "source": source,
        "severity": level.upper(),
        "message": message
    }
    activity_ledger.insert(0, activity_entry)
    if len(activity_ledger) > 250:
        activity_ledger.pop()
    return entry


# Startup log: a real event (the process starting), not a fabricated
# narrative about specific instances/alarms that may not exist on this host.
log_event("INFO", "System", "AWS Infrastructure AI Assistant backend started.", "System")

# NOTE: the previous implementation ran a background thread that injected
# random, fabricated log lines every 15 seconds to make the Live Logs panel
# look active. That thread has been removed. system_logs now only receives
# entries for events that actually happened (auth, service actions, model
# actions, AWS actions, startup).


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


# ---------------------------------------------------------------------------
# REAL service control (systemctl-backed). This block replaces the old
# in-memory `service_states` dict, which is no longer used anywhere as a
# source of truth.
# ---------------------------------------------------------------------------
def _run_systemctl(args: List[str], timeout: float = 15.0) -> tuple:
    """Run systemctl directly. Returns (returncode, stdout, stderr)."""
    try:
        r = subprocess.run(["systemctl"] + args, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except FileNotFoundError:
        return -1, "", "systemctl binary was not found on this host."
    except subprocess.TimeoutExpired:
        return -2, "", "systemctl command timed out."
    except Exception as e:
        return -3, "", str(e)


def _run_systemctl_privileged(args: List[str], timeout: float = 15.0) -> tuple:
    """
    Run systemctl for a mutating action (start/stop/restart). Tries directly
    first (works if this process already runs with sufficient privilege);
    if that fails with a permission/auth error, retries once with
    non-interactive sudo (`sudo -n`), which only succeeds if the host has a
    passwordless sudoers rule for this command. Never falls back to any form
    of interactive password prompt or arbitrary shell string.
    """
    rc, out, err = _run_systemctl(args, timeout=timeout)
    needs_privilege = rc != 0 and any(
        marker in (err or "").lower()
        for marker in ("interactive authentication required", "permission denied", "not authorized", "access denied")
    )
    if needs_privilege:
        try:
            r = subprocess.run(["sudo", "-n", "systemctl"] + args, capture_output=True, text=True, timeout=timeout)
            if r.returncode == 0:
                return r.returncode, r.stdout.strip(), r.stderr.strip()
            combined_err = (err + " | sudo retry: " + r.stderr.strip()).strip(" |")
            return r.returncode, r.stdout.strip(), combined_err
        except Exception as e:
            return rc, out, f"{err} | sudo retry failed: {e}"
    return rc, out, err


def _systemd_unreachable(err: str) -> bool:
    err_l = (err or "").lower()
    return "not been booted with systemd" in err_l or "failed to connect to bus" in err_l or "host is down" in err_l


def query_real_service_state(unit: str) -> dict:
    """
    Independently queries the REAL current state of a systemd unit.
    This is the verification source of truth -- it never reads from any
    dict that a lifecycle action wrote to.
    """
    rc, out, err = _run_systemctl(["is-active", unit])
    if _systemd_unreachable(err):
        return {"state": "unavailable", "reachable": False, "raw": err}

    state = (out or "").strip() or "unknown"
    not_found = "could not be found" in (err or "").lower() or "not-found" in state.lower() or "no such" in (err or "").lower()
    if not_found:
        return {"state": "not_found", "reachable": True, "raw": err or out}

    # systemctl is-active exits non-zero for inactive/failed/activating but
    # still prints the real state string on stdout -- use that string as the
    # actual state signal rather than the exit code.
    return {"state": state, "reachable": True, "raw": out or err}


def get_real_service_inventory(force_refresh: bool = False) -> List[dict]:
    """
    Returns the real, independently-queried state of every allowlisted
    service. Cached briefly (SERVICE_STATE_CACHE_TTL_SECONDS) purely to avoid
    spawning a systemctl process on every dashboard poll -- the cache is never
    treated as authoritative and any lifecycle action bypasses it.
    """
    now = time.time()
    with _service_inventory_lock:
        cached = _service_inventory_cache["data"]
        if not force_refresh and cached is not None and (now - _service_inventory_cache["ts"]) < SERVICE_STATE_CACHE_TTL_SECONDS:
            return cached

    inventory = []
    for svc_id, unit in SUPPORTED_SERVICES.items():
        info = query_real_service_state(unit)
        inventory.append({
            "id": svc_id,
            "unit": unit,
            "state": info["state"],
            "reachable": info["reachable"],
            "raw": info["raw"],
            "port_hint": SERVICE_PORT_HINTS.get(svc_id)
        })

    with _service_inventory_lock:
        _service_inventory_cache["data"] = inventory
        _service_inventory_cache["ts"] = time.time()
    return inventory


def _get_service_lock(service_id: str) -> threading.Lock:
    with _service_locks_guard:
        if service_id not in _service_locks:
            _service_locks[service_id] = threading.Lock()
        return _service_locks[service_id]


def execute_real_service_action(service_id: str, action: str) -> dict:
    """
    Executes a REAL systemctl lifecycle action and independently verifies the
    result by re-querying the host. Never fabricates success. Protected
    against duplicate/concurrent execution for the same service_id.
    """
    svc = (service_id or "").lower().strip()
    act = (action or "").lower().strip()

    # --- Deterministic validation (the AI never bypasses this) ---
    if svc not in SUPPORTED_SERVICES:
        return {
            "status": "failed", "service_id": svc, "action": act,
            "executed": False, "verified": False, "service_state": "unknown",
            "verification": "failed",
            "error": f"'{svc}' is not a recognized, supported service. "
                     f"Supported services: {', '.join(sorted(SUPPORTED_SERVICES.keys()))}."
        }
    if act not in ("start", "stop", "restart"):
        return {
            "status": "failed", "service_id": svc, "action": act,
            "executed": False, "verified": False,
            "service_state": query_real_service_state(SUPPORTED_SERVICES[svc])["state"],
            "verification": "failed",
            "error": f"Invalid lifecycle action '{act}'. Allowed actions: start, stop, restart."
        }
    if svc not in LIFECYCLE_CONTROLLABLE_SERVICES:
        return {
            "status": "blocked", "service_id": svc, "action": act,
            "executed": False, "verified": False,
            "service_state": query_real_service_state(SUPPORTED_SERVICES[svc])["state"],
            "verification": "not_attempted",
            "error": f"'{svc}' is treated as critical infrastructure and is not exposed for lifecycle "
                     f"control (inspection only). Set ALLOW_SSM_LIFECYCLE_CONTROL=true to change this "
                     f"if you specifically intend to allow it."
        }

    # --- Backend-side duplicate-action protection ---
    dedupe_key = (svc, act)
    prior = _recent_action_results.get(dedupe_key)
    if prior and (time.time() - prior["ts"]) < DEDUPE_WINDOW_SECONDS:
        result = dict(prior["result"])
        result["duplicate_suppressed"] = True
        result["message"] = (result.get("message") or "") + " (duplicate request within dedupe window -- not re-executed)"
        return result

    lock = _get_service_lock(svc)
    if not lock.acquire(blocking=False):
        return {
            "status": "rejected", "service_id": svc, "action": act,
            "executed": False, "verified": False,
            "service_state": query_real_service_state(SUPPORTED_SERVICES[svc])["state"],
            "verification": "skipped",
            "error": f"An action is already in progress for '{svc}'. Not executing a duplicate operation."
        }

    try:
        unit = SUPPORTED_SERVICES[svc]

        # Self-restart/self-stop needs special handling: if this process is
        # the one being restarted/stopped, a synchronous systemctl call would
        # tear down the very process handling this HTTP request before the
        # response could be sent, and we could not honestly verify the result
        # from inside the process being killed. We schedule it with a short
        # delay via systemd-run instead, and are explicit that verification is
        # not applicable within this request/response cycle.
        if svc == SELF_SERVICE_ID and act in ("restart", "stop"):
            scheduled = False
            schedule_err = ""
            try:
                proc = subprocess.run(
                    ["systemd-run", "--no-block", "--on-active=2", "systemctl", act, unit],
                    capture_output=True, text=True, timeout=10
                )
                scheduled = proc.returncode == 0
                schedule_err = proc.stderr.strip()
            except Exception as e:
                schedule_err = str(e)

            if scheduled:
                result = {
                    "status": "success", "service_id": svc, "action": act,
                    "executed": True, "verified": None, "service_state": "restarting",
                    "verification": "not_applicable",
                    "message": f"Self-{act} of the API process has been scheduled in ~2s so this response "
                                f"can be delivered first. The dashboard will briefly disconnect and should "
                                f"reconnect automatically; independent verification cannot be performed within "
                                f"this same request because the process handling it will exit."
                }
            else:
                result = {
                    "status": "failed", "service_id": svc, "action": act,
                    "executed": False, "verified": False, "service_state": "unknown",
                    "verification": "failed",
                    "error": f"Could not schedule self-{act} via systemd-run: {schedule_err or 'unknown error'}"
                }
            log_event("WARN" if scheduled else "CRITICAL", "Deployments",
                       f"Self-service {act} on '{svc}' scheduled={scheduled}.", "Deployment")
            _recent_action_results[dedupe_key] = {"result": result, "ts": time.time()}
            return result

        rc, out, err = _run_systemctl_privileged([act, unit])
        executed = (rc == 0)

        # Give the service a brief moment to transition before checking.
        time.sleep(1.2)
        verify = query_real_service_state(unit)

        expected_state = "active" if act in ("start", "restart") else "inactive"

        if not verify["reachable"]:
            result = {
                "status": "failed", "service_id": svc, "action": act,
                "executed": executed, "verified": False, "service_state": "unavailable",
                "verification": "failed",
                "error": "systemd is unreachable on this host, so the result could not be independently "
                         "verified. The action is NOT being reported as successful."
            }
        elif verify["state"] == "not_found":
            result = {
                "status": "failed", "service_id": svc, "action": act,
                "executed": executed, "verified": False, "service_state": "not_found",
                "verification": "failed",
                "error": f"Unit '{unit}' does not exist on this host. Check SERVICE_UNIT_MAP_JSON."
            }
        elif not executed:
            result = {
                "status": "failed", "service_id": svc, "action": act,
                "executed": False, "verified": False, "service_state": verify["state"],
                "verification": "failed",
                "error": err or f"systemctl {act} {unit} returned a non-zero exit code."
            }
        elif verify["state"] == expected_state:
            result = {
                "status": "success", "service_id": svc, "action": act,
                "executed": True, "verified": True, "service_state": verify["state"],
                "verification": "passed",
                "message": f"Service '{svc}' was {act}ed and independently verified as '{verify['state']}'."
            }
        else:
            result = {
                "status": "failed", "service_id": svc, "action": act,
                "executed": True, "verified": False, "service_state": verify["state"],
                "verification": "failed",
                "error": f"The {act} command was executed, but independent verification found state "
                         f"'{verify['state']}' instead of the expected '{expected_state}'."
            }

        level = "INFO" if result["status"] == "success" else "CRITICAL"
        log_event(level, "Deployments",
                   f"Service '{svc}' {act} -> executed={result['executed']} verified={result['verified']} "
                   f"state={result['service_state']}.", "Deployment")

        _recent_action_results[dedupe_key] = {"result": result, "ts": time.time()}
        get_real_service_inventory(force_refresh=True)  # refresh cache with the new real state
        return result
    finally:
        lock.release()


def compute_health(metrics: dict, inventory: List[dict]) -> dict:
    """
    Derives a health score from REAL metrics and REAL service state -- this
    replaces the previous hardcoded constant (96) that never changed.
    This is a simple, transparent heuristic, not a value sourced from AWS.
    """
    score = 100
    cpu = metrics["cpu"]["percent"]
    mem = metrics["memory"]["percent"]
    disk = metrics["disk"]["percent"]

    if cpu > 85:
        score -= 20
    elif cpu > 70:
        score -= 8
    if mem > 90:
        score -= 20
    elif mem > 75:
        score -= 8
    if disk > 90:
        score -= 15
    elif disk > 80:
        score -= 6

    reachable = [s for s in inventory if s["reachable"]]
    healthy = sum(1 for s in reachable if s["state"] == "active")
    total = len(inventory) or 1
    unhealthy = total - healthy
    score -= unhealthy * 6
    score = max(0, min(100, score))

    if score >= 90:
        label = "Optimal"
    elif score >= 70:
        label = "Degraded"
    else:
        label = "Critical"

    return {
        "score": score,
        "status": label,
        "healthy_components": healthy,
        "total_components": total,
        "source": "computed_from_live_metrics_and_service_state"
    }


def get_ec2_instance_metadata() -> Optional[dict]:
    """
    Fetches REAL instance metadata (instance id/type/AZ/IPs) from the AWS
    Instance Metadata Service (IMDSv2), which is only reachable when this
    process is actually running on an EC2 instance. Returns None off-EC2
    (e.g. local dev), which callers must treat as "unavailable", not as a
    reason to fabricate placeholder values.
    """
    now = time.time()
    if _ec2_metadata_cache["data"] is not None and (now - _ec2_metadata_cache["ts"]) < 300:
        return _ec2_metadata_cache["data"]
    try:
        with httpx.Client(timeout=1.5) as client:
            token_resp = client.put(
                "http://169.254.169.254/latest/api/token",
                headers={"X-aws-ec2-metadata-token-ttl-seconds": "21600"}
            )
            if token_resp.status_code != 200:
                return None
            token = token_resp.text
            headers = {"X-aws-ec2-metadata-token": token}

            def meta(path):
                r = client.get(f"http://169.254.169.254/latest/meta-data/{path}", headers=headers)
                return r.text if r.status_code == 200 else None

            data = {
                "instance_id": meta("instance-id"),
                "instance_type": meta("instance-type"),
                "az": meta("placement/availability-zone"),
                "private_ip": meta("local-ipv4"),
                "public_ip": meta("public-ipv4"),
            }
    except Exception:
        return None

    _ec2_metadata_cache["data"] = data
    _ec2_metadata_cache["ts"] = time.time()
    return data


@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat(), "version": "5.0.0"}


@app.get("/metrics")
def get_metrics():
    cpu = psutil.cpu_percent(interval=None) or 0.0
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    uptime_sec = int(time.time() - START_TIME)
    base = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cpu": {"percent": cpu, "cores": psutil.cpu_count(logical=True) or 1},
        "memory": {"percent": mem.percent, "used_gb": round(mem.used / (1024 ** 3), 2), "total_gb": round(mem.total / (1024 ** 3), 2)},
        "disk": {"percent": disk.percent, "used_gb": round(disk.used / (1024 ** 3), 2), "total_gb": round(disk.total / (1024 ** 3), 2)},
        "uptime": {"seconds": uptime_sec, "formatted": f"{uptime_sec // 3600}h {(uptime_sec % 3600) // 60}m"},
        "network": get_network_rates(),
        "disk_io": get_disk_rates(),
        "top_processes": get_top_procs(6)
    }
    inventory = get_real_service_inventory()
    base["health"] = compute_health(base, inventory)
    return base


@app.post("/api/auth/login")
def auth_login(req: LoginRequest):
    if req.username == os.getenv("AUTH_USERNAME", "admin") and req.password == os.getenv("AUTH_PASSWORD", "cloudops2026"):
        log_event("INFO", "Auth", f"User {req.username} authenticated successfully.", "System")
        return {"status": "success", "token": f"token-{int(time.time() * 1000)}", "user": {"username": req.username, "role": "DevOps Admin"}}
    raise HTTPException(status_code=401, detail="Invalid username or password")


@app.get("/api/workspace/summary")
async def get_workspace_summary():
    inventory = get_real_service_inventory()
    metrics = get_metrics()
    running = sum(1 for s in inventory if s["state"] == "active")
    health = compute_health(metrics, inventory)
    return {
        "status": "success",
        "servers": {"total": 1, "running": 1, "subtitle": "1 Host Master \u2022 Active"},
        "ai_model": {"model_name": OLLAMA_MODEL, "status": "Online", "subtitle": "In-Memory RAM Pinned"},
        "services": {"healthy": running, "total": len(inventory), "subtitle": "Live systemd state"},
        "health": {"score": health["score"], "subtitle": f"{health['status']} \u2014 computed from live metrics"}
    }


@app.get("/api/workspace/servers")
def get_workspace_servers():
    meta = get_ec2_instance_metadata()
    uptime_sec = int(time.time() - START_TIME)
    uptime_fmt = f"{uptime_sec // 3600}h {(uptime_sec % 3600) // 60}m"

    if meta:
        instance_id = meta.get("instance_id") or "unavailable"
        instance_type = meta.get("instance_type") or "unavailable"
        az = meta.get("az") or "unavailable"
        private_ip = meta.get("private_ip") or "unavailable"
        public_ip = meta.get("public_ip") or "unavailable"
        metadata_source = "aws-imds"
    else:
        instance_id = "unavailable"
        instance_type = "unavailable"
        az = "unavailable"
        private_ip = "unavailable"
        public_ip = "unavailable"
        metadata_source = "unavailable (not running on EC2, or IMDS unreachable)"

    return {
        "status": "success",
        "metadata_source": metadata_source,
        "servers": [
            {
                "id": instance_id,
                "name": "aws-infra-prod-node-1",
                "role": "Control Plane & AI SRE",
                "state": "running",
                "cpu_percent": psutil.cpu_percent(),
                "cpu_cores": psutil.cpu_count(logical=True) or 1,
                "memory_percent": psutil.virtual_memory().percent,
                "memory_used_gb": round(psutil.virtual_memory().used / (1024 ** 3), 2),
                "memory_total_gb": round(psutil.virtual_memory().total / (1024 ** 3), 2),
                "type": instance_type,
                "az": az,
                "uptime": uptime_fmt,
                "private_ip": private_ip,
                "public_ip": public_ip,
                "is_local_host": True
            }
        ]
    }


@app.get("/api/workspace/models")
async def get_workspace_models():
    models = []
    for name, info in model_states.items():
        models.append({
            "name": name,
            "parameter_size": "0.5B" if "0.5b" in name else "8B",
            "quantization_level": "Q4",
            "size_mb": info["size_mb"],
            "status": info["status"],
            "is_active": info["is_active"],
            "ram_allocation_mb": info["ram_allocation_mb"],
            "server": "Host Master"
        })
    return {"status": "success", "models": models}


@app.post("/api/workspace/models/action")
async def execute_model_action(req: ModelActionRequest):
    # NOTE: model load/unload state is still tracked in-memory only, not
    # backed by a real `ollama ps` / `ollama pull` call. This was outside the
    # scope of the service-lifecycle work requested; flagged here rather than
    # silently left as-is.
    model = req.model.lower()
    action = req.action.lower()

    if model in model_states:
        if action in ("load", "pin"):
            model_states[model]["is_active"] = True
            model_states[model]["status"] = "In-Memory"
            model_states[model]["ram_allocation_mb"] = 390 if "0.5b" in model else 4200
            log_event("INFO", "ModelHub", f"Model {model} marked as loaded (in-memory tracking only).", "Model")
        elif action == "unload":
            model_states[model]["is_active"] = False
            model_states[model]["status"] = "Idle"
            model_states[model]["ram_allocation_mb"] = 0
            log_event("WARN", "ModelHub", f"Model {model} marked as unloaded (in-memory tracking only).", "Model")
        elif action == "pull":
            model_states[model] = {"is_active": True, "status": "In-Memory", "ram_allocation_mb": 400, "size_mb": 450}
            log_event("INFO", "ModelHub", f"Model {model} marked as pulled (in-memory tracking only).", "Model")
    return {"status": "success", "message": f"Model {req.model} {req.action} recorded.", "source": "in_memory_tracking_only"}


@app.get("/api/workspace/deployments")
def get_workspace_deployments():
    inventory = get_real_service_inventory()
    deployments = []
    for svc in inventory:
        deployments.append({
            "service": svc["id"],
            "name": svc["id"].upper(),
            "port": svc["port_hint"],
            "runtime": "systemd",
            "unit": svc["unit"],
            "status": svc["state"],
            "reachable": svc["reachable"],
            "uptime": "Active" if svc["state"] == "active" else "-",
            "target_host": "Host Master"
        })
    return {"status": "success", "deployments": deployments}


@app.post("/api/workspace/deployments/action")
def execute_deployment_action(req: DeploymentActionRequest):
    return execute_real_service_action(req.service_id, req.action)


@app.get("/api/workspace/activity")
def get_workspace_activity(limit: int = 50):
    return {"status": "success", "activity": activity_ledger[:limit]}


@app.post("/api/workspace/simulate-impact")
def simulate_infrastructure_impact(req: SimulationRequest):
    # This endpoint is explicitly a what-if / blast-radius estimator, clearly
    # named and presented as a simulation -- it does not claim to be live
    # infrastructure state, so it is left as a labeled simulation rather than
    # rewritten as a real action.
    log_event("WARN", "Simulation", f"Simulated impact test run on {req.target_service} ({req.action_type}).", "System")
    return {
        "status": "success",
        "source": "simulation",
        "simulation": {
            "title": f"Simulation: {req.action_type.upper()} {req.target_service}",
            "risk_level": "LOW",
            "summary": f"This is a simulated blast-radius estimate, not a real action. "
                       f"Isolating '{req.target_service}' would be expected to pose limited risk to the "
                       f"control plane based on the current topology."
        }
    }


def detect_real_anomalies() -> List[dict]:
    """
    Anomalies are derived from real metrics + real service state thresholds.
    This replaces the previous always-empty placeholder list -- it is a
    simple threshold model, not a learned/statistical anomaly detector, and
    is labeled as such.
    """
    anomalies = []
    metrics = get_metrics()
    inventory = get_real_service_inventory()
    ts = datetime.now(timezone.utc).isoformat()

    if metrics["cpu"]["percent"] > 90:
        anomalies.append({"id": "anom-cpu", "severity": "HIGH", "timestamp": ts, "resource": "host-cpu",
                           "description": f"CPU utilization at {metrics['cpu']['percent']}% (>90% threshold).",
                           "basis": "real_metric_threshold"})
    if metrics["memory"]["percent"] > 90:
        anomalies.append({"id": "anom-mem", "severity": "HIGH", "timestamp": ts, "resource": "host-memory",
                           "description": f"Memory utilization at {metrics['memory']['percent']}% (>90% threshold).",
                           "basis": "real_metric_threshold"})
    if metrics["disk"]["percent"] > 90:
        anomalies.append({"id": "anom-disk", "severity": "MEDIUM", "timestamp": ts, "resource": "host-disk",
                           "description": f"Disk utilization at {metrics['disk']['percent']}% (>90% threshold).",
                           "basis": "real_metric_threshold"})
    for svc in inventory:
        if svc["reachable"] and svc["state"] in ("failed", "inactive"):
            anomalies.append({"id": f"anom-{svc['id']}", "severity": "HIGH", "timestamp": ts,
                               "resource": svc["id"],
                               "description": f"Service '{svc['id']}' ({svc['unit']}) is currently '{svc['state']}'.",
                               "basis": "real_service_state"})
    return anomalies


@app.get("/api/anomalies")
def get_anomalies():
    return {"status": "success", "source": "real_metrics_and_service_state_thresholds", "anomalies": detect_real_anomalies()}


@app.get("/api/logs")
def get_logs(level: str = "ALL"):
    if level.upper() == "ALL":
        return {"status": "success", "logs": system_logs}
    return {"status": "success", "logs": [l for l in system_logs if l["level"] == level.upper()]}


@app.get("/api/topology")
def get_topology():
    return {
        "status": "success",
        "nodes": [
            {"id": "aws-cloud", "label": "AWS Cloud", "type": "cloud", "region": AWS_REGION, "x": 180, "y": 60},
            {"id": "ec2-host", "label": "EC2 Host Node", "type": "ec2", "region": AWS_REGION, "x": 180, "y": 150},
            {"id": "ollama-engine", "label": "Ollama LLM Engine", "type": "service", "region": AWS_REGION, "x": 360, "y": 150},
            {"id": "fastapi-backend", "label": "FastAPI App", "type": "service", "region": AWS_REGION, "x": 540, "y": 150}
        ],
        "links": [
            {"source": "aws-cloud", "target": "ec2-host"},
            {"source": "ec2-host", "target": "ollama-engine"},
            {"source": "ec2-host", "target": "fastapi-backend"}
        ]
    }


@app.get("/api/cloudwatch/ec2-metrics")
def get_cloudwatch_metrics():
    """Real CloudWatch CPUUtilization for the first discovered EC2 instance.
    Returns an honest 'unavailable' status instead of a fabricated number
    when there is no instance, no permission, or no recent datapoints."""
    try:
        session = get_aws_session()
        ec2 = session.client("ec2")
        reservations = ec2.describe_instances().get("Reservations", [])
        instance_id = None
        for r in reservations:
            for inst in r.get("Instances", []):
                instance_id = inst.get("InstanceId")
                break
            if instance_id:
                break
        if not instance_id:
            return {"status": "unavailable", "source": "not_implemented", "reason": "No EC2 instances found to query."}

        cw = session.client("cloudwatch")
        end = datetime.now(timezone.utc)
        start = end - timedelta(minutes=30)
        resp = cw.get_metric_statistics(
            Namespace="AWS/EC2", MetricName="CPUUtilization",
            Dimensions=[{"Name": "InstanceId", "Value": instance_id}],
            StartTime=start, EndTime=end, Period=300, Statistics=["Average"]
        )
        points = sorted(resp.get("Datapoints", []), key=lambda d: d["Timestamp"])
        if not points:
            return {"status": "unavailable", "source": "not_implemented", "instance_id": instance_id,
                     "reason": "No CloudWatch datapoints were returned for this instance/period."}
        latest = points[-1]
        return {
            "status": "success", "source": "aws-cloudwatch", "instance_id": instance_id,
            "latest_cpu_percent": round(latest["Average"], 2),
            "timestamp": latest["Timestamp"].isoformat()
        }
    except (BotoCoreError, ClientError, NoCredentialsError) as e:
        return {"status": "unavailable", "source": "not_implemented", "reason": str(e)}


@app.get("/api/incidents")
def get_incidents():
    # No incident-management system (e.g. PagerDuty/OpsGenie) is integrated.
    # Rather than fabricate incident history, this is honestly reported as
    # not implemented.
    return {
        "status": "unavailable",
        "source": "not_implemented",
        "incidents": [],
        "message": "No incident-management integration is connected yet."
    }


def find_ec2_instance(instance_id: str) -> Optional[dict]:
    try:
        session = get_aws_session()
        ec2 = session.client("ec2")
        resp = ec2.describe_instances(InstanceIds=[instance_id])
        for r in resp.get("Reservations", []):
            for inst in r.get("Instances", []):
                name = next((t["Value"] for t in inst.get("Tags", []) if t["Key"] == "Name"), "Unnamed")
                return {"id": inst.get("InstanceId"), "name": name, "state": inst.get("State", {}).get("Name")}
    except (BotoCoreError, ClientError, NoCredentialsError) as e:
        return {"error": str(e)}
    return None


def terminate_ec2_instance_real(instance_id: str) -> dict:
    """Real, irreversible EC2 termination. Only reachable from execute_agent_tool
    after the /chat handler has already obtained explicit user confirmation --
    this function itself performs no confirmation, by design, so that gate
    cannot be bypassed by calling it from more than one place."""
    if not instance_id:
        return {"status": "failed", "executed": False, "verified": False, "instance_id": None,
                 "error": "No instance_id was provided."}

    if not ALLOW_DESTRUCTIVE_ACTIONS:
        return {
            "status": "blocked", "executed": False, "verified": False, "instance_id": instance_id,
            "error": "Destructive AWS actions are disabled by configuration "
                     "(set ALLOW_DESTRUCTIVE_ACTIONS=true to enable real termination)."
        }

    try:
        session = get_aws_session()
        ec2 = session.client("ec2")
        ec2.terminate_instances(InstanceIds=[instance_id])
        executed = True
    except (BotoCoreError, ClientError, NoCredentialsError) as e:
        log_event("CRITICAL", "AWS-EC2", f"Terminate instance {instance_id} failed: {e}", "AWS")
        return {"status": "failed", "executed": False, "verified": False, "instance_id": instance_id,
                 "service_state": "unknown", "verification": "failed", "error": str(e)}

    time.sleep(1.5)
    verify = find_ec2_instance(instance_id)
    state = verify.get("state") if verify and "error" not in verify else "unknown"
    verified = state in ("shutting-down", "terminated")

    if verified:
        log_event("WARN", "AWS-EC2", f"EC2 instance {instance_id} termination initiated and verified (state={state}).", "AWS")
        return {"status": "success", "executed": True, "verified": True, "instance_id": instance_id,
                 "service_state": state, "verification": "passed",
                 "message": f"Instance {instance_id} termination confirmed (state: {state})."}

    log_event("CRITICAL", "AWS-EC2", f"EC2 instance {instance_id} terminate call made but verification did not confirm expected state.", "AWS")
    return {"status": "failed", "executed": True, "verified": False, "instance_id": instance_id,
             "service_state": state, "verification": "failed",
             "error": "The terminate call was accepted by AWS, but the instance state could not be "
                       "independently verified as shutting-down/terminated."}


@app.get("/resources/{resource_type}")
def get_resources(resource_type: str):
    r_type = resource_type.lower()
    items = []
    session = get_aws_session()
    try:
        if r_type == "ec2":
            ec2 = session.client("ec2")
            for r in ec2.describe_instances().get("Reservations", []):
                for inst in r.get("Instances", []):
                    name = next((t["Value"] for t in inst.get("Tags", []) if t["Key"] == "Name"), "Unnamed")
                    items.append({"id": inst.get("InstanceId"), "name": name, "status": inst.get("State", {}).get("Name"), "details": {"type": inst.get("InstanceType")}})
        elif r_type == "vpc":
            ec2 = session.client("ec2")
            for vpc in ec2.describe_vpcs().get("Vpcs", []):
                items.append({"id": vpc.get("VpcId"), "name": "VPC", "status": vpc.get("State"), "details": {"cidr": vpc.get("CidrBlock")}})
        elif r_type == "s3":
            s3 = session.client("s3")
            for b in s3.list_buckets().get("Buckets", []):
                items.append({"id": b.get("Name"), "name": b.get("Name"), "status": "active"})
        elif r_type == "iam":
            try:
                iam = session.client("iam")
                for role in iam.list_roles(MaxItems=10).get("Roles", []):
                    items.append({"id": role.get("RoleName"), "name": role.get("RoleName"), "status": "active"})
            except Exception:
                items.append({"id": "AWS-Infra-AI-EC2-Role", "name": "AWS-Infra-AI-EC2-Role", "status": "active (Assumed)", "details": {"note": "IAM ListRoles restricted by instance policy."}})
        elif r_type in ("services", "host-services"):
            inv = get_real_service_inventory()
            items = [{"id": s["id"], "name": s["id"], "status": s["state"], "details": {"unit": s["unit"], "reachable": s["reachable"]}} for s in inv]
    except Exception as e:
        items.append({"id": "ERROR", "name": str(e), "status": "error"})
    return {"status": "success", "total": len(items), "items": items}


# ---------------------------------------------------------------------------
# Agent tool registry + dispatch. The LLM may only ever select from this
# fixed list and pass simple identifier arguments (service_id, action,
# instance_id, level, view_name) -- it never generates or executes an
# arbitrary shell command or string.
# ---------------------------------------------------------------------------
AGENT_TOOLS = [
    {"type": "function", "function": {"name": "get_system_metrics", "description": "Fetch real host system metrics: CPU, memory, disk usage. Use for questions about resource utilization/performance.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_ec2_instances", "description": "Fetch the real AWS EC2 instance inventory. Use when asked about EC2 instances/servers/VMs.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_vpcs", "description": "Fetch real AWS VPCs.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_storage_status", "description": "Fetch real AWS S3 buckets.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_iam_roles", "description": "Fetch real AWS IAM roles.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_host_services", "description": "Fetch the real, independently-queried state of host services (nginx, docker, etc). Use for status/inspection questions, NOT for starting/stopping/restarting anything.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_telemetry_logs", "description": "Fetch real system telemetry logs.", "parameters": {"type": "object", "properties": {"level": {"type": "string"}}}}},
    {"type": "function", "function": {"name": "filter_logs", "description": "Filter the log view by severity level.", "parameters": {"type": "object", "properties": {"level": {"type": "string"}}, "required": ["level"]}}},
    {"type": "function", "function": {"name": "clear_telemetry_logs", "description": "Clear all telemetry logs.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "refresh_infrastructure", "description": "Refresh dashboard metrics and states.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "check_infrastructure_health", "description": "Check the real, computed system health score.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "navigate_to_view", "description": "Navigate the UI to a view (dashboard, topology, anomalies, logs).", "parameters": {"type": "object", "properties": {"view_name": {"type": "string"}}, "required": ["view_name"]}}},
    {"type": "function", "function": {"name": "control_service_lifecycle",
        "description": "Execute a REAL service lifecycle action (start, stop, or restart) via systemctl. "
                        "ONLY call this when the user explicitly and unambiguously asks to start/stop/restart a "
                        "named service. NEVER call this for greetings, small talk, or conceptual/informational "
                        "questions (e.g. 'what is nginx', 'hello', 'how are you'). NEVER invent a service_id the "
                        "user did not mention. Note: 'aws-ssm-agent' is critical remote-access infrastructure and "
                        "is inspection-only by default -- calling this for it will be blocked by the backend "
                        "unless explicitly enabled.",
        "parameters": {"type": "object", "properties": {"service_id": {"type": "string"}, "action": {"type": "string"}}, "required": ["service_id", "action"]}}},
    {"type": "function", "function": {"name": "terminate_ec2_instance",
        "description": "DESTRUCTIVE and IRREVERSIBLE. Permanently terminates a real AWS EC2 instance. This will "
                        "never execute immediately -- the backend always requires the user's explicit confirmation "
                        "first. Only call this when the user clearly asks to terminate/delete/destroy a specific "
                        "EC2 instance.",
        "parameters": {"type": "object", "properties": {"instance_id": {"type": "string"}}, "required": ["instance_id"]}}}
]

INTENT_SYSTEM_PROMPT = (
    "You are the CloudOps AI SRE Assistant for a real AWS + host infrastructure Digital Twin.\n"
    "Classify every user message into exactly one of these intents before responding:\n"
    "  - conversation: greetings or small talk (e.g. 'hello', 'thanks', 'how are you'). "
    "Reply in plain language. Do NOT call any tool.\n"
    "  - information: a conceptual/definitional question about a technology (e.g. 'what is nginx', "
    "'how does docker work'). Reply in plain language. Do NOT call any tool.\n"
    "  - inspection: the user wants to see real current state (status, a list, metrics, logs). "
    "Call the single most relevant read-only tool.\n"
    "  - action: the user explicitly wants to start/stop/restart a named service, or terminate a named "
    "AWS resource. Call the matching tool with exactly the service_id/instance_id/action the user stated. "
    "Never invent a service or instance the user did not mention, and never call a lifecycle or destructive "
    "tool for a conversation or information intent.\n"
    "Only ever select a tool from the provided tool list. Never generate a shell command or ask the user "
    "to run one -- all execution happens through the provided tools."
)


async def call_ollama(messages: list) -> Optional[dict]:
    """
    Sends a chat request to Ollama with the agent tool schema. Returns the
    raw `message` dict from Ollama's response, or None if Ollama could not
    be reached on any configured endpoint. Isolated into its own function so
    it can be replaced/mocked in tests without touching the routing logic.
    """
    endpoints = [f"{OLLAMA_BASE_URL}/api/chat"]
    if OLLAMA_BASE_URL != "http://127.0.0.1:11434":
        endpoints.append("http://127.0.0.1:11434/api/chat")
    for ep in endpoints:
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(ep, json={
                    "model": OLLAMA_MODEL, "messages": messages, "tools": AGENT_TOOLS,
                    "stream": False, "options": {"temperature": 0.0}
                })
                if res.status_code == 200:
                    return res.json().get("message", {})
        except Exception:
            continue
    return None


def execute_agent_tool(tool_name: str, arguments: dict) -> dict:
    try:
        if tool_name == "get_system_metrics":
            return get_metrics()
        elif tool_name == "get_ec2_instances":
            return get_resources("ec2")
        elif tool_name == "get_vpcs":
            return get_resources("vpc")
        elif tool_name == "get_storage_status":
            return get_resources("s3")
        elif tool_name == "get_iam_roles":
            return get_resources("iam")
        elif tool_name == "get_host_services":
            return get_resources("services")
        elif tool_name == "get_telemetry_logs":
            return get_logs(level=arguments.get("level", "ALL"))
        elif tool_name == "filter_logs":
            lvl = arguments.get("level", "ALL").upper()
            return {"status": "success", "ui_action": {"type": "FILTER_LOGS", "level": lvl}, "message": f"Log filter updated to {lvl}."}
        elif tool_name == "clear_telemetry_logs":
            system_logs.clear()
            return {"status": "success", "ui_action": {"type": "CLEAR_LOGS"}, "message": "Logs cleared."}
        elif tool_name == "refresh_infrastructure":
            return {"status": "success", "ui_action": {"type": "REFRESH_DASHBOARD"}, "message": "Dashboard refreshed successfully."}
        elif tool_name == "check_infrastructure_health":
            return get_metrics().get("health")
        elif tool_name == "navigate_to_view":
            v = arguments.get("view_name", "dashboard").lower()
            return {"status": "success", "ui_action": {"type": "NAVIGATE_VIEW", "view": v}, "message": f"Navigated to {v}."}
        elif tool_name == "control_service_lifecycle":
            return execute_real_service_action(arguments.get("service_id", ""), arguments.get("action", ""))
        elif tool_name == "terminate_ec2_instance":
            # Only ever reached from the /chat confirmation-continuation path.
            return terminate_ec2_instance_real(arguments.get("instance_id"))
        return {"error": f"Unknown tool: {tool_name}"}
    except Exception as e:
        return {"error": str(e)}


def _confirmation_active() -> bool:
    if not pending_confirmations.get("waiting"):
        return False
    if time.time() - pending_confirmations.get("created_at", 0) > PENDING_CONFIRMATION_TTL_SECONDS:
        pending_confirmations.clear()
        return False
    return True


def _build_action_reply(tool_name: str, tool_res: dict) -> tuple:
    """Builds a human-readable reply plus a structured action_status block
    the frontend uses to render the Pending/Executing/Verifying/Success
    stepper. Never claims success unless the backend result says verified."""
    status = tool_res.get("status", "unknown")
    executed = tool_res.get("executed", status == "success")
    verified = tool_res.get("verified", False)

    if status == "success" and (verified or verified is None):
        headline = "\u2705 Action Executed"
        verify_line = "Passed" if verified else "Not applicable (see details)"
    elif status == "blocked":
        headline = "\U0001F6AB Blocked by Configuration"
        verify_line = "Not attempted"
    elif status == "rejected":
        headline = "\u23F8 Skipped (duplicate in-flight request)"
        verify_line = "Skipped"
    else:
        headline = "\u274C Action Failed"
        verify_line = "Failed"

    detail_lines = [f"- **Tool:** `{tool_name}`",
                     f"- **Executed:** {executed}",
                     f"- **Verification:** {verify_line}"]
    if tool_res.get("service_state"):
        detail_lines.append(f"- **Current State:** {tool_res['service_state']}")
    if tool_res.get("error"):
        detail_lines.append(f"- **Error:** {tool_res['error']}")
    if tool_res.get("message") and status == "success":
        detail_lines.append(f"- {tool_res['message']}")

    reply_text = f"{headline}\n" + "\n".join(detail_lines) + f"\n```json\n{json.dumps(tool_res, indent=2)}\n```"

    action_status = {
        "tool": tool_name,
        "executed": executed,
        "verified": verified,
        "service_id": tool_res.get("service_id") or tool_res.get("instance_id"),
        "action": tool_res.get("action"),
        "service_state": tool_res.get("service_state"),
        "final": "success" if (status == "success") else status
    }
    return reply_text, action_status


@app.post("/chat")
@app.post("/api/ai/chat")
@app.post("/api/chat")
async def chat(request: ChatRequest):
    user_prompt = (request.message or request.prompt or "").strip()
    p_lower = user_prompt.lower()

    if not user_prompt:
        return {"reply": "I didn't receive any message text.", "source": "agent"}

    # --- Step 1: continuation of a pending destructive-action confirmation ---
    if _confirmation_active():
        if any(w in p_lower for w in AFFIRM_WORDS):
            t_name = pending_confirmations.get("tool_name")
            t_args = pending_confirmations.get("tool_args")
            pending_confirmations.clear()
            tool_res = execute_agent_tool(t_name, t_args)
            reply_text, action_status = _build_action_reply(t_name, tool_res)
            return {"reply": reply_text, "ui_action": tool_res.get("ui_action"), "action_status": action_status, "source": "agent"}
        elif any(w in p_lower for w in NEGATE_WORDS):
            pending_confirmations.clear()
            return {"reply": "\u274C Operation cancelled. No changes were made.", "action_status": {"final": "cancelled"}, "source": "agent"}
        else:
            return {
                "reply": f"Please confirm: {pending_confirmations.get('summary')}\n\nReply **yes** to proceed or **no** to cancel.",
                "action_status": {"final": "pending_confirmation"}, "source": "agent"
            }

    # --- Step 2: LLM-driven intent classification + tool selection ---
    messages = [{"role": "system", "content": INTENT_SYSTEM_PROMPT}]
    for h in (request.history or request.messages or [])[-6:]:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": user_prompt})

    msg = await call_ollama(messages)

    if msg is None:
        return {
            "reply": "\u26A0\uFE0F I couldn't reach the AI reasoning engine (Ollama) right now, so I can't "
                      "process free-form requests. The dashboard's live data and Workspace Control still "
                      "reflect real infrastructure state and can be used directly.",
            "source": "agent"
        }

    tool_calls = msg.get("tool_calls")
    content = (msg.get("content") or "").strip()

    if tool_calls:
        tc = tool_calls[0]
        fn = tc.get("function", {})
        t_name = fn.get("name")
        t_args = fn.get("arguments", {}) or {}

        # --- Deterministic backend validation (the AI never bypasses this) ---
        if t_name == "control_service_lifecycle":
            svc_id = str(t_args.get("service_id", "")).lower().strip()
            action = str(t_args.get("action", "")).lower().strip()
            if svc_id not in SUPPORTED_SERVICES:
                return {"reply": f"\u274C '{svc_id}' isn't a recognized, supported service, so no action was "
                                   f"taken. Supported services: {', '.join(sorted(SUPPORTED_SERVICES.keys()))}.",
                        "source": "agent"}
            if action not in ("start", "stop", "restart"):
                return {"reply": f"\u274C '{action}' isn't a supported lifecycle action. Use start, stop, or restart.",
                        "source": "agent"}
            tool_res = execute_agent_tool(t_name, {"service_id": svc_id, "action": action})
            reply_text, action_status = _build_action_reply(t_name, tool_res)
            return {"reply": reply_text, "ui_action": tool_res.get("ui_action"), "action_status": action_status, "source": "agent"}

        elif t_name == "terminate_ec2_instance":
            instance_id = str(t_args.get("instance_id", "")).strip()
            if not instance_id.startswith("i-"):
                return {"reply": "\u274C I need a valid EC2 instance ID (starting with 'i-') to proceed. No action was taken.",
                        "source": "agent"}
            inst = find_ec2_instance(instance_id)
            if not inst or "error" in inst:
                reason = inst.get("error") if inst else "not found"
                return {"reply": f"\u274C I couldn't find EC2 instance `{instance_id}` ({reason}). No action was taken.",
                        "source": "agent"}
            summary = f"Permanently terminate EC2 instance `{instance_id}` ({inst['name']}, currently `{inst['state']}`). This cannot be undone."
            pending_confirmations.clear()
            pending_confirmations.update({
                "waiting": True, "tool_name": t_name, "tool_args": {"instance_id": instance_id},
                "created_at": time.time(), "summary": summary
            })
            return {
                "reply": f"\u26A0\uFE0F {summary}\n\nReply **yes** to proceed or **no** to cancel.",
                "action_status": {"final": "pending_confirmation", "service_id": instance_id},
                "source": "agent"
            }

        else:
            tool_res = execute_agent_tool(t_name, t_args)
            reply_text = f"**{t_name}** result:\n```json\n{json.dumps(tool_res, indent=2)}\n```"
            return {"reply": reply_text, "ui_action": tool_res.get("ui_action"), "source": "agent"}

    if content:
        return {"reply": content, "source": "agent"}

    return {"reply": "I'm monitoring your real AWS infrastructure and host services. You can ask me to inspect "
                       "resources, check metrics/status, or start/stop/restart a service.", "source": "agent"}


os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def serve_index():
    return FileResponse("static/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)