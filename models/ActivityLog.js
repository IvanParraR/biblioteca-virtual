// ============================================================
// Modelo ActivityLog — registra y consulta el historial de
// acciones de los administradores, y da soporte a "deshacer"
// para el subconjunto de acciones consideradas seguras.
//
// Reglas de "deshacer" (decididas junto con el usuario):
//   - Solo se puede deshacer la ÚLTIMA acción registrada sobre
//     una entidad (libro/categoría/admin). Si hubo algo después,
//     queda bloqueado — evita pisar cambios posteriores.
//   - Autodeshacer: el mismo admin que hizo la acción, dentro de
//     SELF_UNDO_WINDOW_MS desde que ocurrió.
//   - Deshacer asistido: cualquier admin (o solo gestores, si la
//     acción es sobre una cuenta de administrador), dentro de
//     ASSISTED_UNDO_WINDOW_MS.
//   - Deshacer una acción también queda registrado como una
//     nueva entrada en el historial (nunca se borra la original).
// ============================================================
const { pool } = require('../config/db');

const SELF_UNDO_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const ASSISTED_UNDO_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 horas

// Catálogo de tipos de acción → etiqueta legible y a qué tipo de
// entidad pertenece por defecto.
const ACTION_TYPES = {
  book_created: { label: 'Agregó el libro', entity_type: 'book' },
  book_updated: { label: 'Editó el libro', entity_type: 'book' },
  book_deleted: { label: 'Eliminó el libro', entity_type: 'book' },
  book_copies_added: { label: 'Marcó copia(s) disponible(s) de', entity_type: 'book' },
  book_copies_removed: { label: 'Marcó copia(s) no disponible(s) de', entity_type: 'book' },
  book_csv_import: { label: 'Importó libros por CSV', entity_type: 'book' },
  category_created: { label: 'Creó la categoría', entity_type: 'category' },
  category_renamed: { label: 'Renombró la categoría', entity_type: 'category' },
  category_merged: { label: 'Fusionó la categoría', entity_type: 'category' },
  category_deleted: { label: 'Eliminó la categoría', entity_type: 'category' },
  admin_created: { label: 'Creó la cuenta de administrador', entity_type: 'admin' },
  admin_permission_granted: { label: 'Otorgó permiso de gestión a', entity_type: 'admin' },
  admin_permission_revoked: { label: 'Quitó permiso de gestión a', entity_type: 'admin' },
  admin_deleted: { label: 'Eliminó la cuenta de administrador', entity_type: 'admin' },
  admin_temp_password_assigned: { label: 'Asignó contraseña temporal a', entity_type: 'admin' },
  account_password_changed: { label: 'Cambió su propia contraseña', entity_type: 'admin' },
  account_security_question_updated: { label: 'Actualizó su pregunta de seguridad', entity_type: 'admin' },
  catalog_exported: { label: 'Exportó el catálogo', entity_type: 'book' },
  book_bulk_deleted: { label: 'Eliminó en lote', entity_type: 'book' },
  book_bulk_category_changed: { label: 'Cambió la categoría en lote de', entity_type: 'book' },
};

const ENTITY_LABELS = {
  book: 'Libro',
  category: 'Categoría',
  admin: 'Administrador',
};

// Únicamente estas acciones son "seguras" de deshacer: cambian un
// solo valor o revierten con un snapshot simple, sin efectos en
// cascada. Fusiones, contraseñas temporales y cambios de la propia
// contraseña quedan fuera a propósito (ver conversación de diseño).
const UNDOABLE_ACTIONS = new Set([
  'book_created', 'book_updated', 'book_deleted',
  'category_created', 'category_renamed', 'category_deleted',
  'admin_permission_granted', 'admin_permission_revoked',
  'book_copies_added', 'book_copies_removed',
]);

// Al deshacer una acción, el nuevo registro que se crea debe
// describir lo que REALMENTE ocurrió (ej. deshacer una creación
// es, en efecto, una eliminación), no repetir el tipo original.
const REVERT_ACTION_MAP = {
  book_created: 'book_deleted',
  book_updated: 'book_updated',
  book_deleted: 'book_created',
  category_created: 'category_deleted',
  category_renamed: 'category_renamed',
  category_deleted: 'category_created',
  admin_permission_granted: 'admin_permission_revoked',
  admin_permission_revoked: 'admin_permission_granted',
  book_copies_added: 'book_copies_removed',
  book_copies_removed: 'book_copies_added',
};

const ActivityLog = {
  ACTION_TYPES,
  ENTITY_LABELS,
  UNDOABLE_ACTIONS,
  REVERT_ACTION_MAP,
  SELF_UNDO_WINDOW_MS,
  ASSISTED_UNDO_WINDOW_MS,

  // Registra una acción. No lanza error hacia arriba si falla — un
  // problema en el registro de auditoría nunca debe tumbar la
  // acción real que el admin ya completó.
  // beforeState: objeto plano con el estado anterior (o null si la
  // acción fue una creación). entityId: id numérico de la fila
  // afectada en su tabla real (books/categories/admins).
  async log({ adminId, adminUsername, actionType, entityId, entityLabel, details, beforeState, isRevert }) {
    try {
      const meta = ACTION_TYPES[actionType];
      const entityType = meta ? meta.entity_type : 'other';
      const undoable = UNDOABLE_ACTIONS.has(actionType) && entityId != null;
      const [result] = await pool.query(
        `INSERT INTO activity_log
          (admin_id, admin_username, action_type, entity_type, entity_id, entity_label, details, before_state, is_undoable, is_revert)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adminId || null,
          adminUsername,
          actionType,
          entityType,
          entityId != null ? entityId : null,
          entityLabel || null,
          details || null,
          beforeState !== undefined && beforeState !== null ? JSON.stringify(beforeState) : null,
          undoable ? 1 : 0,
          isRevert ? 1 : 0,
        ]
      );
      return result.insertId;
    } catch (err) {
      console.error('No se pudo registrar actividad:', err.message);
      return null;
    }
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM activity_log WHERE id = ?', [id]);
    return rows[0];
  },

  async markUndone(id, undoneByUsername) {
    await pool.query(
      'UPDATE activity_log SET undone_at = NOW(), undone_by = ? WHERE id = ?',
      [undoneByUsername, id]
    );
  },

  // ¿Es esta la entrada MÁS RECIENTE registrada para esta entidad?
  // Si algo pasó después (incluso otra reversión), deshacer queda
  // bloqueado para evitar pisar cambios posteriores.
  async isLatestForEntity(entityType, entityId, logId) {
    const [rows] = await pool.query(
      `SELECT id FROM activity_log
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [entityType, entityId]
    );
    return rows.length > 0 && rows[0].id === Number(logId);
  },

  // Determina si `actorAdmin` puede deshacer `entry` en este momento.
  // Devuelve { ok, reason, mode }.
  evaluateUndo(entry, actorAdmin) {
    if (!entry.is_undoable) return { ok: false, reason: 'Esta acción no se puede deshacer.' };
    if (entry.undone_at) return { ok: false, reason: 'Esta acción ya fue deshecha.' };

    const ageMs = Date.now() - new Date(entry.created_at).getTime();
    const isSelf = actorAdmin.username === entry.admin_username;
    const isAdminEntity = entry.entity_type === 'admin';
    const hasManagerPerm = !!actorAdmin.can_manage_admins;

    if (isSelf && ageMs <= SELF_UNDO_WINDOW_MS) {
      return { ok: true, mode: 'self' };
    }
    if (isAdminEntity && !hasManagerPerm) {
      return { ok: false, reason: 'Solo un administrador con permiso de gestión puede deshacer esto.' };
    }
    if (ageMs <= ASSISTED_UNDO_WINDOW_MS) {
      return { ok: true, mode: 'assisted' };
    }
    return { ok: false, reason: 'Pasó demasiado tiempo para deshacer esta acción.' };
  },

  async distinctAdmins() {
    const [rows] = await pool.query(
      'SELECT DISTINCT admin_username FROM activity_log ORDER BY admin_username ASC'
    );
    return rows.map((r) => r.admin_username);
  },

  _dateRangeClause(params, values) {
    const { timeRange, dateFrom, dateTo, specificDate } = params;

    if (timeRange === 'today') return 'DATE(created_at) = CURDATE()';
    if (timeRange === 'week') return 'created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
    if (timeRange === 'month') return 'created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
    if (timeRange === 'specific' && specificDate) {
      values.push(specificDate);
      return 'DATE(created_at) = ?';
    }
    if (timeRange === 'custom' && (dateFrom || dateTo)) {
      const clauses = [];
      if (dateFrom) { values.push(`${dateFrom} 00:00:00`); clauses.push('created_at >= ?'); }
      if (dateTo) { values.push(`${dateTo} 23:59:59`); clauses.push('created_at <= ?'); }
      return clauses.join(' AND ');
    }
    return null;
  },

  async search({
    timeRange, dateFrom, dateTo, specificDate,
    actionType, adminUsername, entityType,
    sort = 'created_at', order = 'desc',
    page = 1, perPage = 20,
  } = {}) {
    const where = [];
    const values = [];

    const dateClause = ActivityLog._dateRangeClause({ timeRange, dateFrom, dateTo, specificDate }, values);
    if (dateClause) where.push(dateClause);

    if (actionType) { where.push('action_type = ?'); values.push(actionType); }
    if (adminUsername) { where.push('admin_username = ?'); values.push(adminUsername); }
    if (entityType) { where.push('entity_type = ?'); values.push(entityType); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sortCol = sort === 'admin_username' ? 'admin_username' : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM activity_log ${whereSql}`, values);

    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const offset = (currentPage - 1) * perPage;

    const [rows] = await pool.query(
      `SELECT * FROM activity_log ${whereSql} ORDER BY ${sortCol} ${sortOrder}, id ${sortOrder} LIMIT ? OFFSET ?`,
      [...values, perPage, offset]
    );

    const entries = rows.map((r) => ({
      ...r,
      action_label: (ACTION_TYPES[r.action_type] || {}).label || r.action_type,
      entity_type_label: ENTITY_LABELS[r.entity_type] || r.entity_type,
    }));

    return { entries, total, totalPages, currentPage, perPage };
  },
};

module.exports = ActivityLog;
