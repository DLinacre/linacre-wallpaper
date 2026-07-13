/**
 * Command Palette Component
 * Handles Cmd+K palette with searchable commands
 */

export function setupCommandPalette(app) {
  const overlay = document.getElementById('cmdPaletteOverlay');
  const input = document.getElementById('cmdInput');
  const results = document.getElementById('cmdResults');

  if (!overlay || !input || !results) return;

  let debounceTimer = null;

  input.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      app.populateCommands(e.target.value);
    }, 50);
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      app.closeCommandPalette();
    }
  });

  // Prevent closing when clicking inside palette
  document.getElementById('cmdPalette')?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Global open handler (also triggered from app)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      app.openCommandPalette();
    }
  });

  console.log('[CommandPalette] Ready');
}
