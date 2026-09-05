// ============================================================
// Modales de +1 / -1 en la tabla de libros del admin.
//
// Antes, estos botones subían/bajaban available_copies a ciegas,
// sin relación con los préstamos reales. Ahora:
//   -1 → ofrece ir directo a registrar un préstamo (que ya baja
//        la copia solo), o escribir otro motivo (dañado, perdido…)
//   +1 → si el libro tiene préstamos activos, ofrece marcarlos
//        como devueltos uno por uno (lo que sube la copia solo a
//        través del mismo flujo de préstamos), o escribir otro
//        motivo (se encontró, copia nueva…)
// En ningún caso available_copies se mueve sin que quede un
// motivo o un préstamo/devolución de por medio.
// ============================================================
(function () {
  const activeLoansByBook = window.__activeLoansByBook || {};
  const currentPageUrl = window.__currentPageUrl || '/admin/books';

  // ---------- Modal: -1 (marcar no disponible) ----------
  const removeModal = document.getElementById('remove-copy-modal');
  const removeForm = document.getElementById('remove-copy-form');
  const removeTitleEl = document.getElementById('remove-copy-book-title');
  const removeAsLoanLink = document.getElementById('remove-copy-as-loan');
  const removeToggleReason = document.getElementById('remove-copy-toggle-reason');
  const removeReasonWrap = document.getElementById('remove-copy-reason-wrap');
  const removeReasonInput = document.getElementById('remove-copy-reason');
  const removeSubmitBtn = document.getElementById('remove-copy-submit');
  const removeCancelBtn = document.getElementById('remove-copy-cancel');
  const removeRedirectInput = document.getElementById('remove-copy-redirect-to');

  function resetRemoveModal() {
    removeReasonWrap.style.display = 'none';
    removeSubmitBtn.style.display = 'none';
    removeReasonInput.value = '';
  }

  document.querySelectorAll('.js-remove-copy-trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!removeModal) return;
      const bookId = btn.dataset.bookId;
      removeForm.setAttribute('action', `/admin/books/${bookId}/remove-copies`);
      removeTitleEl.textContent = btn.dataset.title || 'este libro';
      removeAsLoanLink.setAttribute('href', `/admin/loans/new?book_id=${bookId}`);
      removeRedirectInput.value = currentPageUrl;
      resetRemoveModal();
      removeModal.classList.add('open');
    });
  });

  if (removeToggleReason) {
    removeToggleReason.addEventListener('click', (e) => {
      e.preventDefault();
      const showing = removeReasonWrap.style.display !== 'none';
      removeReasonWrap.style.display = showing ? 'none' : 'block';
      removeSubmitBtn.style.display = showing ? 'none' : 'inline-flex';
      if (!showing) removeReasonInput.focus();
    });
  }
  if (removeCancelBtn) removeCancelBtn.addEventListener('click', () => removeModal.classList.remove('open'));
  if (removeModal) {
    removeModal.addEventListener('click', (e) => {
      if (e.target === removeModal) removeModal.classList.remove('open');
    });
  }

  // ---------- Modal: +1 (marcar disponible) ----------
  const addModal = document.getElementById('add-copy-modal');
  const addForm = document.getElementById('add-copy-form');
  const addTitleEl = document.getElementById('add-copy-book-title');
  const addLoansList = document.getElementById('add-copy-loans-list');
  const addToggleReason = document.getElementById('add-copy-toggle-reason');
  const addReasonWrap = document.getElementById('add-copy-reason-wrap');
  const addReasonInput = document.getElementById('add-copy-reason');
  const addSubmitBtn = document.getElementById('add-copy-submit');
  const addCancelBtn = document.getElementById('add-copy-cancel');
  const addRedirectInput = document.getElementById('add-copy-redirect-to');

  function resetAddModal() {
    addReasonWrap.style.display = 'none';
    addSubmitBtn.style.display = 'none';
    addReasonInput.value = '';
    addLoansList.innerHTML = '';
  }

  function buildLoanReturnRow(loan) {
    const wrap = document.createElement('form');
    wrap.method = 'POST';
    wrap.action = `/admin/loans/${loan.id}/return`;
    wrap.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border:1px solid var(--forest-100); border-radius:var(--radius-sm); margin-bottom:8px;';

    const redirectInput = document.createElement('input');
    redirectInput.type = 'hidden';
    redirectInput.name = 'redirect_to';
    redirectInput.value = currentPageUrl;
    wrap.appendChild(redirectInput);

    const info = document.createElement('div');
    info.style.fontSize = '0.85rem';
    const dueDate = new Date(loan.due_date).toLocaleDateString('es-CO');
    const dueColor = loan.is_overdue ? 'var(--status-unavailable-fg)' : 'var(--ink-600)';
    info.innerHTML = `<strong>${loan.student_name}</strong><br><span style="color:${dueColor};">Vence ${dueDate}${loan.is_overdue ? ' — Atrasado' : ''}</span>`;
    wrap.appendChild(info);

    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'btn btn-outline btn-sm';
    btn.style.flexShrink = '0';
    btn.textContent = 'Marcar devuelto';
    wrap.appendChild(btn);

    return wrap;
  }

  document.querySelectorAll('.js-add-copy-trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!addModal) return;
      const bookId = btn.dataset.bookId;
      addForm.setAttribute('action', `/admin/books/${bookId}/add-copies`);
      addTitleEl.textContent = btn.dataset.title || 'este libro';
      addRedirectInput.value = currentPageUrl;
      resetAddModal();

      const loans = activeLoansByBook[bookId] || [];
      if (loans.length > 0) {
        const heading = document.createElement('p');
        heading.style.cssText = 'font-size:0.85rem; font-weight:600; margin-bottom:8px; color:var(--forest-800);';
        heading.textContent = 'Préstamos activos de este libro:';
        addLoansList.appendChild(heading);
        loans.forEach((loan) => addLoansList.appendChild(buildLoanReturnRow(loan)));
      }

      addModal.classList.add('open');
    });
  });

  if (addToggleReason) {
    addToggleReason.addEventListener('click', (e) => {
      e.preventDefault();
      const showing = addReasonWrap.style.display !== 'none';
      addReasonWrap.style.display = showing ? 'none' : 'block';
      addSubmitBtn.style.display = showing ? 'none' : 'inline-flex';
      if (!showing) addReasonInput.focus();
    });
  }
  if (addCancelBtn) addCancelBtn.addEventListener('click', () => addModal.classList.remove('open'));
  if (addModal) {
    addModal.addEventListener('click', (e) => {
      if (e.target === addModal) addModal.classList.remove('open');
    });
  }
})();
