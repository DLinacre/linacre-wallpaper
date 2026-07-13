/**
 * Linacre Wallpaper — Frontend Entry Point
 * Real-time system monitor with linacre.site theme
 */

import { WallpaperApp } from './app.js';
import { registerFonts } from './utils/fonts.js';
import { setupCommandPalette } from './components/CommandPalette.js';
import { setupToasts } from './components/Toast.js';

// Global error handler
window.addEventListener('error', (e) => {
  console.error('[Wallpaper] Uncaught error:', e.error);
  showToast('error', 'Runtime Error', e.error?.message || 'Unknown error');
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Wallpaper] Unhandled rejection:', e.reason);
  showToast('error', 'Async Error', e.reason?.message || 'Unknown error');
});

// Initialize app when DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  // Register local fonts
  await registerFonts();

  // Initialize main app
  const app = new WallpaperApp();
  await app.init();

  // Setup command palette
  setupCommandPalette(app);

  // Setup toast system
  window.showToast = setupToasts();

  // Expose for debugging
  window.__LINACRE_WALLPAPER__ = app;

  console.log('[Linacre Wallpaper] Initialized');
});

// Toast helper (will be replaced by setupToasts)
function showToast(type, title, message) {
  console.log(`[Toast ${type}] ${title}: ${message}`);
}