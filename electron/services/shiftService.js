const { query, sql } = require('../../db/queryHelper');
const { logAudit }   = require('../audit/auditService');

// ─── GET ALL SHIFTS ──────────────────────────────────────────
async function getAll({ userId = null, openOnly = false } = {}) {
  const params     = [];
  const conditions = [];

  if (userId) {
    conditions.push('a.perdorues_id = @userId');
    params.push({ name: 'userId', type: sql.Int, value: userId });
  }
  if (openOnly) {
    conditions.push('a.mbyllur_me IS NULL');
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const result = await query(
    `SELECT a.akt_id, a.kasa_hapese, a.kasa_mbyllje,
            a.hapur_me, a.mbyllur_me, a.shenime,
            u.emri + ' ' + u.mbiemri AS perdorues
     FROM   Aktet a
     JOIN   Perdoruesit u ON u.perdorues_id = a.perdorues_id
     ${where}
     ORDER  BY a.hapur_me DESC`,
    params
  );
  return result.recordset;
}

// ─── GET ACTIVE SHIFT FOR USER ───────────────────────────────
async function getActiveForUser(userId) {
  const result = await query(
    `SELECT TOP 1 * FROM Aktet
     WHERE perdorues_id = @id AND mbyllur_me IS NULL
     ORDER BY hapur_me DESC`,
    [{ name: 'id', type: sql.Int, value: userId }]
  );
  return result.recordset[0] || null;
}

// ─── OPEN SHIFT ──────────────────────────────────────────────
async function open(userId, kasaHapese = 0) {
  // Prevent double-opening
  const existing = await getActiveForUser(userId);
  if (existing) return { error: 'Shift already open', shift: existing };

  const result = await query(
    `INSERT INTO Aktet (perdorues_id, kasa_hapese)
     OUTPUT INSERTED.*
     VALUES (@id, @kasa)`,
    [
      { name: 'id',   type: sql.Int,          value: userId },
      { name: 'kasa', type: sql.Decimal(10,2),value: kasaHapese },
    ]
  );
  const shift = result.recordset[0];
  await logAudit('Aktet', shift.akt_id, 'INSERT', null, shift, userId);
  return shift;
}

// ─── CLOSE SHIFT ─────────────────────────────────────────────
async function close(aktId, kasaMbyllje, shenime = null, actorId = null) {
  const result = await query(
    `UPDATE Aktet
     SET kasa_mbyllje = @kasa, mbyllur_me = GETDATE(), shenime = @shenime
     OUTPUT INSERTED.*
     WHERE akt_id = @id AND mbyllur_me IS NULL`,
    [
      { name: 'id',      type: sql.Int,           value: aktId },
      { name: 'kasa',    type: sql.Decimal(10,2), value: kasaMbyllje },
      { name: 'shenime', type: sql.NVarChar(255), value: shenime ?? null },
    ]
  );
  const shift = result.recordset[0];
  if (!shift) return null;
  await logAudit('Aktet', aktId, 'UPDATE',
    { mbyllur_me: null }, { mbyllur_me: shift.mbyllur_me }, actorId);
  return shift;
}

module.exports = { getAll, getActiveForUser, open, close };
