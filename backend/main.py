"""Linacre Wallpaper Backend - Real-time system stats via WebSocket."""
import asyncio
import json
import signal
import sys
import os
import subprocess
import platform
from contextlib import asynccontextmanager
from typing import Set, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

from config import settings
from models import SystemStats, WSMessage, StatsResponse
from collectors import collect_all


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._broadcast_task: asyncio.Task | None = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        print(f"Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        print(f"Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: WSMessage):
        """Send message to all connected clients."""
        if not self.active_connections:
            return

        data = message.model_dump_json()
        disconnected = set()

        for connection in self.active_connections:
            try:
                await connection.send_text(data)
            except Exception:
                disconnected.add(connection)

        for conn in disconnected:
            self.disconnect(conn)

    async def start_broadcast_loop(self):
        """Periodic broadcast of system stats."""
        while True:
            try:
                stats = await collect_all()
                message = WSMessage(type="stats", payload=stats.model_dump(mode="json"))
                await self.broadcast(message)
            except Exception as e:
                print(f"Broadcast error: {e}")
                error_msg = WSMessage(type="error", payload={"message": str(e)})
                await self.broadcast(error_msg)

            await asyncio.sleep(settings.ws_interval)

    async def stop_broadcast_loop(self):
        if self._broadcast_task:
            self._broadcast_task.cancel()
            try:
                await self._broadcast_task
            except asyncio.CancelledError:
                pass


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    manager._broadcast_task = asyncio.create_task(manager.start_broadcast_loop())
    print(f"Linacre Wallpaper Backend started on http://{settings.host}:{settings.port}")
    print(f"WebSocket: ws://{settings.host}:{settings.port}{settings.ws_path}")
    yield
    # Shutdown
    await manager.stop_broadcast_loop()
    print("Backend stopped.")


app = FastAPI(
    title="Linacre Wallpaper Backend",
    description="Real-time system statistics for linacre.site themed wallpaper",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "linacre-wallpaper-backend"}


@app.get(f"{settings.api_prefix}/stats", response_model=StatsResponse)
async def get_stats():
    """Single-shot stats fetch (for initial load)."""
    stats = await collect_all()
    return StatsResponse(
        data=stats,
        meta={"interval": settings.ws_interval}
    )


@app.get(f"{settings.api_prefix}/config")
async def get_config():
    """Frontend configuration."""
    return {
        "ws_interval": settings.ws_interval,
        "gpu_enabled": settings.gpu_enabled,
        "docker_enabled": settings.docker_enabled,
        "custom_services": list(settings.custom_services.keys()),
    }


# Action endpoints for command palette
class ActionRequest(BaseModel):
    target: str
    params: Dict[str, Any] = {}


@app.post(f"{settings.api_prefix}/action/service/{{action}}")
async def service_action(action: str, request: ActionRequest):
    """Handle service actions: restart, stop, start."""
    target = request.target
    if action not in ("restart", "stop", "start"):
        raise HTTPException(400, "Invalid action")

    # Map service name to systemd service or process pattern
    service_map = {k.lower(): v for k, v in settings.custom_services.items()}
    patterns = service_map.get(target.lower(), [])

    if not patterns:
        raise HTTPException(404, f"Service '{target}' not configured")

    try:
        if platform.system() == "Windows":
            # Find and kill process(es) matching patterns
            import psutil
            killed = []
            for proc in psutil.process_iter(["pid", "name", "cmdline"]):
                try:
                    info = proc.info
                    cmdline = " ".join(info["cmdline"] or []).lower()
                    proc_name = (info["name"] or "").lower()
                    if any(p.lower() in cmdline or p.lower() in proc_name for p in patterns):
                        if action == "restart" or action == "stop":
                            proc.terminate()
                            killed.append(info["pid"])
                        elif action == "start":
                            # Can't easily start arbitrary process without knowing full command
                            pass
                except Exception:
                    continue

            if action == "restart" and killed:
                # Try to restart - would need the original command
                pass

            return {"success": True, "action": action, "target": target, "affected_pids": killed}
        else:
            # Linux: use systemctl
            service_name = target.lower().replace(" ", "-")
            result = subprocess.run(
                ["systemctl", action, service_name],
                capture_output=True, text=True, timeout=30
            )
            return {"success": result.returncode == 0, "action": action, "target": target, "output": result.stdout or result.stderr}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post(f"{settings.api_prefix}/action/docker/{{action}}")
async def docker_action(action: str, request: ActionRequest):
    """Handle Docker actions: start, stop, restart, logs, remove."""
    target = request.target
    if action not in ("start", "stop", "restart", "logs", "remove"):
        raise HTTPException(400, "Invalid action")

    if not settings.docker_enabled:
        raise HTTPException(503, "Docker monitoring not enabled")

    try:
        import docker
        client = docker.DockerClient(base_url=settings.docker_socket)
        container = client.containers.get(target)

        if action == "logs":
            logs = container.logs(tail=100).decode("utf-8", errors="replace")
            return {"success": True, "action": action, "target": target, "logs": logs}

        getattr(container, action)()
        return {"success": True, "action": action, "target": target}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post(f"{settings.api_prefix}/action/process/{{action}}")
async def process_action(action: str, request: ActionRequest):
    """Handle process actions: kill (signal 15 or 9)."""
    target = request.target
    if action != "kill":
        raise HTTPException(400, "Invalid action")

    signal_num = request.params.get("signal", 15)  # SIGTERM default

    try:
        import psutil
        proc = psutil.Process(int(target))
        if signal_num == 9:
            proc.kill()
        else:
            proc.terminate()
        return {"success": True, "action": action, "pid": target, "signal": signal_num}
    except psutil.NoSuchProcess:
        raise HTTPException(404, f"Process {target} not found")
    except psutil.AccessDenied:
        raise HTTPException(403, f"Permission denied to kill process {target}")
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post(f"{settings.api_prefix}/action/system/{{action}}")
async def system_action(action: str):
    """Handle system actions: terminal, taskmgr."""
    if action not in ("terminal", "taskmgr"):
        raise HTTPException(400, "Invalid action")

    try:
        if platform.system() == "Windows":
            if action == "terminal":
                subprocess.Popen(["wt.exe"], start_new_session=True)
            elif action == "taskmgr":
                subprocess.Popen(["taskmgr.exe"], start_new_session=True)
        else:
            # Linux: try common terminals
            if action == "terminal":
                for term in ["gnome-terminal", "konsole", "xfce4-terminal", "alacritty", "kitty", "xterm"]:
                    try:
                        subprocess.Popen([term], start_new_session=True)
                        break
                    except FileNotFoundError:
                        continue
        return {"success": True, "action": action}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.websocket(settings.ws_path)
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial stats immediately
        stats = await collect_all()
        await websocket.send_text(
            WSMessage(type="stats", payload=stats.model_dump(mode="json")).model_dump_json()
        )

        # Keep connection alive, handle client messages
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(
                        WSMessage(type="pong", payload={}).model_dump_json()
                    )
                elif msg.get("type") == "refresh":
                    # Force immediate stats update
                    stats = await collect_all()
                    await websocket.send_text(
                        WSMessage(type="stats", payload=stats.model_dump(mode="json")).model_dump_json()
                    )
                elif msg.get("type", "").startswith("service:"):
                    # Handle service commands via WS: service:restart:name, service:kill:name
                    parts = msg["type"].split(":")
                    if len(parts) == 3:
                        _, action, name = parts
                        # Process similarly to REST endpoint
                        import psutil
                        patterns = settings.custom_services.get(name, [])
                        for proc in psutil.process_iter(["pid", "name", "cmdline"]):
                            try:
                                info = proc.info
                                cmdline = " ".join(info["cmdline"] or []).lower()
                                proc_name = (info["name"] or "").lower()
                                if any(p.lower() in cmdline or p.lower() in proc_name for p in patterns):
                                    if action in ("restart", "stop"):
                                        proc.terminate()
                            except Exception:
                                continue
                elif msg.get("type", "").startswith("docker:"):
                    # docker:action:name
                    parts = msg["type"].split(":")
                    if len(parts) == 3:
                        _, action, name = parts
                        if action in ("start", "stop", "restart", "remove"):
                            try:
                                import docker
                                client = docker.DockerClient(base_url=settings.docker_socket)
                                container = client.containers.get(name)
                                getattr(container, action)()
                            except Exception:
                                pass
                elif msg.get("type", "").startswith("process:kill:"):
                    # process:kill:pid:signal
                    parts = msg["type"].split(":")
                    if len(parts) == 4:
                        _, _, pid, signal = parts
                        try:
                            import psutil
                            proc = psutil.Process(int(pid))
                            if int(signal) == 9:
                                proc.kill()
                            else:
                                proc.terminate()
                        except Exception:
                            pass
                elif msg.get("type", "").startswith("system:"):
                    # system:terminal, system:taskmgr
                    parts = msg["type"].split(":")
                    if len(parts) == 2:
                        _, action = parts
                        if platform.system() == "Windows":
                            if action == "terminal":
                                subprocess.Popen(["wt.exe"], start_new_session=True)
                            elif action == "taskmgr":
                                subprocess.Popen(["taskmgr.exe"], start_new_session=True)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        manager.disconnect(websocket)


def main():
    """Entry point for console script."""
    import uvicorn

    def signal_handler(sig, frame):
        print("\nShutdown signal received.")
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        reload=False,
        access_log=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()