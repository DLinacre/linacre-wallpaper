"""Pydantic models for system statistics."""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class Unit(str, Enum):
    BYTES = "bytes"
    PERCENT = "percent"
    CELSIUS = "celsius"
    MHZ = "mhz"
    GHZ = "ghz"
    MBPS = "mbps"
    COUNT = "count"


class Metric(BaseModel):
    """Single metric with value, unit, and optional status."""
    label: str
    value: float | int | str
    unit: Unit = Unit.COUNT
    status: Optional[str] = None  # "ok", "warning", "critical"
    trend: Optional[List[float]] = None  # Mini sparkline data


class CPUCore(BaseModel):
    core: int
    usage: float
    frequency: Optional[float] = None


class CPUStats(BaseModel):
    total_usage: float
    per_core: List[CPUCore]
    frequency_current: float
    frequency_max: float
    temperature: Optional[float] = None
    load_1m: Optional[float] = None
    load_5m: Optional[float] = None
    load_15m: Optional[float] = None


class MemoryStats(BaseModel):
    total: int
    used: int
    available: int
    free: int
    percent: float
    swap_total: int
    swap_used: int
    swap_percent: float


class DiskPartition(BaseModel):
    device: str
    mountpoint: str
    fstype: str
    total: int
    used: int
    free: int
    percent: float
    read_bytes_sec: float = 0
    write_bytes_sec: float = 0


class DiskStats(BaseModel):
    partitions: List[DiskPartition]
    total_read_bps: float
    total_write_bps: float
    io_read_count: int
    io_write_count: int


class NetworkInterface(BaseModel):
    name: str
    bytes_sent: int
    bytes_recv: int
    packets_sent: int
    packets_recv: int
    errin: int
    errout: int
    dropin: int
    dropout: int
    speed_mbps: Optional[float] = None
    is_up: bool = True
    sent_bps: float = 0
    recv_bps: float = 0


class NetworkStats(BaseModel):
    interfaces: List[NetworkInterface]
    total_sent_bps: float
    total_recv_bps: float


class GPUStats(BaseModel):
    name: str
    gpu_usage: float
    memory_used: int
    memory_total: int
    memory_percent: float
    temperature: Optional[float] = None
    power_draw: Optional[float] = None
    power_limit: Optional[float] = None
    clock_core: Optional[int] = None
    clock_memory: Optional[int] = None
    driver_version: Optional[str] = None


class DockerContainer(BaseModel):
    id: str
    name: str
    image: str
    status: str  # running, exited, paused, restarting
    cpu_percent: float
    memory_usage: int
    memory_limit: int
    memory_percent: float
    network_rx: int
    network_tx: int
    block_read: int
    block_write: int
    started_at: Optional[str] = None
    ports: List[str] = []


class DockerStats(BaseModel):
    containers: List[DockerContainer]
    total_containers: int
    running_containers: int
    total_cpu_percent: float
    total_memory_usage: int
    total_memory_limit: int


class ProcessInfo(BaseModel):
    pid: int
    name: str
    cpu_percent: float
    memory_percent: float
    memory_mb: float
    status: str
    username: Optional[str] = None
    cmdline: Optional[str] = None
    create_time: float


class ServiceStatus(BaseModel):
    name: str
    running: bool
    pid: Optional[int] = None
    cpu_percent: float = 0
    memory_mb: float = 0
    uptime_seconds: Optional[float] = None
    ports: List[int] = []


class SystemStats(BaseModel):
    """Complete system snapshot."""
    timestamp: datetime = Field(default_factory=datetime.now)
    hostname: str
    os: str
    uptime_seconds: float
    boot_time: datetime

    cpu: CPUStats
    memory: MemoryStats
    disk: DiskStats
    network: NetworkStats
    gpu: Optional[GPUStats] = None
    docker: Optional[DockerStats] = None
    top_processes: List[ProcessInfo] = []
    services: List[ServiceStatus] = []


class WSMessage(BaseModel):
    """WebSocket message envelope."""
    type: str  # "stats", "error", "pong"
    payload: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.now)


# Backwards compatibility for initial HTTP fetch
class StatsResponse(BaseModel):
    success: bool = True
    data: SystemStats
    meta: Dict[str, Any] = {}