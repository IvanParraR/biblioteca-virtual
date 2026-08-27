// ============================================================
// JS del sitio de estudiante — mejoras progresivas de UX.
// La aplicación funciona por completo sin JS (formularios GET
// nativos); este script solo agrega comodidades.
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Auto-envío al cambiar select de filtros en el catálogo (además del botón).
  const filterBar = document.querySelector('.filter-bar');
  if (filterBar) {
    filterBar.querySelectorAll('select').forEach((select) => {
      select.addEventListener('change', () => filterBar.submit());
    });
  }
});
