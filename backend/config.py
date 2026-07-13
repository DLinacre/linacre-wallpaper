"""Configuration for linacre-wallpaper backend."""
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import List, Optional, Dict
import json


class Settings(BaseSettings):
    # Server
    host: str = "127.0.0.1"
    port: int = 8765
    ws_path: str = "/ws"
    api_prefix: str = "/api"

    # Update intervals (seconds)
    ws_interval: float = 1.5  # WebSocket push interval
    gpu_interval: float = 2.0  # GPU polling (slower, heavier)
    docker_interval: float = 3.0  # Docker polling

    # GPU
    gpu_enabled: bool = True
    gpu_backend: str = "auto"  # auto, nvidia, amd, intel

    # Docker
    docker_enabled: bool = True
    docker_socket: str = "npipe:////./pipe/docker_engine"  # Windows named pipe

    # Custom services to monitor (name -> process match patterns)
    custom_services: Dict[str, List[str]] = {
        "GhostMail": ["ghostmail", "smtp"],
        "DomainDeals": ["domaindeals", "next-server"],
        "linacre.site": ["linacre", "vite", "node"],
        "PostgreSQL": ["postgres"],
        "Redis": ["redis-server"],
        "Ollama": ["ollama"],
    }

    # Process filters for "top processes"
    top_process_count: int = 12
    ignore_processes: List[str] = [
        "System", "Registry", "smss.exe", "csrss.exe", "wininit.exe",
        "services.exe", "lsass.exe", "svchost.exe", "fontdrvhost.exe",
        "dwm.exe", "taskhostw.exe", "explorer.exe", "ShellExperienceHost.exe",
        "TextInputHost.exe", "RuntimeBroker.exe", "SearchIndexer.exe",
        "SecurityHealthService.exe", "WmiPrvSE.exe"
    ]

    # Network interfaces to monitor (empty = all)
    network_interfaces: List[str] = []

    # Disk mounts to monitor (empty = all)
    disk_mounts: List[str] = []

    # CORS for Lively Wallpaper (file:// origin)
    cors_origins: List[str] = ["*"]

    # Action endpoints enabled
    actions_enabled: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Parse custom_services from JSON string if provided via env
        if isinstance(self.custom_services, str):
            try:
                self.custom_services = json.loads(self.custom_services)
            except Exception:
                pass


settings = Settings()