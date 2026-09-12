/**
 * Linacre Wallpaper — Hardware Vitals & Telemetry Engine
 */

export class VitalsEngine {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.coreBars = [];
    this.initCores();
    this.startLoop();
    this.tryConnectWS();
  }

  initCores() {
    const container = document.getElementById('cpuThreadsGrid');
    if (!container) return;
    container.innerHTML = '';
    this.coreBars = [];
    for (let i = 0; i < 16; i++) {
      const bar = document.createElement('div');
      bar.className = 'core-bar-item';
      bar.style.height = `${Math.floor(10 + Math.random() * 30)}%`;
      container.appendChild(bar);
      this.coreBars.push(bar);
    }
  }

  tryConnectWS() {
    try {
      this.ws = new WebSocket('ws://127.0.0.1:8765/ws');
      this.ws.onopen = () => {
        this.connected = true;
        console.log('[Vitals] Connected to hardware WebSocket backend');
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'stats' && msg.payload) {
            this.updateFromPayload(msg.payload);
          }
        } catch (e) {}
      };
      this.ws.onclose = () => {
        this.connected = false;
        setTimeout(() => this.tryConnectWS(), 5000);
      };
      this.ws.onerror = () => {
        this.connected = false;
      };
    } catch (e) {
      this.connected = false;
    }
  }

  startLoop() {
    setInterval(() => {
      if (!this.connected) {
        this.simulateMicroVitals();
      }
    }, 1500);
  }

  simulateMicroVitals() {
    // Realistic simulation variations for Intel CPU + RTX 3070 Ti + 64 GB RAM
    const cpuBase = 12 + Math.floor(Math.random() * 14); // 12-26%
    const cpuEl = document.getElementById('cpuStatPercent');
    const cpuBar = document.getElementById('cpuMeterBar');
    if (cpuEl) cpuEl.textContent = `${cpuBase}%`;
    if (cpuBar) cpuBar.style.width = `${cpuBase}%`;

    // Core threads
    this.coreBars.forEach(b => {
      const h = Math.max(8, Math.min(100, cpuBase + (Math.random() * 35 - 15)));
      b.style.height = `${Math.floor(h)}%`;
    });

    // CPU Temp & Freq
    const tempEl = document.getElementById('cpuTemp');
    const freqEl = document.getElementById('cpuFreq');
    if (tempEl) tempEl.textContent = `${Math.floor(39 + (cpuBase * 0.3))}&deg;C`;
    if (freqEl) freqEl.textContent = `${(4.6 + Math.random() * 0.3).toFixed(2)} GHz`;

    // GPU (RTX 3070 Ti)
    const gpuBase = 10 + Math.floor(Math.random() * 8);
    const gpuEl = document.getElementById('gpuStatPercent');
    const gpuBar = document.getElementById('gpuMeterBar');
    const gpuTempEl = document.getElementById('gpuTemp');
    const gpuPowerEl = document.getElementById('gpuPower');
    if (gpuEl) gpuEl.textContent = `${gpuBase}%`;
    if (gpuBar) gpuBar.style.width = `${gpuBase}%`;
    if (gpuTempEl) gpuTempEl.textContent = `${46 + Math.floor(Math.random() * 3)}&deg;C`;
    if (gpuPowerEl) gpuPowerEl.textContent = `${75 + Math.floor(Math.random() * 20)} W`;

    // RAM (64 GB)
    const ramUsedBase = (18.2 + Math.random() * 0.4).toFixed(1);
    const ramPct = Math.floor((ramUsedBase / 64) * 100);
    const ramPctEl = document.getElementById('ramStatPercent');
    const ramBar = document.getElementById('ramMeterBar');
    const ramUsedEl = document.getElementById('ramUsed');
    const ramFreeEl = document.getElementById('ramFree');
    if (ramPctEl) ramPctEl.textContent = `${ramPct}%`;
    if (ramBar) ramBar.style.width = `${ramPct}%`;
    if (ramUsedEl) ramUsedEl.textContent = `${ramUsedBase} GB`;
    if (ramFreeEl) ramFreeEl.textContent = `${(64 - ramUsedBase).toFixed(1)} GB`;
  }

  updateFromPayload(payload) {
    if (payload.cpu) {
      const cpu = Math.round(payload.cpu.total || 0);
      const cpuEl = document.getElementById('cpuStatPercent');
      const cpuBar = document.getElementById('cpuMeterBar');
      if (cpuEl) cpuEl.textContent = `${cpu}%`;
      if (cpuBar) cpuBar.style.width = `${cpu}%`;
    }
    if (payload.gpu) {
      const gpu = Math.round(payload.gpu.usage || 0);
      const gpuEl = document.getElementById('gpuStatPercent');
      const gpuBar = document.getElementById('gpuMeterBar');
      if (gpuEl) gpuEl.textContent = `${gpu}%`;
      if (gpuBar) gpuBar.style.width = `${gpu}%`;
    }
    if (payload.memory) {
      const mem = Math.round(payload.memory.percent || 0);
      const ramPctEl = document.getElementById('ramStatPercent');
      const ramBar = document.getElementById('ramMeterBar');
      if (ramPctEl) ramPctEl.textContent = `${mem}%`;
      if (ramBar) ramBar.style.width = `${mem}%`;
    }
  }
}
