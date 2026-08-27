// ============================================================
// JS del panel de administración — modal de confirmación de
// eliminación y auto-envío de filtros.
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('delete-modal');
  const form = document.getElementById('delete-form');
  const titleEl = document.getElementById('delete-book-title');
  const cancelBtn = document.getElementById('delete-cancel');

  document.querySelectorAll('.js-delete-trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!modal || !form) return;
      form.setAttribute('action', btn.dataset.action);
      titleEl.textContent = btn.dataset.title || 'este libro';
      modal.classList.add('open');
    });
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => modal.classList.remove('open'));
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') modal.classList.remove('open');
    });
  }

  // Auto-envío al cambiar filtros de la tabla de libros.
  const filterBar = document.querySelector('.filter-bar');
  if (filterBar) {
    filterBar.querySelectorAll('select').forEach((select) => {
      select.addEventListener('change', () => filterBar.submit());
    });
  }
});
