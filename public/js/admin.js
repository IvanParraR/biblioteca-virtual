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

  // ------------------------------------------------------------
  // Acciones masivas en la tabla de libros: seleccionar varias filas
  // con checkboxes y eliminarlas o cambiarles la categoría de una vez.
  // ------------------------------------------------------------
  const selectAll = document.getElementById('select-all');
  const rowCheckboxes = () => Array.from(document.querySelectorAll('.row-checkbox'));
  const bulkBar = document.getElementById('bulk-bar');
  const bulkCount = document.getElementById('bulk-count');

  function selectedIds() {
    return rowCheckboxes().filter((cb) => cb.checked).map((cb) => cb.value);
  }

  function updateBulkBar() {
    if (!bulkBar) return;
    const n = selectedIds().length;
    bulkCount.textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
    bulkBar.classList.toggle('active', n > 0);
    if (selectAll) {
      const total = rowCheckboxes().length;
      selectAll.checked = n > 0 && n === total;
      selectAll.indeterminate = n > 0 && n < total;
    }
  }

  if (selectAll) {
    selectAll.addEventListener('change', () => {
      rowCheckboxes().forEach((cb) => { cb.checked = selectAll.checked; });
      updateBulkBar();
    });
  }
  rowCheckboxes().forEach((cb) => cb.addEventListener('change', updateBulkBar));

  function submitWithIds(formEl, ids) {
    formEl.querySelectorAll('input[name="ids"]').forEach((el) => el.remove());
    ids.forEach((id) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'ids';
      input.value = id;
      formEl.appendChild(input);
    });
    formEl.submit();
  }

  const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', () => {
      const ids = selectedIds();
      if (ids.length === 0) return;
      if (!confirm(`¿Eliminar ${ids.length} libro(s) seleccionado(s) del catálogo? Esta acción no se puede deshacer.`)) return;
      submitWithIds(document.getElementById('bulk-delete-form'), ids);
    });
  }

  const bulkApplyCategoryBtn = document.getElementById('bulk-apply-category');
  if (bulkApplyCategoryBtn) {
    bulkApplyCategoryBtn.addEventListener('click', () => {
      const ids = selectedIds();
      const select = document.getElementById('bulk-category-select');
      if (ids.length === 0) return;
      if (!select.value) { alert('Elige una categoría de destino primero.'); return; }
      const categoryName = select.options[select.selectedIndex].text;
      if (!confirm(`¿Cambiar la categoría de ${ids.length} libro(s) a "${categoryName}"?`)) return;
      document.getElementById('bulk-category-hidden-input').value = select.value;
      submitWithIds(document.getElementById('bulk-category-form'), ids);
    });
  }
});
