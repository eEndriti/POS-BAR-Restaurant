const { query, sql } = require('../../db/queryHelper');
const { logAudit }   = require('../audit/auditService');

async function getAll({ aktiveOnly = true } = {}) {
  const result = await query(
    `SELECT * FROM Zbritjet
     ${aktiveOnly ? "WHERE eshte_aktive = 1" : ""}
     ORDER BY emri`
  );
  return result.recordset;
}

async function getById(id) {
  const result = await query(
    `SELECT * FROM Zbritjet WHERE zbritje_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.recordset[0] || null;
}

/**
 * Calculate the discounted amount given an order subtotal.
 * Returns the discount amount (not the final price).
 */
function calculate(zbritja, subtotal) {
  if (!zbritja) return 0;
  if (zbritja.lloji === 'perqind') {
    return parseFloat(((subtotal * zbritja.vlera) / 100).toFixed(2));
  }
  return Math.min(parseFloat(zbritja.vlera), subtotal);
}

async function create(data, actorId = null) {
  const { emri, lloji, vlera } = data;
  const result = await query(
    `INSERT INTO Zbritjet (emri, lloji, vlera)
     OUTPUT INSERTED.*
     VALUES (@emri, @lloji, @vlera)`,
    [
      { name: 'emri',  type: sql.NVarChar(50), value: emri },
      { name: 'lloji', type: sql.NVarChar(10), value: lloji },
      { name: 'vlera', type: sql.Decimal(10,2),value: vlera },
    ]
  );
  const created = result.recordset[0];
  await logAudit('Zbritjet', created.zbritje_id, 'INSERT', null, created, actorId);
  return created;
}

async function update(id, data, actorId = null) {
  const before = await getById(id);
  if (!before) return null;
  const { emri, lloji, vlera, eshte_aktive } = data;
  const result = await query(
    `UPDATE Zbritjet SET emri = @emri, lloji = @lloji, vlera = @vlera, eshte_aktive = @aktive
     OUTPUT INSERTED.* WHERE zbritje_id = @id`,
    [
      { name: 'id',     type: sql.Int,          value: id },
      { name: 'emri',   type: sql.NVarChar(50), value: emri },
      { name: 'lloji',  type: sql.NVarChar(10), value: lloji },
      { name: 'vlera',  type: sql.Decimal(10,2),value: vlera },
      { name: 'aktive', type: sql.Bit,          value: eshte_aktive ?? 1 },
    ]
  );
  const updated = result.recordset[0];
  await logAudit('Zbritjet', id, 'UPDATE', before, updated, actorId);
  return updated;
}

async function deactivate(id, actorId = null) {
  const before = await getById(id);
  if (!before) return null;
  await query(
    `UPDATE Zbritjet SET eshte_aktive = 0 WHERE zbritje_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  await logAudit('Zbritjet', id, 'UPDATE', before, { ...before, eshte_aktive: 0 }, actorId);
  return true;
}

module.exports = { getAll, getById, calculate, create, update, deactivate };
