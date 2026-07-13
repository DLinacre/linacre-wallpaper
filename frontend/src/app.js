/**
 * Linacre Wallpaper — Main Application Class
 * Handles WebSocket connection, data processing, UI updates, theme system
 */

export class WallpaperApp {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.isConnected = false;
    this.lastStats = null;
    this.sparklineData = {
      cpu: [], memory: [], gpu: [], gpuMem: [],
      netUp: [], netDown: [], diskRead: [], diskWrite: [],
    };
    this.maxSparklinePoints = 120; // 3 minutes at 1.5s
    this.clockInterval = null;
    this.theme = 'dark'; // default to dark (brand canonical)
    this.processFilter = '';
    this.sortColumn = 'cpu';
    this.sortDirection = 'desc';
    this.panelVisibility = {
      gpu: true, docker: true, services: true, disk: true, network: true, processes: true
    };
    this.config = {
      wsHost: '127.0.0.1',
      wsPort: 8765,
      updateInterval: 1500,
    };
  }

  async init() {
    this.loadConfig();
    this.initTheme();
    this.bindElements();
    this.startClock();
    this.connect();
    this.bindKeyboardShortcuts();
    this.bindThemeToggle();
    this.bindProcessFilter();
    this.bindPanelToggles();
    this.bindSortableHeaders();
  }

  loadConfig() {
    // Load from Lively Wallpaper config if available
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('wsHost')) this.config.wsHost = params.get('wsHost');
      if (params.has('wsPort')) this.config.wsPort = parseInt(params.get('wsPort'), 10);
      if (params.has('updateInterval')) this.config.updateInterval = parseInt(params.get('updateInterval'), 10);
      if (params.has('showGPU')) this.panelVisibility.gpu = params.get('showGPU') === 'true';
      if (params.has('showDocker')) this.panelVisibility.docker = params.get('showDocker') === 'true';
      if (params.has('theme')) this.theme = params.get('theme');
    } catch (e) {
      console.warn('[Wallpaper] Config parse error:', e);
    }

    // Load persisted panel visibility
    try {
      const saved = localStorage.getItem('linacre-wallpaper-panels');
      if (saved) this.panelVisibility = { ...this.panelVisibility, ...JSON.parse(saved) };
    } catch (e) {}
  }

  initTheme() {
    // Priority: URL param > localStorage > system preference > default (dark)
    let theme = this.theme;
    try {
      const saved = localStorage.getItem('linacre-wallpaper-theme');
      if (saved) theme = saved;
    } catch (e) {}

    // Apply theme
    this.setTheme(theme, false); // Don't persist on init
  }

  setTheme(theme, persist = true) {
    this.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    if (persist) {
      try { localStorage.setItem('linacre-wallpaper-theme', theme); } catch (e) {}
    }
    // Update theme toggle icon (handled by CSS)
    this.showToast('info', 'Theme', `${theme === 'dark' ? 'Dark' : 'Light'} mode activated`);
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  bindThemeToggle() {
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', () => this.toggleTheme());
      // Keyboard: T key (when not in input)
      document.addEventListener('keydown', (e) => {
        if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const active = document.activeElement;
          if (!active || active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA') {
            e.preventDefault();
            this.toggleTheme();
          }
        }
      });
    }
  }

  bindElements() {
    // Header
    this.hostBadge = document.getElementById('hostBadge');
    this.connectionStatus = document.getElementById('connectionStatus');
    this.statusDot = this.connectionStatus?.querySelector('.status-dot');
    this.statusText = this.connectionStatus?.querySelector('.status-text');

    // Panels
    this.cpuTotal = document.getElementById('cpuTotal');
    this.cpuCores = document.getElementById('cpuCores');
    this.cpuFreq = document.getElementById('cpuFreq');
    this.cpuTemp = document.getElementById('cpuTemp');
    this.cpuLoad = document.getElementById('cpuLoad');
    this.cpuSparkline = document.getElementById('cpuSparkline');

    this.memPercent = document.getElementById('memPercent');
    this.memFill = document.getElementById('memFill');
    this.memUsed = document.getElementById('memUsed');
    this.memAvail = document.getElementById('memAvail');
    this.memSwap = document.getElementById('memSwap');
    this.memBar = document.getElementById('memBar');
    this.memSparkline = document.getElementById('memSparkline');

    this.gpuPanel = document.getElementById('gpuPanel');
    this.gpuUsage = document.getElementById('gpuUsage');
    this.gpuName = document.getElementById('gpuName');
    this.gpuMemFill = document.getElementById('gpuMemFill');
    this.gpuMemBar = document.getElementById('gpuMemBar');
    this.gpuVRAM = document.getElementById('gpuVRAM');
    this.gpuTemp = document.getElementById('gpuTemp');
    this.gpuPower = document.getElementById('gpuPower');
    this.gpuSparkline = document.getElementById('gpuSparkline');

    this.serviceList = document.getElementById('serviceList');

    this.diskList = document.getElementById('diskList');
    this.diskRead = document.getElementById('diskRead');
    this.diskWrite = document.getElementById('diskWrite');
    this.diskSparkline = document.getElementById('diskSparkline');

    this.netUp = document.getElementById('netUp');
    this.netDown = document.getElementById('netDown');
    this.netSparkline = document.getElementById('netSparkline');
    this.interfaceList = document.getElementById('interfaceList');

    this.dockerPanel = document.getElementById('dockerPanel');
    this.dockerCount = document.getElementById('dockerCount');
    this.dockerResources = document.getElementById('dockerResources');
    this.containerList = document.getElementById('containerList');

    this.processBody = document.getElementById('processBody');
    this.processFilterInput = document.getElementById('processFilter');
    this.processTable = document.getElementById('processTable');
  }

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.openCommandPalette();
      }
      // Escape to close command palette
      if (e.key === 'Escape') {
        this.closeCommandPalette();
      }
      // R for refresh (when not in input)
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const active = document.activeElement;
        if (!active || active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA') {
          e.preventDefault();
          this.sendCommand('refresh');
          this.showToast('success', 'Refresh', 'Stats refreshed');
        }
      }
    });
  }

  bindProcessFilter() {
    if (this.processFilterInput) {
      this.processFilterInput.addEventListener('input', (e) => {
        this.processFilter = e.target.value.toLowerCase();
        this.renderProcesses(this.lastStats?.top_processes || []);
      });
    }
  }

  bindSortableHeaders() {
    if (this.processTable) {
      this.processTable.querySelectorAll('th').forEach((th, index) => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
          const columns = ['pid', 'name', 'cpu', 'mem', 'mem_mb', 'status'];
          const col = columns[index];
          if (col) {
            if (this.sortColumn === col) {
              this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
              this.sortColumn = col;
              this.sortDirection = ['cpu', 'mem', 'mem_mb'].includes(col) ? 'desc' : 'asc';
            }
            this.renderProcesses(this.lastStats?.top_processes || []);
            this.updateSortIndicators();
          }
        });
      });
    }
  }

  updateSortIndicators() {
    if (!this.processTable) return;
    this.processTable.querySelectorAll('th').forEach((th, index) => {
      const columns = ['pid', 'name', 'cpu', 'mem', 'mem_mb', 'status'];
      const col = columns[index];
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (col === this.sortColumn) {
        th.classList.add(this.sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });
  }

  bindPanelToggles() {
    // Apply initial panel visibility
    Object.entries(this.panelVisibility).forEach(([key, visible]) => {
      const panel = document.getElementById(`${key}Panel`);
      if (panel) panel.hidden = !visible;
    });
  }

  setPanelVisibility(key, visible) {
    this.panelVisibility[key] = visible;
    const panel = document.getElementById(`${key}Panel`);
    if (panel) panel.hidden = !visible;
    try { localStorage.setItem('linacre-wallpaper-panels', JSON.stringify(this.panelVisibility)); } catch (e) {}
  }

  startClock() {
    const updateClock = () => {
      const now = new Date();
      const timeEl = document.getElementById('clockTime');
      const dateEl = document.getElementById('clockDate');
      if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (dateEl) dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    };
    updateClock();
    this.clockInterval = setInterval(updateClock, 1000);
  }

  connect() {
    const wsUrl = `ws://${this.config.wsHost}:${this.config.wsPort}/ws`;
    console.log('[Wallpaper] Connecting to', wsUrl);

    this.setConnectionState('connecting');

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[Wallpaper] WebSocket connected');
      this.reconnectAttempts = 0;
      this.setConnectionState('connected');
      this.showToast('success', 'Connected', 'Real-time stats streaming');
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (e) {
        console.error('[Wallpaper] Failed to parse message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('[Wallpaper] WebSocket closed');
      this.setConnectionState('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('[Wallpaper] WebSocket error:', error);
      this.setConnectionState('disconnected');
    };
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.showToast('error', 'Connection Lost', 'Max reconnection attempts reached. Refresh page.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
    console.log(`[Wallpaper] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => this.connect(), delay);
  }

  setConnectionState(state) {
    this.isConnected = state === 'connected';

    if (this.statusDot) {
      this.statusDot.className = 'status-dot ' + state;
    }
    if (this.statusText) {
      const labels = { connected: 'Connected', connecting: 'Connecting', disconnected: 'Disconnected' };
      this.statusText.textContent = labels[state];
    }
  }

  handleMessage(message) {
    if (message.type === 'stats') {
      this.lastStats = message.payload;
      this.updateUI(message.payload);
    } else if (message.type === 'error') {
      this.showToast('error', 'Server Error', message.payload?.message || 'Unknown error');
    } else if (message.type === 'pong') {
      // Heartbeat response
    }
  }

  updateUI(stats) {
    // Update hostname badge
    if (this.hostBadge && stats.hostname) {
      this.hostBadge.textContent = `${stats.hostname} · ${stats.os}`;
    }

    // CPU
    this.updateCPU(stats.cpu);

    // Memory
    this.updateMemory(stats.memory);

    // GPU
    if (stats.gpu && this.panelVisibility.gpu) {
      this.gpuPanel.hidden = false;
      this.updateGPU(stats.gpu);
    } else {
      this.gpuPanel.hidden = true;
    }

    // Services
    if (this.panelVisibility.services) this.updateServices(stats.services);

    // Disk
    if (this.panelVisibility.disk) this.updateDisk(stats.disk);

    // Network
    if (this.panelVisibility.network) this.updateNetwork(stats.network);

    // Docker
    if (stats.docker && this.panelVisibility.docker) {
      this.dockerPanel.hidden = false;
      this.updateDocker(stats.docker);
    } else {
      this.dockerPanel.hidden = true;
    }

    // Processes
    if (this.panelVisibility.processes) this.renderProcesses(stats.top_processes || []);
  }

  updateCPU(cpu) {
    if (!cpu) return;

    this.cpuTotal.textContent = `${cpu.total_usage.toFixed(1)}%`;

    // Per-core bars
    this.cpuCores.innerHTML = cpu.per_core.map(core => `
      <div class="core-bar" data-core="${core.core}" style="--core-usage: ${core.usage}%">
        <div class="core-fill" style="width: ${core.usage}%"></div>
      </div>
    `).join('');

    this.cpuFreq.textContent = `${cpu.frequency_current.toFixed(0)} MHz`;
    this.cpuTemp.textContent = cpu.temperature ? `${cpu.temperature.toFixed(1)}°C` : 'N/A';
    this.cpuLoad.textContent = cpu.load_1m !== null
      ? `${cpu.load_1m.toFixed(2)} / ${cpu.load_5m.toFixed(2)} / ${cpu.load_15m.toFixed(2)}`
      : 'N/A';

    // Sparkline
    this.sparklineData.cpu.push(cpu.total_usage);
    if (this.sparklineData.cpu.length > this.maxSparklinePoints) this.sparklineData.cpu.shift();
    this.drawSparkline(this.cpuSparkline, this.sparklineData.cpu, '#F59E0B');
  }

  updateMemory(mem) {
    if (!mem) return;

    this.memPercent.textContent = `${mem.percent.toFixed(1)}%`;
    this.memFill.style.width = `${mem.percent}%`;
    this.memBar.setAttribute('aria-valuenow', mem.percent.toFixed(1));

    this.memUsed.textContent = this.formatBytes(mem.used);
    this.memAvail.textContent = this.formatBytes(mem.available);
    this.memSwap.textContent = `${mem.swap_percent.toFixed(1)}%`;

    this.sparklineData.memory.push(mem.percent);
    if (this.sparklineData.memory.length > this.maxSparklinePoints) this.sparklineData.memory.shift();
    this.drawSparkline(this.memSparkline, this.sparklineData.memory, '#22D3EE');
  }

  updateGPU(gpu) {
    if (!gpu) return;

    this.gpuUsage.textContent = `${gpu.gpu_usage.toFixed(1)}%`;
    this.gpuName.textContent = gpu.name;

    this.gpuMemFill.style.width = `${gpu.memory_percent}%`;
    this.gpuMemBar.setAttribute('aria-valuenow', gpu.memory_percent.toFixed(1));

    this.gpuVRAM.textContent = `${this.formatBytes(gpu.memory_used)} / ${this.formatBytes(gpu.memory_total)}`;
    this.gpuTemp.textContent = gpu.temperature ? `${gpu.temperature}°C` : 'N/A';
    this.gpuPower.textContent = gpu.power_draw !== null && gpu.power_limit !== null
      ? `${gpu.power_draw.toFixed(1)} / ${gpu.power_limit.toFixed(1)} W`
      : 'N/A';

    this.sparklineData.gpu.push(gpu.gpu_usage);
    if (this.sparklineData.gpu.length > this.maxSparklinePoints) this.sparklineData.gpu.shift();
    this.drawSparkline(this.gpuSparkline, this.sparklineData.gpu, '#A78BFA');
  }

  updateServices(services) {
    if (!services || !this.serviceList) return;

    this.serviceList.innerHTML = services.map(svc => `
      <li class="service-item" data-service="${this.escapeHtml(svc.name)}" tabindex="0" role="button" aria-label="${svc.running ? 'Running' : 'Stopped'}: ${svc.name}, ${svc.running ? `${svc.cpu_percent.toFixed(1)}% CPU, ${svc.memory_mb.toFixed(1)} MB` : 'Stopped'}">
        <div class="service-info">
          <span class="service-indicator ${svc.running ? 'running' : 'stopped'}" aria-hidden="true"></span>
          <span class="service-name">${this.escapeHtml(svc.name)}</span>
        </div>
        <div class="service-meta">
          ${svc.running ? `
            <span>${svc.cpu_percent.toFixed(1)}% CPU</span>
            <span>${svc.memory_mb.toFixed(1)} MB</span>
            ${svc.uptime_seconds ? `<span>↑ ${this.formatUptime(svc.uptime_seconds)}</span>` : ''}
          ` : '<span class="stopped">Stopped</span>'}
          ${svc.ports.length ? `
            <div class="service-ports">
              ${svc.ports.map(p => `<span class="service-port" title="Port ${p}">:${p}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </li>
    `).join('');

    // Add click handlers for service actions
    this.serviceList.querySelectorAll('.service-item').forEach(item => {
      item.addEventListener('click', () => this.showServiceActions(item.dataset.service));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showServiceActions(item.dataset.service);
        }
      });
    });
  }

  showServiceActions(serviceName) {
    const svc = this.lastStats?.services?.find(s => s.name === serviceName);
    if (!svc) return;

    const commands = [
      { id: `copy-name-${serviceName}`, title: `Copy "${serviceName}" name`, action: () => this.copyToClipboard(serviceName) },
      { id: `copy-pid-${serviceName}`, title: `Copy PID (${svc.pid})`, action: () => svc.pid && this.copyToClipboard(String(svc.pid)) },
    ];

    if (svc.ports.length) {
      commands.push(
        { id: `copy-port-${serviceName}`, title: `Copy ports: ${svc.ports.join(', ')}`, action: () => this.copyToClipboard(svc.ports.join(', ')) },
        { id: `open-port-${serviceName}`, title: `Open http://localhost:${svc.ports[0]}`, action: () => window.open(`http://localhost:${svc.ports[0]}`, '_blank') }
      );
    }

    if (svc.running) {
      commands.push(
        { id: `restart-${serviceName}`, title: `Restart ${serviceName}`, action: () => this.requestServiceRestart(serviceName) },
        { id: `kill-${serviceName}`, title: `Kill ${serviceName} (force)`, action: () => this.requestServiceKill(serviceName) }
      );
    }

    this.showCommandMenu(commands, `Service: ${serviceName}`);
  }

  updateDisk(disk) {
    if (!disk || !this.diskList) return;

    this.diskList.innerHTML = disk.partitions.map(part => `
      <div class="disk-item">
        <span class="disk-mount">${this.escapeHtml(part.mountpoint)}</span>
        <div class="disk-usage">
          <div class="disk-bar" role="progressbar" aria-valuenow="${part.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${this.escapeHtml(part.mountpoint)} usage">
            <div class="disk-fill" style="width: ${part.percent}%"></div>
          </div>
          <span class="disk-pct">${part.percent.toFixed(1)}%</span>
        </div>
      </div>
    `).join('');

    this.diskRead.textContent = `${(disk.total_read_bps / 1024 / 1024).toFixed(1)} MB/s`;
    this.diskWrite.textContent = `${(disk.total_write_bps / 1024 / 1024).toFixed(1)} MB/s`;

    this.sparklineData.diskRead.push(disk.total_read_bps / 1024 / 1024);
    if (this.sparklineData.diskRead.length > this.maxSparklinePoints) this.sparklineData.diskRead.shift();
    this.drawSparkline(this.diskSparkline, this.sparklineData.diskRead, '#A78BFA');
  }

  updateNetwork(net) {
    if (!net) return;

    this.netUp.textContent = `${(net.total_sent_bps / 1024 / 1024).toFixed(2)} MB/s`;
    this.netDown.textContent = `${(net.total_recv_bps / 1024 / 1024).toFixed(2)} MB/s`;

    this.sparklineData.netUp.push(net.total_sent_bps / 1024 / 1024);
    if (this.sparklineData.netUp.length > this.maxSparklinePoints) this.sparklineData.netUp.shift();
    this.sparklineData.netDown.push(net.total_recv_bps / 1024 / 1024);
    if (this.sparklineData.netDown.length > this.maxSparklinePoints) this.sparklineData.netDown.shift();
    this.drawSparkline(this.netSparkline, this.sparklineData.netDown, '#22D3EE');

    this.interfaceList.innerHTML = net.interfaces
      .filter(iface => iface.is_up && (iface.sent_bps > 0 || iface.recv_bps > 0 || iface.bytes_sent > 0 || iface.bytes_recv > 0))
      .map(iface => `
        <li class="interface-item">
          <span class="iface-name">${this.escapeHtml(iface.name)}</span>
          <span class="iface-speed">${iface.speed_mbps ? `${iface.speed_mbps} Mbps` : ''}</span>
          <span class="iface-rx">▼ ${this.formatSpeed(iface.recv_bps)}</span>
          <span class="iface-tx">▲ ${this.formatSpeed(iface.sent_bps)}</span>
        </li>
      `).join('');
  }

  updateDocker(docker) {
    if (!docker) return;

    this.dockerCount.textContent = `${docker.running_containers} / ${docker.total_containers} running`;
    this.dockerResources.textContent = `CPU: ${docker.total_cpu_percent.toFixed(1)}% • RAM: ${this.formatBytes(docker.total_memory_usage)} / ${this.formatBytes(docker.total_memory_limit)}`;

    this.containerList.innerHTML = docker.containers.map(c => `
      <li class="container-item" data-container="${this.escapeHtml(c.name)}" tabindex="0" role="button" aria-label="${c.name}: ${c.status}, CPU ${c.cpu_percent.toFixed(1)}%, RAM ${c.memory_percent.toFixed(1)}%">
        <span class="container-status ${c.status}" aria-label="${c.status}"></span>
        <span class="container-name" title="${this.escapeHtml(c.name)}">${this.escapeHtml(c.name)}</span>
        <span class="container-image" title="${this.escapeHtml(c.image)}">${this.escapeHtml(c.image)}</span>
        <span class="container-cpu">${c.cpu_percent.toFixed(1)}%</span>
        <span class="container-mem">${c.memory_percent.toFixed(1)}%</span>
        <div class="container-ports">
          ${c.ports.map(p => `<span class="container-port" title="${this.escapeHtml(p)}">${this.escapeHtml(p)}</span>`).join('')}
        </div>
      </li>
    `).join('');

    // Add click handlers
    this.containerList.querySelectorAll('.container-item').forEach(item => {
      item.addEventListener('click', () => this.showContainerActions(item.dataset.container));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showContainerActions(item.dataset.container);
        }
      });
    });
  }

  showContainerActions(containerName) {
    const c = this.lastStats?.docker?.containers?.find(x => x.name === containerName);
    if (!c) return;

    const commands = [
      { id: `copy-name-${containerName}`, title: `Copy "${containerName}" name`, action: () => this.copyToClipboard(containerName) },
      { id: `copy-id-${containerName}`, title: `Copy container ID (${c.id})`, action: () => this.copyToClipboard(c.id) },
      { id: `copy-image-${containerName}`, title: `Copy image: ${c.image}`, action: () => this.copyToClipboard(c.image) },
    ];

    if (c.ports.length) {
      commands.push(
        { id: `copy-ports-${containerName}`, title: `Copy ports: ${c.ports.join(', ')}`, action: () => this.copyToClipboard(c.ports.join(', ')) }
      );
      c.ports.forEach(p => {
        const match = p.match(/(\d+)->/);
        if (match) {
          commands.push({
            id: `open-port-${containerName}-${match[1]}`,
            title: `Open http://localhost:${match[1]}`,
            action: () => window.open(`http://localhost:${match[1]}`, '_blank')
          });
        }
      });
    }

    if (c.status === 'running') {
      commands.push(
        { id: `restart-${containerName}`, title: `Restart ${containerName}`, action: () => this.requestContainerAction(containerName, 'restart') },
        { id: `stop-${containerName}`, title: `Stop ${containerName}`, action: () => this.requestContainerAction(containerName, 'stop') },
        { id: `logs-${containerName}`, title: `View logs`, action: () => this.requestContainerAction(containerName, 'logs') }
      );
    } else if (c.status === 'exited') {
      commands.push(
        { id: `start-${containerName}`, title: `Start ${containerName}`, action: () => this.requestContainerAction(containerName, 'start') },
        { id: `remove-${containerName}`, title: `Remove ${containerName}`, action: () => this.requestContainerAction(containerName, 'remove') }
      );
    }

    this.showCommandMenu(commands, `Container: ${containerName}`);
  }

  renderProcesses(processes) {
    if (!processes || !this.processBody) return;

    let filtered = processes;
    if (this.processFilter) {
      filtered = processes.filter(p =>
        p.name.toLowerCase().includes(this.processFilter) ||
        String(p.pid).includes(this.processFilter) ||
        (p.cmdline || '').toLowerCase().includes(this.processFilter)
      );
    }

    // Sort
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      let av, bv;
      switch (this.sortColumn) {
        case 'pid': av = a.pid; bv = b.pid; break;
        case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case 'cpu': av = a.cpu_percent; bv = b.cpu_percent; break;
        case 'mem': av = a.memory_percent; bv = b.memory_percent; break;
        case 'mem_mb': av = a.memory_mb; bv = b.memory_mb; break;
        case 'status': av = a.status; bv = b.status; break;
        default: return 0;
      }
      return dir * (av > bv ? 1 : av < bv ? -1 : 0);
    });

    this.processBody.innerHTML = filtered.map((proc, i) => `
      <tr style="animation: panelEnter ${200 + i * 20}ms var(--linacre-ease) both;" data-pid="${proc.pid}" tabindex="0" role="button" aria-label="${proc.name}, PID ${proc.pid}, CPU ${proc.cpu_percent.toFixed(1)}%, RAM ${proc.memory_percent.toFixed(1)}%">
        <td>${proc.pid}</td>
        <td class="proc-name" title="${this.escapeHtml(proc.cmdline || proc.name)}">${this.escapeHtml(proc.name)}</td>
        <td class="proc-cpu">${proc.cpu_percent.toFixed(1)}%</td>
        <td class="proc-mem">${proc.memory_percent.toFixed(1)}%</td>
        <td class="proc-mem-mb">${proc.memory_mb.toFixed(1)}</td>
        <td class="proc-status">${proc.status}</td>
      </tr>
    `).join('');

    // Add click handlers and keyboard navigation for process rows
    const rows = this.processBody.querySelectorAll('tr');
    rows.forEach(row => {
      row.addEventListener('click', () => this.showProcessActions(parseInt(row.dataset.pid, 10)));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showProcessActions(parseInt(row.dataset.pid, 10));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = row.nextElementSibling;
          if (next) next.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = row.previousElementSibling;
          if (prev) prev.focus();
        }
      });
    });

    this.updateSortIndicators();
  }

  showProcessActions(pid) {
    const proc = this.lastStats?.top_processes?.find(p => p.pid === pid);
    if (!proc) return;

    const commands = [
      { id: `copy-pid-${pid}`, title: `Copy PID (${pid})`, action: () => this.copyToClipboard(String(pid)) },
      { id: `copy-name-${pid}`, title: `Copy process name: ${proc.name}`, action: () => this.copyToClipboard(proc.name) },
      { id: `copy-cmdline-${pid}`, title: `Copy command line`, action: () => proc.cmdline && this.copyToClipboard(proc.cmdline) },
      { id: `kill-${pid}`, title: `Kill process (SIGTERM)`, action: () => this.requestProcessKill(pid, false) },
      { id: `kill9-${pid}`, title: `Force kill (SIGKILL)`, action: () => this.requestProcessKill(pid, true) },
    ];

    this.showCommandMenu(commands, `Process: ${proc.name} (PID ${pid})`);
  }

  // Command Palette
  openCommandPalette() {
    const overlay = document.getElementById('cmdPaletteOverlay');
    const input = document.getElementById('cmdInput');
    if (overlay && input) {
      overlay.hidden = false;
      input.focus();
      this.populateCommands('');
    }
  }

  closeCommandPalette() {
    const overlay = document.getElementById('cmdPaletteOverlay');
    const input = document.getElementById('cmdInput');
    if (overlay) overlay.hidden = true;
    if (input) input.value = '';
    document.getElementById('cmdResults').innerHTML = '';
  }

  populateCommands(query) {
    const results = document.getElementById('cmdResults');
    if (!results) return;

    const commands = [
      { id: 'refresh', title: 'Refresh Stats', desc: 'Force immediate data fetch from backend', shortcut: 'R', icon: 'refresh-cw', action: () => this.sendCommand('refresh') },
      { id: 'reconnect', title: 'Reconnect WebSocket', desc: 'Force WebSocket reconnection', shortcut: '', icon: 'wifi', action: () => { this.ws?.close(); this.connect(); } },
      { id: 'toggle-theme', title: `Switch to ${this.theme === 'dark' ? 'Light' : 'Dark'} Mode`, desc: 'Toggle between dark/light theme', shortcut: 'T', icon: 'sun', action: () => this.toggleTheme() },
      { id: 'toggle-gpu', title: this.panelVisibility.gpu ? 'Hide GPU Panel' : 'Show GPU Panel', desc: 'Toggle GPU monitoring panel', shortcut: '', icon: 'cpu', action: () => this.setPanelVisibility('gpu', !this.panelVisibility.gpu) },
      { id: 'toggle-docker', title: this.panelVisibility.docker ? 'Hide Docker Panel' : 'Show Docker Panel', desc: 'Toggle Docker containers panel', shortcut: '', icon: 'box', action: () => this.setPanelVisibility('docker', !this.panelVisibility.docker) },
      { id: 'toggle-services', title: this.panelVisibility.services ? 'Hide Services Panel' : 'Show Services Panel', desc: 'Toggle custom services panel', shortcut: '', icon: 'server', action: () => this.setPanelVisibility('services', !this.panelVisibility.services) },
      { id: 'copy-hostname', title: 'Copy Hostname', desc: 'Copy system hostname to clipboard', shortcut: '', icon: 'copy', action: () => this.copyToClipboard(this.lastStats?.hostname || 'unknown') },
      { id: 'copy-ip', title: 'Copy Primary IP', desc: 'Copy primary network IP address', shortcut: '', icon: 'copy', action: () => this.copyPrimaryIP() },
      { id: 'open-terminal', title: 'Open Terminal', desc: 'Launch system terminal', shortcut: '', icon: 'terminal', action: () => this.openTerminal() },
      { id: 'open-taskmgr', title: 'Open Task Manager', desc: 'Launch Windows Task Manager', shortcut: '', icon: 'activity', action: () => this.openTaskManager() },
      { id: 'restart-service', title: 'Restart Service…', desc: 'Restart a monitored service', shortcut: '', icon: 'rotate-cw', action: () => this.promptServiceRestart() },
      { id: 'export-config', title: 'Export Settings', desc: 'Download current wallpaper config as JSON', shortcut: '', icon: 'download', action: () => this.exportConfig() },
      { id: 'clear-storage', title: 'Clear Local Storage', desc: 'Reset all persisted preferences', shortcut: '', icon: 'trash', action: () => this.clearStorage() },
    ];

    const filtered = commands.filter(c =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.desc.toLowerCase().includes(query.toLowerCase())
    );

    results.innerHTML = filtered.map((cmd, i) => `
      <div class="cmd-result" data-cmd="${cmd.id}" role="option" tabindex="${i === 0 ? 0 : -1}">
        <svg class="cmd-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${this.getCommandIcon(cmd.icon)}
        </svg>
        <div class="cmd-result-main">
          <span class="cmd-result-title">${cmd.title}</span>
          <span class="cmd-result-desc">${cmd.desc}</span>
        </div>
        ${cmd.shortcut ? `<kbd class="cmd-result-shortcut">${cmd.shortcut}</kbd>` : ''}
      </div>
    `).join('');

    // Add click handlers
    results.querySelectorAll('.cmd-result').forEach(el => {
      el.addEventListener('click', () => {
        const cmd = commands.find(c => c.id === el.dataset.cmd);
        if (cmd) { cmd.action(); this.closeCommandPalette(); }
      });
    });

    // Keyboard navigation
    this.setupCommandNavigation(filtered);
  }

  setupCommandNavigation(commands) {
    const results = document.getElementById('cmdResults');
    const items = results?.querySelectorAll('.cmd-result');
    if (!items.length) return;

    let selectedIndex = 0;
    items[0]?.classList.add('selected');

    const handleKey = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[selectedIndex]?.classList.remove('selected');
        selectedIndex = (selectedIndex + 1) % items.length;
        items[selectedIndex]?.classList.add('selected');
        items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[selectedIndex]?.classList.remove('selected');
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        items[selectedIndex]?.classList.add('selected');
        items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = commands[selectedIndex];
        if (cmd) { cmd.action(); this.closeCommandPalette(); }
      } else if (e.key === 'Escape') {
        this.closeCommandPalette();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        return; // Let input handle it
      }
    };

    document.getElementById('cmdInput')?.addEventListener('keydown', handleKey);
  }

  sendCommand(cmd) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: cmd }));
    }
  }

  // Action handlers (would need backend endpoints)
  requestServiceRestart(name) {
    this.sendCommand(`service:restart:${name}`);
    this.showToast('info', 'Service', `Restart requested for ${name}`);
  }

  requestServiceKill(name) {
    if (confirm(`Force kill ${name}?`)) {
      this.sendCommand(`service:kill:${name}`);
      this.showToast('warning', 'Service', `Kill requested for ${name}`);
    }
  }

  requestContainerAction(name, action) {
    this.sendCommand(`docker:${action}:${name}`);
    this.showToast('info', 'Docker', `${action} requested for ${name}`);
  }

  requestProcessKill(pid, force) {
    const signal = force ? 'SIGKILL' : 'SIGTERM';
    if (confirm(`${force ? 'Force kill' : 'Terminate'} process ${pid}?`)) {
      this.sendCommand(`process:kill:${pid}:${force ? 9 : 15}`);
      this.showToast(force ? 'warning' : 'info', 'Process', `${signal} sent to PID ${pid}`);
    }
  }

  promptServiceRestart() {
    const services = this.lastStats?.services?.filter(s => s.running) || [];
    if (!services.length) {
      this.showToast('warning', 'No Services', 'No running services to restart');
      return;
    }
    const commands = services.map(s => ({
      id: `restart-${s.name}`,
      title: `Restart ${s.name}`,
      desc: `PID: ${s.pid}, CPU: ${s.cpu_percent.toFixed(1)}%, RAM: ${s.memory_mb.toFixed(1)} MB`,
      action: () => this.requestServiceRestart(s.name)
    }));
    this.showCommandMenu(commands, 'Select service to restart');
  }

  showCommandMenu(commands, title) {
    // Reuse command palette UI for contextual menus
    const overlay = document.getElementById('cmdPaletteOverlay');
    const results = document.getElementById('cmdResults');
    const input = document.getElementById('cmdInput');
    if (!overlay || !results) return;

    overlay.hidden = false;
    input.value = '';
    input.style.display = 'none'; // Hide input for menu mode

    results.innerHTML = commands.map((cmd, i) => `
      <div class="cmd-result" data-cmd="${cmd.id}" role="option" tabindex="${i === 0 ? 0 : -1}">
        <svg class="cmd-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${this.getCommandIcon('chevron-right')}
        </svg>
        <div class="cmd-result-main">
          <span class="cmd-result-title">${cmd.title}</span>
          ${cmd.desc ? `<span class="cmd-result-desc">${cmd.desc}</span>` : ''}
        </div>
      </div>
    `).join('');

    results.querySelectorAll('.cmd-result').forEach(el => {
      el.addEventListener('click', () => {
        const cmd = commands.find(c => c.id === el.dataset.cmd);
        if (cmd) { cmd.action(); this.closeCommandPalette(); }
      });
    });

    // Nav with arrows, Enter to select, Esc to close
    const items = results.querySelectorAll('.cmd-result');
    let idx = 0;
    items[0]?.classList.add('selected');

    const handleKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); items[idx]?.classList.remove('selected'); idx = (idx + 1) % items.length; items[idx]?.classList.add('selected'); items[idx]?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[idx]?.classList.remove('selected'); idx = (idx - 1 + items.length) % items.length; items[idx]?.classList.add('selected'); items[idx]?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { e.preventDefault(); const cmd = commands[idx]; if (cmd) { cmd.action(); this.closeCommandPalette(); } }
      else if (e.key === 'Escape') { this.closeCommandPalette(); }
    };

    document.getElementById('cmdInput')?.addEventListener('keydown', handleKey);
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('success', 'Copied', text.length > 50 ? text.slice(0, 50) + '…' : text);
    }).catch(() => {
      this.showToast('error', 'Failed', 'Could not copy to clipboard');
    });
  }

  copyPrimaryIP() {
    // Would need backend to expose IPs
    this.showToast('info', 'IP Address', 'Backend update needed to expose IPs');
  }

  openTerminal() {
    this.sendCommand('system:terminal');
    this.showToast('info', 'Terminal', 'Request sent to backend');
  }

  openTaskManager() {
    this.sendCommand('system:taskmgr');
    this.showToast('info', 'Task Manager', 'Request sent to backend');
  }

  exportConfig() {
    const config = {
      theme: this.theme,
      panels: this.panelVisibility,
      config: this.config,
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linacre-wallpaper-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('success', 'Exported', 'Config downloaded');
  }

  clearStorage() {
    if (confirm('Clear all localStorage for this wallpaper?')) {
      localStorage.removeItem('linacre-wallpaper-theme');
      localStorage.removeItem('linacre-wallpaper-panels');
      this.showToast('success', 'Cleared', 'Local storage cleared. Refresh to apply defaults.');
    }
  }

  getCommandIcon(name) {
    const icons = {
      'refresh-cw': '<path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>',
      'wifi': '<path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line>',
      'cpu': '<rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line>',
      'box': '<path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path>',
      'copy': '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
      'terminal': '<polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line>',
      'activity': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>',
      'rotate-cw': '<polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>',
      'sun': '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>',
      'server': '<rect x="2" y="2" width="20" height="20" rx="2"></rect><rect x="6" y="6" width="12" height="12"></rect><line x1="6" y1="18" x2="18" y2="18"></line>',
      'chevron-right': '<polyline points="9 18 15 12 9 6"></polyline>',
      'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',
      'trash': '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
    };
    return icons[name] || '<circle cx="12" cy="12" r="10"></circle>';
  }

  // Utilities
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  formatSpeed(bytesPerSec) {
    return this.formatBytes(bytesPerSec) + '/s';
  }

  formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  drawSparkline(canvas, data, color) {
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Logical (CSS) pixel size. Read the rendered element size, falling back to
    // the element's width/height attributes. NEVER derive this from
    // canvas.width — that is the backing-store size and reading it back here is
    // what caused the canvas (and the sparkline scale) to compound every frame
    // on HiDPI displays.
    const cssW = canvas.clientWidth || parseInt(canvas.getAttribute('width'), 10) || 200;
    const cssH = canvas.clientHeight || parseInt(canvas.getAttribute('height'), 10) || 40;

    // Resize the backing store only when it actually needs to change.
    const needW = Math.round(cssW * dpr);
    const needH = Math.round(cssH * dpr);
    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW;
      canvas.height = needH;
    }

    // Absolute transform (setTransform, not scale) so it doesn't accumulate.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const stepX = cssW / (this.maxSparklinePoints - 1);
    const maxVal = Math.max(...data, 1);
    const pointY = (val) => cssH - (val / maxVal) * (cssH - 4) - 2;
    const lastX = (data.length - 1) * stepX;

    // Gradient fill under the line
    const gradient = ctx.createLinearGradient(0, cssH, 0, 0);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, this.hexToRgba(color, 0.3));

    ctx.beginPath();
    data.forEach((val, i) => {
      const x = i * stepX;
      const y = pointY(val);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(lastX, cssH);
    ctx.lineTo(0, cssH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Stroke the line
    ctx.beginPath();
    data.forEach((val, i) => {
      const x = i * stepX;
      const y = pointY(val);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  showToast(type, title, message) {
    if (window.showToast) {
      window.showToast(type, title, message);
    } else {
      console.log(`[Toast ${type}] ${title}: ${message}`);
    }
  }

  destroy() {
    if (this.ws) { this.ws.close(); this.ws = null; }
    if (this.clockInterval) clearInterval(this.clockInterval);
  }
}