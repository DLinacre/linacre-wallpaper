/**
 * Linacre Mission Control Wallpaper — Main Application Entrypoint
 */

import { WallpaperTerminal, initMatrixRain } from './terminal.js';
import { VitalsEngine } from './vitals.js';
import { audioFx } from './audio.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Live Clock & Date
  const clockEl = document.getElementById('liveClock');
  const dateEl = document.getElementById('liveDate');

  function updateClock() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
  }
  updateClock();
  setInterval(updateClock, 1000);

  // 2. Matrix Digital Rain Canvas
  initMatrixRain('matrixCanvas');

  // 3. Interactive Terminal
  const termOut = document.getElementById('terminalOutput');
  const termIn = document.getElementById('terminalInput');
  const termBtn = document.getElementById('termSubmitBtn');
  const terminal = new WallpaperTerminal(termOut, termIn, termBtn);

  // 4. Hardware Vitals Engine
  const vitals = new VitalsEngine();

  // 5. Audio FX Integration
  const soundBtn = document.getElementById('soundToggleBtn');
  const soundOn = document.getElementById('soundIconOn');
  const soundOff = document.getElementById('soundIconOff');

  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      const isMuted = audioFx.toggleMute();
      soundOn.style.display = isMuted ? 'none' : 'block';
      soundOff.style.display = isMuted ? 'block' : 'none';
      if (!isMuted) audioFx.playClick();
    });
  }

  // Audio feedback for terminal typing & chips
  if (termIn) {
    termIn.addEventListener('input', () => audioFx.playKeyTick());
    termIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') audioFx.playSuccess();
    });
  }

  document.querySelectorAll('.chip-btn, .launch-card, .icon-toggle-btn').forEach(el => {
    el.addEventListener('click', () => audioFx.playClick());
  });

  // 6. Controls & Shortcuts
  const matrixBtn = document.getElementById('toggleMatrixBtn');
  if (matrixBtn) {
    matrixBtn.addEventListener('click', () => terminal.cmdToggleMatrix());
  }

  const accentBtn = document.getElementById('accentCycleBtn');
  if (accentBtn) {
    accentBtn.addEventListener('click', () => terminal.cmdTheme());
  }

  const fsBtn = document.getElementById('fullscreenBtn');
  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  // Retest Services button
  const retestBtn = document.getElementById('refreshServicesBtn');
  if (retestBtn) {
    retestBtn.addEventListener('click', () => {
      terminal.execute('services');
    });
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // If user is typing in terminal, don't trigger global shortcuts
    if (document.activeElement === termIn) return;

    if (e.key === 't' || e.key === 'T') {
      termIn.focus();
    } else if (e.key === 'm' || e.key === 'M') {
      terminal.cmdToggleMatrix();
    } else if (e.key === 'c' || e.key === 'C') {
      terminal.cmdTheme();
    } else if (e.key === 's' || e.key === 'S') {
      soundBtn?.click();
    }
  });

  console.log('[Linacre Wallpaper] Mission Control Ready.');
});