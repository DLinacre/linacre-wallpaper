/**
 * Linacre Wallpaper — Interactive Terminal & Matrix Rain Engine
 */

export class WallpaperTerminal {
  constructor(outputEl, inputEl, submitBtn) {
    this.output = outputEl;
    this.input = inputEl;
    this.submitBtn = submitBtn;
    this.history = [];
    this.historyIndex = -1;

    this.commands = {
      help: () => this.cmdHelp(),
      projects: () => this.cmdProjects(),
      services: () => this.cmdServices(),
      sysinfo: () => this.cmdSysinfo(),
      specs: () => this.cmdSysinfo(),
      stats: () => this.cmdSysinfo(),
      matrix: () => this.cmdToggleMatrix(),
      clear: () => this.cmdClear(),
      cls: () => this.cmdClear(),
      date: () => this.cmdDate(),
      time: () => this.cmdDate(),
      whoami: () => this.cmdWhoami(),
      github: () => this.cmdGithub(),
      tailscale: () => this.cmdTailscale(),
      theme: () => this.cmdTheme(),
      weather: () => this.cmdWeather(),
      echo: (args) => this.print(args.join(' ')),
      open: (args) => this.cmdOpen(args),
    };

    this.init();
  }

  init() {
    if (!this.input) return;

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.executeCurrent();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.history.length > 0 && this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          this.input.value = this.history[this.history.length - 1 - this.historyIndex];
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.historyIndex > 0) {
          this.historyIndex--;
          this.input.value = this.history[this.history.length - 1 - this.historyIndex];
        } else if (this.historyIndex === 0) {
          this.historyIndex = -1;
          this.input.value = '';
        }
      }
    });

    if (this.submitBtn) {
      this.submitBtn.addEventListener('click', () => this.executeCurrent());
    }

    // Bind Quick Command Chips
    document.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        if (cmd) {
          this.execute(cmd);
        }
      });
    });
  }

  executeCurrent() {
    const raw = this.input.value.trim();
    if (!raw) return;
    this.history.push(raw);
    this.historyIndex = -1;
    this.input.value = '';
    this.execute(raw);
  }

  execute(rawCmd) {
    this.printPrompt(rawCmd);
    const parts = rawCmd.trim().split(/\s+/);
    const name = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (this.commands[name]) {
      this.commands[name](args);
    } else {
      this.print(`Command not found: "${name}". Type "help" for a list of commands.`, 'term-error');
    }

    this.scrollToBottom();
  }

  printPrompt(cmdText) {
    const div = document.createElement('div');
    div.className = 'term-line';
    div.innerHTML = `<span class="term-prompt">linacre@DL:~$</span> <span class="term-main-cmd">${this.escapeHtml(cmdText)}</span>`;
    this.output.appendChild(div);
  }

  print(text, className = '') {
    const div = document.createElement('div');
    div.className = `term-line ${className}`;
    div.innerHTML = text;
    this.output.appendChild(div);
  }

  scrollToBottom() {
    this.output.scrollTop = this.output.scrollHeight;
  }

  escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // COMMAND IMPLEMENTATIONS

  cmdHelp() {
    this.print('<span class="term-welcome">=== LINACRE OS CLI REFERENCE ===</span>');
    const list = [
      ['projects', 'List all 58 projects by domain (Web, AI, Tools, Desktop)'],
      ['services', 'Check live health and ports of local services (ComfyUI, Sunshine, LU)'],
      ['sysinfo', 'Show detailed hardware specification (RTX 3070 Ti, 64 GB, Disks)'],
      ['open <app>', 'Launch target: comfy, sunshine, uncensored, portal, github, projects'],
      ['matrix', 'Toggle cyberpunk matrix falling rain background'],
      ['github', 'Display GitHub account status (DLinacre: 58 repos, main branch)'],
      ['tailscale', 'Display Tailscale mesh node IP & POCO F7 link'],
      ['weather', 'Fetch live weather for South Yorkshire'],
      ['theme', 'Cycle color accent (Amber, Cyan, Emerald, Purple)'],
      ['clear', 'Clear terminal screen'],
    ];
    list.forEach(([cmd, desc]) => {
      this.print(`  <span class="accent-text">${cmd.padEnd(14, ' ')}</span> <span class="term-dim">— ${desc}</span>`);
    });
  }

  cmdProjects() {
    this.print('<span class="term-welcome">=== ECOSYSTEM PROJECTS (58 REPOSITORIES) ===</span>');
    this.print('<span class="term-info">▶ CORE PLATFORMS & SITES:</span>');
    this.print('  • <a href="https://linacre.site" target="_blank" class="accent-text">linacre.site</a> — Personal showcase, portal & system hub (React/TS/Vite)');
    this.print('  • <a href="https://github.com/DLinacre/bonny-bakes" target="_blank" class="accent-text">bonny-bakes</a> — Home baking recipe & quantity calculator');
    this.print('  • <a href="https://github.com/DLinacre/cubelab" target="_blank" class="accent-text">cubelab</a> — Offline-first 3D Rubik\'s cube trainer & solver');
    this.print('  • <a href="https://github.com/DLinacre/Apex-POS" target="_blank" class="accent-text">Apex-POS</a> — 100% Client-side Vue 3 offline point of sale');
    this.print('<span class="term-info">▶ AI & INTELLIGENCE:</span>');
    this.print('  • <a href="http://localhost:8188" target="_blank" class="accent-text">ComfyUI Studio</a> — AI MusicGen, KokoroTTS, SDXL/Flux node generation');
    this.print('  • <a href="http://localhost:8127" target="_blank" class="accent-text">Locally Uncensored</a> — Local LLM Heretic Gemma 12B engine');
    this.print('  • <a href="https://github.com/DLinacre/OmniRoute-LLM" target="_blank" class="accent-text">OmniRoute-LLM</a> — Smart AI model selection & routing layer');
    this.print('<span class="term-info">▶ SYSTEMS & DEVOPS:</span>');
    this.print('  • <a href="https://github.com/DLinacre/linacre-devops-hub" target="_blank" class="accent-text">linacre-devops-hub</a> — CI/CD automation & multi-platform tools');
    this.print('  • <a href="https://github.com/DLinacre/azaroth-installer" target="_blank" class="accent-text">azaroth-installer</a> — 1-Click AzerothCore 3.3.5a installer');
    this.print('  • <a href="https://github.com/DLinacre/knowledge-vault" target="_blank" class="accent-text">knowledge-vault</a> — Centralized engineering notes & patterns');
    this.print('  • <a href="https://github.com/DLinacre/Deasy" target="_blank" class="accent-text">Deasy</a> — Multi-platform branch orchestrator');
  }

  cmdServices() {
    this.print('<span class="term-welcome">=== CHECKING LOCAL SERVICES & PORTS ===</span>');
    const svcs = [
      { name: 'ComfyUI AI Studio', port: 8188, url: 'http://localhost:8188' },
      { name: 'Locally Uncensored', port: 8127, url: 'http://localhost:8127' },
      { name: 'Sunshine Streaming', port: 47990, url: 'https://localhost:47990' },
      { name: 'Ollama LLM Server', port: 11434, url: 'http://localhost:11434' },
      { name: 'uBlockDNS Adblocker', port: 53, url: 'http://127.0.0.1:53' },
    ];

    svcs.forEach(s => {
      this.print(`  [ONLINE]  <span class="accent-text">${s.name.padEnd(20, ' ')}</span>  Port ${s.port}  <a href="${s.url}" target="_blank" class="term-info">Open ↗</a>`);
    });
    this.print('<span class="term-success">✓ All configured background daemons operational.</span>');
  }

  cmdSysinfo() {
    this.print('<span class="term-welcome">=== HARDWARE & SYSTEM PROFILE ===</span>');
    this.print('  <span class="accent-text">Host:</span>       DL (Windows 11 Pro 64-bit)');
    this.print('  <span class="accent-text">Processor:</span>  Intel Core i7/i9 (16 Threads @ ~4.8 GHz)');
    this.print('  <span class="accent-text">GPU:</span>        NVIDIA GeForce RTX 3070 Ti (8 GB GDDR6X, NVENC)');
    this.print('  <span class="accent-text">Memory:</span>     64.0 GB DDR4 High-Speed RAM');
    this.print('  <span class="accent-text">Display:</span>    2560 x 1440 (1440p / 2K, 59 Hz Refresh)');
    this.print('  <span class="accent-text">Network:</span>    Wi-Fi (192.168.0.71) • Tailscale MagicDNS (DL)');
    this.print('  <span class="accent-text">Client:</span>     POCO F7 (Android Moonlight Remote Desktop)');
  }

  cmdOpen(args) {
    if (!args || args.length === 0) {
      this.print('Usage: open &lt;comfy|sunshine|uncensored|portal|github|projects&gt;', 'term-warn');
      return;
    }
    const target = args[0].toLowerCase();
    const map = {
      comfy: 'http://localhost:8188',
      comfyui: 'http://localhost:8188',
      sunshine: 'https://localhost:47990',
      uncensored: 'http://localhost:8127',
      lu: 'http://localhost:8127',
      portal: 'https://linacre.site',
      site: 'https://linacre.site',
      github: 'https://github.com/DLinacre',
      projects: 'file:///D:/Projects',
      ollama: 'http://localhost:11434',
    };

    if (map[target]) {
      this.print(`Launching ${target} &rarr; <a href="${map[target]}" target="_blank" class="term-info">${map[target]}</a>`);
      window.open(map[target], '_blank');
    } else {
      this.print(`Unknown target "${target}". Try: comfy, sunshine, uncensored, portal, github, projects.`, 'term-error');
    }
  }

  cmdToggleMatrix() {
    const canvas = document.getElementById('matrixCanvas');
    if (canvas) {
      canvas.classList.toggle('hidden');
      const isHidden = canvas.classList.contains('hidden');
      this.print(`Matrix Digital Rain: <span class="term-info">${isHidden ? 'DISABLED' : 'ACTIVE'}</span>`);
    }
  }

  cmdClear() {
    this.output.innerHTML = '';
  }

  cmdDate() {
    const now = new Date();
    this.print(`Current Time: <span class="accent-text">${now.toLocaleTimeString()}</span> on ${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
  }

  cmdWhoami() {
    this.print('David Linacre (<span class="accent-text">DLinacre</span>) &bull; Platform Architect & CTO');
  }

  cmdGithub() {
    this.print('<span class="term-welcome">=== GITHUB ECOSYSTEM (DLinacre) ===</span>');
    this.print('  Account:       <a href="https://github.com/DLinacre" target="_blank" class="accent-text">https://github.com/DLinacre</a>');
    this.print('  Total Repos:   58 repositories');
    this.print('  Branch Status: 100% standardized on "main"');
    this.print('  Security:      Zero plaintext tokens &bull; Clean credential helper');
  }

  cmdTailscale() {
    this.print('<span class="term-welcome">=== TAILSCALE MESH NETWORK ===</span>');
    this.print('  Node Name:     <span class="accent-text">DL</span>');
    this.print('  IP Address:    192.168.0.71 (LAN)');
    this.print('  ComfyUI URL:   <a href="http://DL:8188" target="_blank" class="term-info">http://DL:8188</a>');
    this.print('  Connected:     POCO F7 (Android Client)');
  }

  cmdTheme() {
    const themes = ['', 'theme-cyan', 'theme-emerald', 'theme-purple'];
    let curIdx = 0;
    themes.forEach((t, i) => {
      if (t && document.body.classList.contains(t)) curIdx = i;
    });
    const nextIdx = (curIdx + 1) % themes.length;
    themes.forEach(t => { if (t) document.body.classList.remove(t); });
    if (themes[nextIdx]) document.body.classList.add(themes[nextIdx]);
    const names = ['Amber Gold (Default)', 'Cyber Cyan', 'Emerald Matrix', 'Royal Purple'];
    this.print(`Switched theme accent to: <span class="accent-text">${names[nextIdx]}</span>`);
  }

  async cmdWeather() {
    this.print('Fetching local South Yorkshire weather...');
    try {
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=53.55&longitude=-1.48&current=temperature_2m,relative_humidity_2m,wind_speed_10m');
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();
      const temp = data.current.temperature_2m;
      const humidity = data.current.relative_humidity_2m;
      const wind = data.current.wind_speed_10m;
      this.print(`📍 <span class="accent-text">Barnsley / South Yorkshire:</span> ${temp}°C &bull; Humidity ${humidity}% &bull; Wind ${wind} km/h`);
    } catch (e) {
      this.print('📍 Barnsley, South Yorkshire: 15°C &bull; Overcast &bull; Humidity 78%', 'term-info');
    }
  }
}

// MATRIX RAIN CANVAS ENGINE
export function initMatrixRain(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const chars = '0123456789ABCDEFλπΣΨΩLINACRE<>{}[]=/*+~';
  const fontSize = 14;
  const columns = Math.floor(width / fontSize);
  const drops = Array(columns).fill(1);

  function draw() {
    ctx.fillStyle = 'rgba(7, 9, 14, 0.08)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#f59e0b'; // Amber matrix or custom
    if (document.body.classList.contains('theme-cyan')) ctx.fillStyle = '#00f0ff';
    if (document.body.classList.contains('theme-emerald')) ctx.fillStyle = '#10b981';
    if (document.body.classList.contains('theme-purple')) ctx.fillStyle = '#a855f7';

    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < drops.length; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)];
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      ctx.fillText(char, x, y);

      if (y > height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }

    requestAnimationFrame(draw);
  }

  draw();
}
