# Linacre System Monitor Wallpaper

Real-time system monitoring wallpaper with **linacre.site** theme — built for your dual-monitor setup (2K landscape + 1080p portrait).

![Preview](preview.svg)

## Features

- **Live System Stats** — CPU (per-core), RAM, GPU (NVIDIA), Disk I/O, Network, Docker containers, top processes
- **Custom Service Monitoring** — Tracks your GhostMail, DomainDeals, linacre.site, PostgreSQL, Redis, Ollama
- **Dual-Monitor Layout** — Left (portrait): vitals; Right (landscape): details
- **linacre.site Theme System** — **Dark mode canonical** (matches site), light mode option, `prefers-color-scheme` detection, manual toggle (`T` key), localStorage persistence
- **Command Palette** — `⌘K` for 15+ actions: refresh, reconnect, toggle theme/panels, copy hostname/IP, restart services, kill processes, Docker actions, export config
- **Interactive Panels** — Click services/containers/processes for contextual actions (restart, kill, open ports, view logs)
- **Process Table** — Filter, sort (click headers), keyboard navigation
- **Sparklines** — 3-minute history (120 points) for CPU, RAM, GPU, Network, Disk
- **WebSocket Real-time** — 1.5s updates, auto-reconnect, force-refresh (`R` key)
- **Lively Wallpaper Native** — One-click install, config UI, multi-monitor aware
- **Action API** — REST + WebSocket endpoints for service/container/process control

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Lively Wallpaper                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Web Wallpaper (HTML/JS/CSS)            │   │
│  │  - Dual-monitor grid layout                         │   │
│  │  - Canvas sparklines (GPU accelerated)              │   │
│  │  - Command palette (⌘K) + contextual menus          │   │
│  │  - Toast notifications                              │   │
│  │  - Theme system (dark/light/auto)                   │   │
│  └─────────────────────┬────────────────────────────────┘   │
│                        │ WebSocket (ws://127.0.0.1:8765/ws)  │
└────────────────────────┼────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Python FastAPI Backend                         │
│  - psutil: CPU, RAM, Disk, Network, Processes              │
│  - pynvml/GPUtil: GPU (NVIDIA: usage, VRAM, temp, power)   │
│  - docker SDK: Container stats + actions                   │
│  - Custom service detection + process management           │
│  - WebSocket broadcast (1.5s) + REST action endpoints      │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Backend (Python)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/macWS

pip install -r requirements.txt
# Optional: pip install pynvml for better NVIDIA support

# Copy config
cp .env.example .env
# Edit .env if needed (Docker socket, custom services, etc.)

# Run
python -m main
```

Backend starts at `http://127.0.0.1:8765`
- WebSocket: `ws://127.0.0.1:8765/ws`
- REST API: `http://127.0.0.1:8765/api/stats`
- Health: `http://127.0.0.1:8765/health`
- Actions: `POST /api/action/service/{action}`, `/api/action/docker/{action}`, etc.

### 2. Frontend (Lively Wallpaper)

**Option A: Install from folder (development)**
1. Open Lively Wallpaper
2. Click `+` → `Add Website` → `Local Folder`
3. Select `frontend/` folder
4. Configure: WS Host `127.0.0.1`, Port `8765`, Theme `dark` (default)
5. Apply to monitors

**Option B: Package as `.zip` (distribution)**
```bash
cd frontend
zip -r ../linacre-wallpaper.lively.zip . -x "*.git*" "node_modules/*" "*.DS_Store"
```
Then in Lively Wallpaper: `+` → `Import Wallpaper` → select `linacre-wallpaper.lively.zip`

### 3. Configure Monitors

Lively Wallpaper handles multi-monitor automatically. For your setup:
- **Monitor 1 (Left, Portrait 1080p)**: Shows CPU, Memory, GPU, Services — perfect vertical layout
- **Monitor 2 (Right, Landscape 2K)**: Shows Disk, Network, Docker, Processes — wide tables

The wallpaper uses CSS Grid and responds to viewport size. Each monitor gets its own grid column.

## Configuration

### Backend (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `8765` | Port |
| `WS_INTERVAL` | `1.5` | WebSocket push interval (seconds) |
| `GPU_ENABLED` | `true` | Enable GPU monitoring |
| `GPU_BACKEND` | `auto` | `auto`, `nvidia`, `amd`, `intel` |
| `DOCKER_ENABLED` | `true` | Enable Docker monitoring |
| `DOCKER_SOCKET` | `npipe:////./pipe/docker_engine` | Docker socket (Windows named pipe) |
| `CUSTOM_SERVICES` | See `.env.example` | JSON: service name → process patterns |
| `TOP_PROCESS_COUNT` | `12` | Processes to show |
| `ACTIONS_ENABLED` | `true` | Enable action endpoints |

### Wallpaper Config (Lively UI)

| Setting | Description |
|---------|-------------|
| WS Host | Backend hostname (default: `127.0.0.1`) |
| WS Port | Backend port (default: `8765`) |
| Update Interval | Stats refresh ms (default: `1500`) |
| Show GPU | Toggle GPU panel |
| Show Docker | Toggle Docker panel |
| Theme | `dark` (default), `light`, `auto` |

### URL Parameters (for testing)

```
file:///path/to/frontend/index.html?wsHost=127.0.0.1&wsPort=8765&theme=dark&showGPU=true&showDocker=true
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `⌘K` / `Ctrl+K` | Open Command Palette |
| `T` | Toggle theme (dark/light) |
| `R` | Force refresh stats |
| `Esc` | Close palette/menu |
| `↑/↓` | Navigate palette/menu |
| `Enter` | Execute command/select |
| `Click header` | Sort process table |

## Command Palette (`⌘K`)

| Command | Shortcut | Action |
|---------|----------|--------|
| Refresh Stats | `R` | Force immediate backend fetch |
| Reconnect WebSocket | | Force WS reconnection |
| Toggle Theme | `T` | Switch dark/light mode |
| Toggle GPU Panel | | Show/hide GPU monitoring |
| Toggle Docker Panel | | Show/hide Docker containers |
| Toggle Services Panel | | Show/hide custom services |
| Copy Hostname | | Copy system hostname |
| Copy Primary IP | | Copy primary network IP |
| Open Terminal | | Launch system terminal (wt.exe) |
| Open Task Manager | | Launch Task Manager |
| Restart Service… | | Pick service to restart |
| Export Settings | | Download config as JSON |
| Clear Local Storage | | Reset all preferences |

## Interactive Panels

Click any item for contextual actions:

### Services
- **Running**: Restart, Kill, Copy PID/name/ports, Open port in browser
- **Stopped**: (Shows as stopped)

### Docker Containers
- **Running**: Restart, Stop, View logs, Copy ID/name/image/ports, Open ports
- **Exited**: Start, Remove, Copy ID/name/image

### Processes
- Copy PID/name/command line
- Terminate (SIGTERM) / Force kill (SIGKILL)

## Process Table

- **Filter**: Type in "Filter processes…" box
- **Sort**: Click any column header (CPU, RAM, PID, etc.)
- **Navigate**: Click row or use keyboard after filtering
- **Actions**: Click row → contextual menu

## Custom Services

Edit `backend/.env` `CUSTOM_SERVICES` to monitor your projects:

```json
{
  "My Go API": ["my-api", "go"],
  "PostgreSQL": ["postgres"],
  "Redis": ["redis-server"],
  "Ollama": ["ollama"],
  "Nginx": ["nginx"]
}
```

The backend matches process name **OR** command line against patterns.

## GPU Monitoring

- **NVIDIA**: Uses `pynvml` (NVML) — full stats: usage, VRAM, temp, power, clocks
  - Install: `pip install pynvml`
- **AMD/Intel**: Falls back to `GPUtil` — basic usage, memory, temp
- Auto-detected via `GPU_BACKEND=auto`

## Docker Monitoring

- Requires Docker Desktop (Windows) or Docker Engine (Linux)
- Windows: Uses named pipe `npipe:////./pipe/docker_engine`
- Linux/WSL2: Uses `unix:///var/run/docker.sock`
- Shows: container status, CPU%, RAM%, network I/O, block I/O, ports
- Actions: start, stop, restart, logs, remove

## Theme System

Matches **linacre.site exactly**:

- **Dark (canonical)**: `#0b0e14` background, amber/cyan/emerald accents, radial hero gradients
- **Light**: `#fafafa` background, same accent system
- **Auto**: Follows `prefers-color-scheme`
- **Toggle**: `T` key or Command Palette or header button
- **Persisted**: localStorage (`linacre-wallpaper-theme`)
- **Transitions**: Smooth 260ms color transitions

## Performance

- Backend: ~15MB RAM, <1% CPU (idle)
- Frontend: ~60fps animations, Canvas sparklines (GPU accelerated)
- WebSocket: 1.5s interval, ~2KB/msg
- Lively Wallpaper: Runs in dedicated WebView2 process
- Sparklines: 120 points (3 min history) per metric

## Troubleshooting

### Backend won't start
```bash
# Check port conflict
netstat -ano | findstr :8765

# Check Python version (3.10+)
python --version

# Reinstall deps
pip install --upgrade -r requirements.txt
```

### GPU not showing
```bash
# Verify NVML
python -c "import pynvml; pynvml.nvmlInit(); print(pynvml.nvmlDeviceGetName(pynvml.nvmlDeviceGetHandleByIndex(0)))"

# Check GPUtil fallback
python -c "import GPUtil; print(GPUtil.getGPUs())"
```

### Docker not showing
```bash
# Test Docker SDK
python -c "import docker; c=docker.DockerClient(base_url='npipe:////./pipe/docker_engine'); print(c.ping())"

# Windows: Ensure Docker Desktop "Expose daemon on tcp://localhost:2375" is OFF (uses named pipe)
```

### Wallpaper not loading
- Open Lively Wallpaper → Wallpaper settings → Developer Tools (F12) → Console
- Check WebSocket connection to `ws://127.0.0.1:8765/ws`
- Verify backend is running (`curl http://127.0.0.1:8765/health`)

### Dual monitor layout issues
- Lively Wallpaper stretches single wallpaper across monitors by default
- For true per-monitor: Right-click wallpaper → `Span` → `Off` (each monitor gets independent instance)
- Or use the config to set different layouts per monitor

### Actions not working (service restart, Docker, process kill)
- Ensure `ACTIONS_ENABLED=true` in `.env`
- Check backend console for errors
- Some actions require admin/root privileges
- Windows: `wt.exe` must be in PATH for terminal launch

## Auto-start on Boot

### Backend (Windows)
```powershell
# Create scheduled task (run at logon, highest privileges)
$action = New-ScheduledTaskAction -Execute 'python.exe' -Argument '-m main' -WorkingDirectory 'C:\path\to\linacre-wallpaper\backend'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd
Register-ScheduledTask -TaskName 'LinacreWallpaperBackend' -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force
```

Or create a shortcut in `shell:startup`:
```bat
@echo off
cd /d C:\path\to\linacre-wallpaper\backend
call .venv\Scripts\activate
python -m main
```

### Lively Wallpaper
- Lively Wallpaper auto-starts with Windows
- Wallpaper persists across reboots

## Development

### Frontend Structure
```
frontend/
├── index.html          # Entry point (loads in Lively)
├── lively.json         # Lively Wallpaper manifest
├── styles/
│   └── main.css        # All styles (linacre.site theme)
├── src/
│   ├── main.js         # App bootstrap
│   ├── app.js          # Main app class (WebSocket, UI, theme, actions)
│   ├── utils/fonts.js  # Font loading
│   └── components/
│       ├── CommandPalette.js
│       └── Toast.js
└── fonts/              # Local WOFF2 fonts (Inter, JetBrains Mono, Space Grotesk)
```

### Adding Fonts
Download variable fonts from Google Fonts, place in `frontend/fonts/`:
- `inter-var-latin.woff2`
- `jetbrains-mono-var-latin.woff2`
- `space-grotesk-var-latin.woff2`

Update `@font-face` in `index.html` if needed.

### Hot Reload (Development)
```bash
# Backend: auto-reload
uvicorn main:app --reload --host 127.0.0.1 --port 8765

# Frontend: Lively Wallpaper doesn't hot-reload
# Refresh wallpaper in Lively (F5 in DevTools) or re-apply
```

### Build Distribution Package
```bash
# Windows
.\build.ps1 -Version 1.0.0

# Linux/macOS/WSL
./build.sh 1.0.0
```

Outputs:
- `dist/linacre-wallpaper-v1.0.0.lively.zip` — Import in Lively
- `dist/install.bat` / `install.sh` — Auto-install backend

## Credits

- **Theme**: [linacre.site](https://www.linacre.site) — David Linacre
- **Backend**: FastAPI, psutil, pynvml, docker-py
- **Frontend**: Vanilla JS, Canvas API, WebSocket API
- **Wallpaper Engine**: [Lively Wallpaper](https://github.com/rocksdanister/lively) — Free, open-source

## License

MIT — Use freely, modify, share. Attribution appreciated.

---

*Built with the same engineering standards as [GhostMail](https://github.com/LIN4CRE/GhostMail) and [linacre.site](https://www.linacre.site).*