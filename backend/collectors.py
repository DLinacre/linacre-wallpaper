"""System statistics collectors."""
import json
import psutil
import platform
import socket
import subprocess
import time
import asyncio
from concurrent.futures import ThreadPoolExecutor, wait
from typing import List, Optional, Dict, Any
from datetime import datetime
from collections import deque

from models import (
    CPUStats, CPUCore, MemoryStats, DiskStats, DiskPartition,
    NetworkStats, NetworkInterface, GPUStats, DockerStats, DockerContainer,
    ProcessInfo, ServiceStatus, SystemStats
)
from config import settings


# GPU collector (optional)
_gpu_available = False
_gpu_backend = None
_gpu_handle = None

try:
    import GPUtil
    _gpu_available = True
    _gpu_backend = "gputil"
except ImportError:
    pass

try:
    import pynvml
    pynvml.nvmlInit()
    _gpu_available = True
    _gpu_backend = "nvml"
except Exception:
    pass

# Docker collector (optional)
_docker_client = None
_docker_available = False

try:
    import docker
    _docker_client = docker.DockerClient(base_url=settings.docker_socket)
    _docker_client.ping()
    _docker_available = True
except Exception:
    _docker_client = None
    _docker_available = False


# Rolling history for sparklines (keep last 60 points = ~90s at 1.5s interval)
_history: Dict[str, deque] = {
    "cpu_total": deque(maxlen=60),
    "memory_percent": deque(maxlen=60),
    "gpu_usage": deque(maxlen=60),
    "gpu_memory": deque(maxlen=60),
    "net_sent": deque(maxlen=60),
    "net_recv": deque(maxlen=60),
    "disk_read": deque(maxlen=60),
    "disk_write": deque(maxlen=60),
}

_prev_net_io = None
_prev_disk_io = None
_prev_time = time.time()


def _to_str(v) -> str:
    """NVML bindings return bytes on old versions and str on newer ones."""
    return v.decode() if isinstance(v, (bytes, bytearray)) else str(v)


def _get_trend(key: str) -> List[float]:
    """Get sparkline data for a metric."""
    return list(_history.get(key, []))


def collect_cpu() -> CPUStats:
    """Collect CPU statistics."""
    # Total usage (non-blocking, uses cached)
    total_usage = psutil.cpu_percent(interval=None)

    # Per-core usage
    per_core_pct = psutil.cpu_percent(interval=None, percpu=True)
    per_core = [
        CPUCore(core=i, usage=pct)
        for i, pct in enumerate(per_core_pct)
    ]

    # Frequency
    freq = psutil.cpu_freq()
    freq_current = freq.current if freq else 0
    freq_max = freq.max if freq and freq.max else 0

    # Temperature (Linux via psutil, Windows via WMI fallback)
    temperature = None
    try:
        temps = psutil.sensors_temperatures()
        if temps:
            for name, entries in temps.items():
                if "cpu" in name.lower() or "core" in name.lower() or "k10temp" in name.lower():
                    for entry in entries:
                        if entry.current:
                            temperature = entry.current
                            break
                if temperature:
                    break
    except Exception:
        if platform.system() == "Windows":
            try:
                import subprocess
                result = subprocess.run(
                    ["wmic", "path", "Win32_PerfFormattedData_Counters_ThermalZoneInformation", "get", "Temperature"],
                    capture_output=True, text=True, timeout=5
                )
                for line in result.stdout.strip().splitlines():
                    line = line.strip()
                    if line and line != "Temperature" and line.isdigit():
                        temperature = int(line) / 10.0 - 273.15
                        break
            except Exception:
                pass

    # Load average (Unix only)
    load_1m = load_5m = load_15m = None
    try:
        load_1m, load_5m, load_15m = psutil.getloadavg()
    except Exception:
        pass

    # Update history
    _history["cpu_total"].append(total_usage)

    return CPUStats(
        total_usage=round(total_usage, 1),
        per_core=per_core,
        frequency_current=round(freq_current, 0),
        frequency_max=round(freq_max, 0),
        temperature=round(temperature, 1) if temperature else None,
        load_1m=round(load_1m, 2) if load_1m else None,
        load_5m=round(load_5m, 2) if load_5m else None,
        load_15m=round(load_15m, 2) if load_15m else None,
    )


def collect_memory() -> MemoryStats:
    """Collect memory statistics."""
    vm = psutil.virtual_memory()
    swap = psutil.swap_memory()

    _history["memory_percent"].append(vm.percent)

    return MemoryStats(
        total=vm.total,
        used=vm.used,
        available=vm.available,
        free=vm.free,
        percent=round(vm.percent, 1),
        swap_total=swap.total,
        swap_used=swap.used,
        swap_percent=round(swap.percent, 1),
    )


def collect_disk() -> DiskStats:
    """Collect disk statistics."""
    global _prev_disk_io, _prev_time

    partitions = []
    total_read_bps = 0
    total_write_bps = 0

    # Current disk I/O
    disk_io = psutil.disk_io_counters(perdisk=True)
    now = time.time()
    dt = now - _prev_time if _prev_time else 1

    for part in psutil.disk_partitions(all=False):
        # Skip virtual/special filesystems
        if part.fstype in ("", "devfs", "devtmpfs", "tmpfs", "squashfs", "overlay"):
            continue
        # On Windows, skip CD-ROM drives with no media
        if platform.system() == "Windows" and ("cdrom" in part.opts or part.fstype == ""):
            continue

        try:
            usage = psutil.disk_usage(part.mountpoint)
        except PermissionError:
            continue
        except Exception:
            continue

        # Per-disk I/O rates
        read_bps = 0
        write_bps = 0
        if disk_io and part.device in disk_io:
            dio = disk_io[part.device]
            if _prev_disk_io and part.device in _prev_disk_io:
                prev = _prev_disk_io[part.device]
                read_bps = max(0, (dio.read_bytes - prev.read_bytes) / dt)
                write_bps = max(0, (dio.write_bytes - prev.write_bytes) / dt)
            total_read_bps += read_bps
            total_write_bps += write_bps

        partitions.append(DiskPartition(
            device=part.device,
            mountpoint=part.mountpoint,
            fstype=part.fstype,
            total=usage.total,
            used=usage.used,
            free=usage.free,
            percent=round((usage.used / usage.total) * 100, 1) if usage.total > 0 else 0,
            read_bytes_sec=round(read_bps, 0),
            write_bytes_sec=round(write_bps, 0),
        ))

    # Update history
    _history["disk_read"].append(total_read_bps / 1024 / 1024)  # MB/s
    _history["disk_write"].append(total_write_bps / 1024 / 1024)

    _prev_disk_io = disk_io
    _prev_time = now

    # Total I/O counters
    io_total = psutil.disk_io_counters()
    return DiskStats(
        partitions=partitions,
        total_read_bps=round(total_read_bps, 0),
        total_write_bps=round(total_write_bps, 0),
        io_read_count=io_total.read_count if io_total else 0,
        io_write_count=io_total.write_count if io_total else 0,
    )


def collect_network() -> NetworkStats:
    """Collect network statistics."""
    global _prev_net_io, _prev_time

    interfaces = []
    total_sent_bps = 0
    total_recv_bps = 0

    net_io = psutil.net_io_counters(pernic=True)
    now = time.time()
    dt = now - _prev_time if _prev_time else 1

    for name, stats in net_io.items():
        # Skip loopback and virtual interfaces unless explicitly configured
        if name in ("lo", "Loopback", "lo0") and not settings.network_interfaces:
            continue

        sent_bps = 0
        recv_bps = 0
        if _prev_net_io and name in _prev_net_io:
            prev = _prev_net_io[name]
            sent_bps = max(0, (stats.bytes_sent - prev.bytes_sent) / dt)
            recv_bps = max(0, (stats.bytes_recv - prev.bytes_recv) / dt)

        total_sent_bps += sent_bps
        total_recv_bps += recv_bps

        # Get interface speed (best effort)
        speed_mbps = None
        try:
            addrs = psutil.net_if_addrs()
            stats_nic = psutil.net_if_stats()
            if name in stats_nic:
                speed_mbps = stats_nic[name].speed if stats_nic[name].speed > 0 else None
        except Exception:
            pass

        interfaces.append(NetworkInterface(
            name=name,
            bytes_sent=stats.bytes_sent,
            bytes_recv=stats.bytes_recv,
            packets_sent=stats.packets_sent,
            packets_recv=stats.packets_recv,
            errin=stats.errin,
            errout=stats.errout,
            dropin=stats.dropin,
            dropout=stats.dropout,
            speed_mbps=speed_mbps,
            is_up=stats_nic[name].isup if name in stats_nic else True,
            sent_bps=round(sent_bps, 0),
            recv_bps=round(recv_bps, 0),
        ))

    _history["net_sent"].append(total_sent_bps / 1024 / 1024)  # MB/s
    _history["net_recv"].append(total_recv_bps / 1024 / 1024)

    _prev_net_io = net_io

    return NetworkStats(
        interfaces=interfaces,
        total_sent_bps=round(total_sent_bps, 0),
        total_recv_bps=round(total_recv_bps, 0),
    )


def collect_gpu() -> Optional[GPUStats]:
    """Collect GPU statistics (NVIDIA via NVML preferred)."""
    if not settings.gpu_enabled or not _gpu_available:
        return None

    try:
        if _gpu_backend == "nvml":
            import pynvml
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            name = _to_str(pynvml.nvmlDeviceGetName(handle))

            # Utilization
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            gpu_usage = util.gpu

            # Memory
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            memory_used = mem.used
            memory_total = mem.total
            memory_percent = (mem.used / mem.total) * 100

            # Temperature
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)

            # Power
            power_draw = None
            power_limit = None
            try:
                power_draw = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0  # mW -> W
                power_limit = pynvml.nvmlDeviceGetPowerManagementLimitConstraints(handle)[1] / 1000.0
            except Exception:
                pass

            # Clocks
            clock_core = None
            clock_memory = None
            try:
                clock_core = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_GRAPHICS)
                clock_memory = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_MEM)
            except Exception:
                pass

            # Driver version
            driver_version = _to_str(pynvml.nvmlSystemGetDriverVersion())

            _history["gpu_usage"].append(gpu_usage)
            _history["gpu_memory"].append(memory_percent)

            return GPUStats(
                name=name,
                gpu_usage=round(gpu_usage, 1),
                memory_used=memory_used,
                memory_total=memory_total,
                memory_percent=round(memory_percent, 1),
                temperature=temp,
                power_draw=round(power_draw, 1) if power_draw else None,
                power_limit=round(power_limit, 1) if power_limit else None,
                clock_core=clock_core,
                clock_memory=clock_memory,
                driver_version=driver_version,
            )

        elif _gpu_backend == "gputil":
            gpus = GPUtil.getGPUs()
            if not gpus:
                return None
            gpu = gpus[0]  # Primary GPU

            _history["gpu_usage"].append(gpu.load * 100)
            _history["gpu_memory"].append(gpu.memoryUtil * 100)

            return GPUStats(
                name=gpu.name,
                gpu_usage=round(gpu.load * 100, 1),
                memory_used=int(gpu.memoryUsed * 1024 * 1024),
                memory_total=int(gpu.memoryTotal * 1024 * 1024),
                memory_percent=round(gpu.memoryUtil * 100, 1),
                temperature=gpu.temperature if gpu.temperature else None,
            )

    except Exception as e:
        print(f"GPU collection error: {e}")

    return None


def _docker_container_stats(container):
    """Fetch one container's live stats dict; None on failure."""
    try:
        return container.stats(stream=False)
    except Exception:
        return None


def _parse_docker_cpu(stats) -> float:
    """Compute CPU percent from a single docker stats sample."""
    try:
        cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - \
            stats["precpu_stats"]["cpu_usage"]["total_usage"]
        system_delta = stats["cpu_stats"]["system_cpu_usage"] - \
            stats["precpu_stats"]["system_cpu_usage"]
        if system_delta > 0 and cpu_delta > 0:
            ncpu = len(stats["cpu_stats"]["cpu_usage"].get("percpu_usage", [1])) or 1
            return (cpu_delta / system_delta) * ncpu * 100
    except Exception:
        pass
    return 0.0


def collect_docker() -> Optional[DockerStats]:
    """Collect Docker container statistics.

    Each running container's stats(stream=False) call blocks ~1s on the daemon,
    so they are polled concurrently under a hard time budget. Sequential polling
    would stall the whole 1.5s broadcast loop once several containers exist.
    """
    if not settings.docker_enabled or not _docker_available or not _docker_client:
        return None

    try:
        container_list = _docker_client.containers.list(all=True)
    except Exception as e:
        print(f"Docker list error: {e}")
        return None

    # Live stats only exist for running containers; fetch them concurrently.
    running_list = [c for c in container_list if c.status == "running"]
    stats_by_id: Dict[str, Any] = {}
    if running_list:
        executor = ThreadPoolExecutor(max_workers=min(8, len(running_list)))
        try:
            future_to_id = {
                executor.submit(_docker_container_stats, c): c.id
                for c in running_list
            }
            done, _pending = wait(future_to_id, timeout=2.5)
            for fut in done:
                data = fut.result()
                if data:
                    stats_by_id[future_to_id[fut]] = data
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

    containers = []
    total_cpu = 0.0
    total_mem_usage = 0
    total_mem_limit = 0
    running = 0

    for container in container_list:
        stats = stats_by_id.get(container.id)
        cpu_percent = _parse_docker_cpu(stats) if stats else 0.0

        mem_usage = 0
        mem_limit = 0
        net_rx = net_tx = block_read = block_write = 0
        if stats:
            mem_stats = stats.get("memory_stats", {})
            mem_usage = mem_stats.get("usage", 0) or 0
            mem_limit = mem_stats.get("limit", 0) or 0
            try:
                for _iface, data in (stats.get("networks") or {}).items():
                    net_rx += data.get("rx_bytes", 0)
                    net_tx += data.get("tx_bytes", 0)
            except Exception:
                pass
            try:
                for blk in stats.get("blkio_stats", {}).get("io_service_bytes_recursive", []) or []:
                    if blk.get("op") == "Read":
                        block_read += blk.get("value", 0)
                    elif blk.get("op") == "Write":
                        block_write += blk.get("value", 0)
            except Exception:
                pass

        mem_percent = (mem_usage / mem_limit * 100) if mem_limit > 0 else 0

        if container.status == "running":
            running += 1
        total_cpu += cpu_percent
        total_mem_usage += mem_usage
        total_mem_limit += mem_limit

        ports = []
        try:
            port_bindings = container.attrs.get("NetworkSettings", {}).get("Ports", {}) or {}
            for container_port, bindings in port_bindings.items():
                if bindings:
                    for b in bindings:
                        ports.append(f"{b.get('HostPort', '?')}->{container_port}")
        except Exception:
            pass

        try:
            image = container.image.tags[0] if container.image.tags else container.image.id[:12]
        except Exception:
            image = "unknown"

        containers.append(DockerContainer(
            id=container.short_id,
            name=container.name,
            image=image,
            status=container.status,
            cpu_percent=round(cpu_percent, 1),
            memory_usage=mem_usage,
            memory_limit=mem_limit,
            memory_percent=round(mem_percent, 1),
            network_rx=net_rx,
            network_tx=net_tx,
            block_read=block_read,
            block_write=block_write,
            started_at=container.attrs.get("State", {}).get("StartedAt"),
            ports=ports,
        ))

    return DockerStats(
        containers=containers,
        total_containers=len(containers),
        running_containers=running,
        total_cpu_percent=round(total_cpu, 1),
        total_memory_usage=total_mem_usage,
        total_memory_limit=total_mem_limit,
    )


_total_ram = float(psutil.virtual_memory().total) if hasattr(psutil, 'virtual_memory') else 16 * 1024**3


def _collect_process_snapshot() -> list:
    """Single pass over running processes via PowerShell (much faster on Windows)."""
    if platform.system() != "Windows":
        return _collect_process_snapshot_psutil()

    snapshot = []
    try:
        script = (
            "Get-Process | Where-Object { $_.ProcessName -notin @("
            + ",".join("'" + p + "'" for p in settings.ignore_processes)
            + ") } | Select-Object "
            "Id, ProcessName, CPU, @{N='MemMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, "
            "StartTime, @{N='CmdLine';E={($_.CommandLine -split ' ')[0..2] -join ' '}}, "
            "MainWindowTitle | ConvertTo-Json -Compress"
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0 or not result.stdout.strip():
            return _collect_process_snapshot_psutil()

        import json
        raw = result.stdout.strip()
        rows = json.loads(raw) if raw.startswith("[") else [json.loads(raw)]

        now = time.time()
        for r in rows:
            name = (r.get("ProcessName") or "").strip()
            if not name or name in settings.ignore_processes:
                continue
            pid = r.get("Id") or 0
            mem_mb = float(r.get("MemMB") or 0)
            mem_pct = (mem_mb * 1024 * 1024 / _total_ram * 100) if _total_ram > 0 else 0
            cmdline = r.get("CmdLine") or ""
            start_raw = r.get("StartTime")
            create_time = 0
            if start_raw:
                try:
                    create_time = datetime.fromisoformat(start_raw.replace("Z", "")).timestamp()
                except Exception:
                    create_time = 0
            cpu = r.get("CPU")
            cpu_val = float(cpu) if cpu else 0.0

            snapshot.append({
                "pid": pid,
                "name": name,
                "cpu_percent": cpu_val,
                "memory_percent": round(mem_pct, 1),
                "memory_mb": round(mem_mb, 1),
                "status": "running",
                "username": None,
                "cmdline": cmdline,
                "create_time": create_time,
            })
    except Exception as e:
        # Fallback to psutil on any failure
        return _collect_process_snapshot_psutil()

    return snapshot


def _collect_process_snapshot_psutil() -> list:
    """Fallback: psutil-based process snapshot (slower on Windows)."""
    snapshot = []
    for proc in psutil.process_iter(["pid", "name", "memory_info", "status", "username", "cmdline", "create_time"]):
        try:
            info = proc.info
            name = (info["name"] or "").strip()
            if name in settings.ignore_processes:
                continue
            cmdline = " ".join(info["cmdline"][:3] or []) if info["cmdline"] else ""
            mem_info = info["memory_info"]
            mem_mb = (mem_info.rss / 1024 / 1024) if mem_info else 0
            mem_pct = (mem_info.rss / _total_ram * 100) if mem_info and _total_ram > 0 else 0
            snapshot.append({
                "pid": info["pid"],
                "name": name,
                "cpu_percent": 0.0,
                "memory_percent": round(mem_pct, 1),
                "memory_mb": round(mem_mb, 1),
                "status": info["status"] or "?",
                "username": info["username"],
                "cmdline": cmdline,
                "create_time": info["create_time"] or 0,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    return snapshot


def _listen_ports_by_pid() -> Dict[int, set]:
    """Map pid -> set of listening ports via a single net_connections() call."""
    ports: Dict[int, set] = {}
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.status == psutil.CONN_LISTEN and conn.pid and conn.laddr:
                ports.setdefault(conn.pid, set()).add(conn.laddr.port)
    except Exception:
        pass
    return ports


def collect_top_processes(snapshot: list = None) -> List[ProcessInfo]:
    """Collect top processes by CPU + memory."""
    if snapshot is None:
        snapshot = _collect_process_snapshot()

    processes = [ProcessInfo(**p) for p in snapshot]
    processes.sort(key=lambda p: p.cpu_percent + p.memory_percent, reverse=True)
    return processes[:settings.top_process_count]


def collect_services(snapshot: list = None) -> List[ServiceStatus]:
    """Collect custom service statuses from a single process snapshot."""
    if snapshot is None:
        snapshot = _collect_process_snapshot()

    ports_by_pid = _listen_ports_by_pid()
    services = []
    now = time.time()

    for svc_name, patterns in settings.custom_services.items():
        found = False
        svc_pid = None
        svc_cpu = 0.0
        svc_mem_mb = 0.0
        svc_uptime = None
        svc_ports = []

        for p in snapshot:
            cmdline = p["cmdline"].lower()
            proc_name = p["name"].lower()
            matched = any(ptn.lower() in cmdline or ptn.lower() in proc_name for ptn in patterns)
            if matched:
                found = True
                svc_pid = p["pid"]
                svc_cpu = p["cpu_percent"]
                svc_mem_mb = p["memory_mb"]
                if p["create_time"]:
                    svc_uptime = round(now - p["create_time"], 0)
                svc_ports = sorted(ports_by_pid.get(svc_pid, set()))
                break

        services.append(ServiceStatus(
            name=svc_name,
            running=found,
            pid=svc_pid,
            cpu_percent=svc_cpu,
            memory_mb=svc_mem_mb,
            uptime_seconds=svc_uptime,
            ports=svc_ports,
        ))

    return services


def _attach_cpu_percent(snapshot: list) -> None:
    """Mutate snapshot with non-blocking cpu_percent values.

    psutil returns cached values after the first call (cpu_percent(interval=None)),
    so this is fast on every tick after the first.
    """
    # Prime the system-level cache if needed (already done in collect_cpu)
    for p in snapshot:
        try:
            proc = psutil.Process(p["pid"])
            p["cpu_percent"] = round(proc.cpu_percent(interval=None) or 0, 1)
        except Exception:
            p["cpu_percent"] = 0.0


async def collect_all() -> SystemStats:
    """Collect all statistics in parallel where possible."""
    loop = asyncio.get_event_loop()

    # Run blocking collectors in executor
    cpu_task = loop.run_in_executor(None, collect_cpu)
    mem_task = loop.run_in_executor(None, collect_memory)
    disk_task = loop.run_in_executor(None, collect_disk)
    net_task = loop.run_in_executor(None, collect_network)

    cpu, memory, disk, network = await asyncio.gather(
        cpu_task, mem_task, disk_task, net_task
    )

    # Collect process snapshot ONCE, share between top-processes and services
    snapshot = await loop.run_in_executor(None, _collect_process_snapshot)
    # Attach CPU percent (fast on subsequent ticks)
    await loop.run_in_executor(None, _attach_cpu_percent, snapshot)
    proc_task = loop.run_in_executor(None, collect_top_processes, snapshot)
    svc_task = loop.run_in_executor(None, collect_services, snapshot)
    top_processes, services = await asyncio.gather(proc_task, svc_task)

    # GPU and Docker (slower, run sequentially or with timeout)
    gpu = None
    docker = None
    if settings.gpu_enabled:
        try:
            gpu = await asyncio.wait_for(
                loop.run_in_executor(None, collect_gpu),
                timeout=2.0
            )
        except Exception:
            pass

    if settings.docker_enabled:
        try:
            docker = await asyncio.wait_for(
                loop.run_in_executor(None, collect_docker),
                timeout=3.0
            )
        except Exception:
            pass

    # System info
    boot_time = datetime.fromtimestamp(psutil.boot_time())
    uptime = time.time() - psutil.boot_time()

    return SystemStats(
        timestamp=datetime.now(),
        hostname=socket.gethostname(),
        os=f"{platform.system()} {platform.release()}",
        uptime_seconds=uptime,
        boot_time=boot_time,
        cpu=cpu,
        memory=memory,
        disk=disk,
        network=network,
        gpu=gpu,
        docker=docker,
        top_processes=top_processes,
        services=services,
    )