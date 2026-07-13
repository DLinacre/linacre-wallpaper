const icons = {
  success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
  info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
};

let toastId = 0;

function dismissToast(container, id) {
  const el = container.querySelector(`[data-toast-id="${id}"]`);
  if (el) {
    el.style.animation = 'slideInRight 0.2s var(--linacre-ease) reverse';
    setTimeout(() => el.remove(), 200);
  }
}

export function setupToasts() {
  const container = document.getElementById('toastContainer');
  if (!container) return () => {};

  return function showToast(type, title, message, duration = 5000) {
    const id = ++toastId;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.dataset.toastId = id;
    toast.innerHTML = `
      ${icons[type] || icons.info}
      <div class="toast-message">
        <strong>${title}</strong>
        <div>${message}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;

    container.appendChild(toast);

    let timer = setTimeout(() => dismissToast(container, id), duration);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      clearTimeout(timer);
      dismissToast(container, id);
    });

    toast.addEventListener('mouseenter', () => clearTimeout(timer));

    toast.addEventListener('mouseleave', () => {
      timer = setTimeout(() => dismissToast(container, id), 2000);
    });
  };
}