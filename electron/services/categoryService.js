const { query, sql } = require('../../db/queryHelper');
const { logAudit }   = require('../audit/auditService');

async function getAll() {
  const result = await query(
    `SELECT kategori_id, emri, printer_dest FROM Kategorite ORDER BY emri`
  );
  return result.recordset;
}

async function getById(id) {
  const result = await query(
    `SELECT kategori_id, emri, printer_dest FROM Kategorite WHERE kategori_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.recordset[0] || null;
}

async function create(data, actorId = null) {
  const { emri, printer_dest } = data;
  const result = await query(
    `INSERT INTO Kategorite (emri, printer_dest)
     OUTPUT INSERTED.*
     VALUES (@emri, @printer)`,
    [
      { name: 'emri',    type: sql.NVarChar(50), value: emri },
      { name: 'printer', type: sql.NVarChar(30), value: printer_dest ?? null },
    ]
  );
  const created = result.recordset[0];
  await logAudit('Kategorite', created.kategori_id, 'INSERT', null, created, actorId);
  return created;
}

async function update(id, data, actorId = null) {
  const before = await getById(id);
  if (!before) return null;
  const { emri, printer_dest } = data;
  const result = await query(
    `UPDATE Kategorite SET emri = @emri, printer_dest = @printer
     OUTPUT INSERTED.* WHERE kategori_id = @id`,
    [
      { name: 'id',      type: sql.Int,          value: id },
      { name: 'emri',    type: sql.NVarChar(50), value: emri },
      { name: 'printer', type: sql.NVarChar(30), value: printer_dest ?? null },
    ]
  );
  const updated = result.recordset[0];
  await logAudit('Kategorite', id, 'UPDATE', before, updated, actorId);
  return updated;
}

async function remove(id, actorId = null) {
  const before = await getById(id);
  if (!before) return null;
  await query(
    `DELETE FROM Kategorite WHERE kategori_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  await logAudit('Kategorite', id, 'DELETE', before, null, actorId);
  return true;
}

module.exports = { getAll, getById, create, update, remove };
