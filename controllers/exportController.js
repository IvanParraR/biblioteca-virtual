const Settings = require('../models/Settings');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const Book = require('../models/Book');
const Loan = require('../models/Loan');
const ActivityLog = require('../models/ActivityLog');

const SCHOOL_NAME = () => Settings.get().school_name;

// Colores del sistema de diseño (verde bosque + dorado) reutilizados
// en los reportes exportados, para que se sientan parte de la misma
// aplicación en vez de un documento genérico.
const FOREST_DARK = '1F3A2E';
const GOLD = 'C9A227';

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function filtersSummary(filters) {
  const parts = [];
  if (filters.q) parts.push(`búsqueda: "${filters.q}"`);
  if (filters.categoryName) parts.push(`categoría: ${filters.categoryName}`);
  if (filters.availability) parts.push(`disponibilidad: ${filters.availability}`);
  return parts.length ? parts.join(', ') : 'catálogo completo (sin filtros)';
}

// Reutiliza los mismos query params que la tabla de administración
// de libros (q, category, availability), así el archivo exportado
// refleja exactamente lo que el admin está viendo en pantalla.
async function getFilteredBooks(req) {
  const { q, category, availability } = req.query;
  const books = await Book.searchAll({ q, category, availability, sort: 'title', order: 'asc' });

  let categoryName = null;
  if (category && books.length > 0) categoryName = books[0].category;

  return { books, filters: { q, categoryName, availability } };
}

exports.exportExcel = async (req, res) => {
  try {
    const { books, filters } = await getFilteredBooks(req);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = SCHOOL_NAME();
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Catálogo', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    sheet.columns = [
      { header: 'Título', key: 'title', width: 34 },
      { header: 'Autor', key: 'author', width: 26 },
      { header: 'ISBN', key: 'isbn', width: 16 },
      { header: 'Categoría', key: 'category', width: 16 },
      { header: 'Editorial', key: 'publisher', width: 20 },
      { header: 'Año', key: 'publication_year', width: 8 },
      { header: 'Copias totales', key: 'total_copies', width: 13 },
      { header: 'Disponibles', key: 'available_copies', width: 12 },
      { header: 'Estado', key: 'status_label', width: 20 },
      { header: 'Ubicación', key: 'location', width: 26 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${FOREST_DARK}` } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 22;

    books.forEach((b) => {
      sheet.addRow({
        title: b.title,
        author: b.author,
        isbn: b.isbn,
        category: b.category,
        publisher: b.publisher || '',
        publication_year: b.publication_year || '',
        total_copies: b.total_copies,
        available_copies: b.available_copies,
        status_label: b.status_label,
        location: b.location || '',
      });
    });

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        cell.font = { ...(cell.font || {}), name: 'Calibri', size: 10.5 };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE0DCC9' } },
        };
      });
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.eachCell({ includeEmpty: false }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2EFE2' } };
        });
      }
    });

    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: `J${books.length + 1}` };

    // Hoja resumen con estadísticas rápidas — útil para inventario anual.
    const summarySheet = workbook.addWorksheet('Resumen');
    summarySheet.columns = [{ key: 'label', width: 28 }, { key: 'value', width: 40 }];
    const totalCopies = books.reduce((sum, b) => sum + b.total_copies, 0);
    const availableCopies = books.reduce((sum, b) => sum + b.available_copies, 0);
    const summaryRows = [
      ['Institución', SCHOOL_NAME()],
      ['Fecha de exportación', new Date().toLocaleString('es-ES')],
      ['Filtros aplicados', filtersSummary(filters)],
      ['Total de libros', books.length],
      ['Total de copias', totalCopies],
      ['Copias disponibles', availableCopies],
      ['Copias prestadas', totalCopies - availableCopies],
    ];
    summaryRows.forEach(([label, value]) => summarySheet.addRow({ label, value }));
    summarySheet.getColumn('label').font = { bold: true };

    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'catalog_exported',
      entityLabel: `Excel — ${books.length} libro(s)`,
      details: filtersSummary(filters),
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="catalogo-biblioteca-${todayStamp()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo generar el archivo Excel.');
    res.redirect('/admin/books');
  }
};

exports.exportPdf = async (req, res) => {
  try {
    const { books, filters } = await getFilteredBooks(req);

    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="catalogo-biblioteca-${todayStamp()}.pdf"`);
    doc.pipe(res);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columns = [
      { key: 'title', label: 'Título', width: 0.24 },
      { key: 'author', label: 'Autor', width: 0.16 },
      { key: 'isbn', label: 'ISBN', width: 0.11 },
      { key: 'category', label: 'Categoría', width: 0.10 },
      { key: 'publication_year', label: 'Año', width: 0.05 },
      { key: 'total_copies', label: 'Total', width: 0.06 },
      { key: 'available_copies', label: 'Disp.', width: 0.06 },
      { key: 'status_label', label: 'Estado', width: 0.11 },
      { key: 'location', label: 'Ubicación', width: 0.11 },
    ].map((c) => ({ ...c, width: c.width * pageWidth }));

    const truncate = (text, maxChars) => {
      if (!text) return '';
      const s = String(text);
      return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
    };

    const drawReportHeader = () => {
      doc.fillColor(`#${FOREST_DARK}`).fontSize(18).font('Helvetica-Bold')
        .text(SCHOOL_NAME(), doc.page.margins.left, doc.page.margins.top);
      doc.fillColor('#4E5A4C').fontSize(10).font('Helvetica')
        .text('Catálogo de Biblioteca — Reporte de inventario', { continued: false });
      doc.fontSize(9).fillColor('#7C8A78')
        .text(`Generado: ${new Date().toLocaleString('es-ES')}  ·  Filtros: ${filtersSummary(filters)}  ·  ${books.length} libro(s)`);
      doc.moveDown(0.6);
    };

    const drawTableHeader = (y) => {
      let x = doc.page.margins.left;
      doc.fillColor(`#${FOREST_DARK}`).rect(x, y, pageWidth, 20).fill();
      doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold');
      columns.forEach((col) => {
        doc.text(col.label, x + 4, y + 6, { width: col.width - 8, ellipsis: true });
        x += col.width;
      });
      return y + 20;
    };

    let y;
    drawReportHeader();
    y = drawTableHeader(doc.y);

    const rowHeight = 18;
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    doc.font('Helvetica').fontSize(8);
    books.forEach((b, idx) => {
      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = drawTableHeader(doc.page.margins.top);
      }
      if (idx % 2 === 1) {
        doc.fillColor('#F2EFE2').rect(doc.page.margins.left, y, pageWidth, rowHeight).fill();
      }
      let x = doc.page.margins.left;
      const cells = {
        title: truncate(b.title, 42),
        author: truncate(b.author, 28),
        isbn: b.isbn,
        category: truncate(b.category, 16),
        publication_year: b.publication_year || '—',
        total_copies: String(b.total_copies),
        available_copies: String(b.available_copies),
        status_label: b.status_label,
        location: truncate(b.location, 18),
      };
      doc.fillColor('#22281F');
      columns.forEach((col) => {
        doc.text(String(cells[col.key] ?? ''), x + 4, y + 5, { width: col.width - 8, ellipsis: true });
        x += col.width;
      });
      y += rowHeight;
    });

    doc.end();

    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'catalog_exported',
      entityLabel: `PDF — ${books.length} libro(s)`,
      details: filtersSummary(filters),
    });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      req.flash('error', 'No se pudo generar el archivo PDF.');
      res.redirect('/admin/books');
    } else {
      res.end();
    }
  }
};

// ============================================================
// Exportación de PRÉSTAMOS (Excel/PDF) — mismo enfoque que el
// catálogo de libros arriba, aplicado al historial de préstamos.
// ============================================================

function loanStatusLabel(l) {
  if (l.returned_at) return 'Devuelto';
  return l.is_overdue ? 'Atrasado' : 'A tiempo';
}

function loanFiltersSummary(q) {
  return q ? `búsqueda: "${q}"` : 'historial completo (sin filtro)';
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('es-ES') : '';
}

exports.exportLoansExcel = async (req, res) => {
  try {
    const q = req.query.q || '';
    const loans = await Loan.exportHistory({ q });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = SCHOOL_NAME();
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Préstamos', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    sheet.columns = [
      { header: 'Libro', key: 'book_title', width: 32 },
      { header: 'Estudiante', key: 'student_name', width: 26 },
      { header: 'Código', key: 'student_code', width: 14 },
      { header: 'Grado', key: 'student_grade', width: 12 },
      { header: 'Prestado el', key: 'loaned_at', width: 14 },
      { header: 'Fecha límite', key: 'due_date', width: 14 },
      { header: 'Devuelto el', key: 'returned_at', width: 14 },
      { header: 'Estado', key: 'status_label', width: 14 },
      { header: 'Renovaciones', key: 'renewal_count', width: 13 },
      { header: 'Registrado por', key: 'loaned_by', width: 16 },
      { header: 'Devuelto por', key: 'returned_by', width: 16 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${FOREST_DARK}` } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 22;

    loans.forEach((l) => {
      sheet.addRow({
        book_title: l.book_title,
        student_name: l.student_name,
        student_code: l.student_code || '',
        student_grade: l.student_grade || '',
        loaned_at: fmtDate(l.loaned_at),
        due_date: fmtDate(l.due_date),
        returned_at: fmtDate(l.returned_at),
        status_label: loanStatusLabel(l),
        renewal_count: l.renewal_count,
        loaned_by: l.loaned_by,
        returned_by: l.returned_by || '',
      });
    });

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        cell.font = { ...(cell.font || {}), name: 'Calibri', size: 10.5 };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0DCC9' } } };
      });
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.eachCell({ includeEmpty: false }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2EFE2' } };
        });
      }
    });

    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: `K${loans.length + 1}` };

    const summarySheet = workbook.addWorksheet('Resumen');
    summarySheet.columns = [{ key: 'label', width: 28 }, { key: 'value', width: 40 }];
    const activeCount = loans.filter((l) => !l.returned_at).length;
    const overdueCount = loans.filter((l) => !l.returned_at && l.is_overdue).length;
    [
      ['Institución', SCHOOL_NAME()],
      ['Fecha de exportación', new Date().toLocaleString('es-ES')],
      ['Filtro aplicado', loanFiltersSummary(q)],
      ['Total de préstamos en el reporte', loans.length],
      ['Préstamos activos', activeCount],
      ['Préstamos atrasados', overdueCount],
      ['Préstamos devueltos', loans.length - activeCount],
    ].forEach(([label, value]) => summarySheet.addRow({ label, value }));
    summarySheet.getColumn('label').font = { bold: true };

    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'loans_exported',
      entityLabel: `Excel — ${loans.length} préstamo(s)`,
      details: loanFiltersSummary(q),
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="prestamos-biblioteca-${todayStamp()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo generar el archivo Excel de préstamos.');
    res.redirect('/admin/loans?view=history');
  }
};

exports.exportLoansPdf = async (req, res) => {
  try {
    const q = req.query.q || '';
    const loans = await Loan.exportHistory({ q });

    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="prestamos-biblioteca-${todayStamp()}.pdf"`);
    doc.pipe(res);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columns = [
      { key: 'book_title', label: 'Libro', width: 0.22 },
      { key: 'student_name', label: 'Estudiante', width: 0.18 },
      { key: 'student_code', label: 'Código', width: 0.09 },
      { key: 'loaned_at', label: 'Prestado', width: 0.10 },
      { key: 'due_date', label: 'Límite', width: 0.10 },
      { key: 'returned_at', label: 'Devuelto', width: 0.10 },
      { key: 'status_label', label: 'Estado', width: 0.11 },
      { key: 'renewal_count', label: 'Renov.', width: 0.06 },
      { key: 'loaned_by', label: 'Registró', width: 0.10 },
    ].map((c) => ({ ...c, width: c.width * pageWidth }));

    const truncate = (text, maxChars) => {
      if (!text) return '';
      const s = String(text);
      return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
    };

    const drawReportHeader = () => {
      doc.fillColor(`#${FOREST_DARK}`).fontSize(18).font('Helvetica-Bold')
        .text(SCHOOL_NAME(), doc.page.margins.left, doc.page.margins.top);
      doc.fillColor('#4E5A4C').fontSize(10).font('Helvetica')
        .text('Biblioteca — Reporte de préstamos', { continued: false });
      doc.fontSize(9).fillColor('#7C8A78')
        .text(`Generado: ${new Date().toLocaleString('es-ES')}  ·  Filtro: ${loanFiltersSummary(q)}  ·  ${loans.length} préstamo(s)`);
      doc.moveDown(0.6);
    };

    const drawTableHeader = (y) => {
      let x = doc.page.margins.left;
      doc.fillColor(`#${FOREST_DARK}`).rect(x, y, pageWidth, 20).fill();
      doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold');
      columns.forEach((col) => {
        doc.text(col.label, x + 4, y + 6, { width: col.width - 8, ellipsis: true });
        x += col.width;
      });
      return y + 20;
    };

    let y;
    drawReportHeader();
    y = drawTableHeader(doc.y);

    const rowHeight = 18;
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    doc.font('Helvetica').fontSize(8);
    loans.forEach((l, idx) => {
      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = drawTableHeader(doc.page.margins.top);
      }
      if (idx % 2 === 1) {
        doc.fillColor('#F2EFE2').rect(doc.page.margins.left, y, pageWidth, rowHeight).fill();
      }
      let x = doc.page.margins.left;
      const cells = {
        book_title: truncate(l.book_title, 36),
        student_name: truncate(l.student_name, 26),
        student_code: l.student_code || '—',
        loaned_at: fmtDate(l.loaned_at),
        due_date: fmtDate(l.due_date),
        returned_at: fmtDate(l.returned_at) || '—',
        status_label: loanStatusLabel(l),
        renewal_count: String(l.renewal_count),
        loaned_by: truncate(l.loaned_by, 16),
      };
      doc.fillColor('#22281F');
      columns.forEach((col) => {
        doc.text(String(cells[col.key] ?? ''), x + 4, y + 5, { width: col.width - 8, ellipsis: true });
        x += col.width;
      });
      y += rowHeight;
    });

    doc.end();

    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'loans_exported',
      entityLabel: `PDF — ${loans.length} préstamo(s)`,
      details: loanFiltersSummary(q),
    });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      req.flash('error', 'No se pudo generar el archivo PDF de préstamos.');
      res.redirect('/admin/loans?view=history');
    } else {
      res.end();
    }
  }
};
