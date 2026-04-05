const { query, sql } = require('../../db/queryHelper');
const { logAudit }   = require('../audit/auditService');
const tableService   = require('../tables/tableService');

async function getAll({ date = null, aktiveOnly = true } = {}) {
  const params = [];
  const conditions = [];

  if (aktiveOnly) {
    conditions.push("r.statusi = 'aktive'");
  }
  if (date) {
    conditions.push('CAST(r.data_ora AS DATE) = @date');
    params.push({ name: 'date', type: sql.Date, value: date });
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const result = await query(
    `SELECT r.rezervim_id, r.emri_klientit, r.telefoni, r.data_ora,
            r.numri_personave, r.shenime, r.statusi, r.krijuar_me,
            t.numri AS tavolina, t.zona
     FROM   Rezervimet r
     JOIN   Tavolinat  t ON t.tavolina_id = r.tavolina_id
     ${where}
     ORDER  BY r.data_ora`,
    params
  );
  return result.recordset;
}

async function getById(id) {
  const result = await query(
    `SELECT r.*, t.numri AS tavolina, t.zona
     FROM   Rezervimet r JOIN Tavolinat t ON t.tavolina_id = r.tavolina_id
     WHERE  r.rezervim_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.recordset[0] || null;
}

async function create(data, actorId = null) {
  const { tavolina_id, emri_klientit, telefoni, data_ora, numri_personave, shenime } = data;
  const result = await query(
    `INSERT INTO Rezervimet (tavolina_id, emri_klientit, telefoni, data_ora, numri_personave, shenime)
     OUTPUT INSERTED.*
     VALUES (@tavolina, @emri, @tel, @dataOra, @numri, @shenime)`,
    [
      { name: 'tavolina', type: sql.Int,           value: tavolina_id },
      { name: 'emri',     type: sql.NVarChar(100), value: emri_klientit },
      { name: 'tel',      type: sql.NVarChar(20),  value: telefoni ?? null },
      { name: 'dataOra',  type: sql.DateTime,      value: new Date(data_ora) },
      { name: 'numri',    type: sql.TinyInt,       value: numri_personave ?? 2 },
      { name: 'shenime',  type: sql.NVarChar(255), value: shenime ?? null },
    ]
  );
  const created = result.recordset[0];
  // Mark table as reserved
  await tableService.setStatus(tavolina_id, 'e_rezervuar', actorId);
  await logAudit('Rezervimet', created.rezervim_id, 'INSERT', null, created, actorId);
  return created;
}

async function update(id, data, actorId = null) {
  const before = await getById(id);
  if (!before) return null;
  const { emri_klientit, telefoni, data_ora, numri_personave, shenime } = data;
  const result = await query(
    `UPDATE Rezervimet
     SET emri_klientit = @emri, telefoni = @tel, data_ora = @dataOra,
         numri_personave = @numri, shenime = @shenime
     OUTPUT INSERTED.*
     WHERE rezervim_id = @id`,
    [
      { name: 'id',      type: sql.Int,           value: id },
      { name: 'emri',    type: sql.NVarChar(100), value: emri_klientit },
      { name: 'tel',     type: sql.NVarChar(20),  value: telefoni ?? null },
      { name: 'dataOra', type: sql.DateTime,      value: new Date(data_ora) },
      { name: 'numri',   type: sql.TinyInt,       value: numri_personave ?? 2 },
      { name: 'shenime', type: sql.NVarChar(255), value: shenime ?? null },
    ]
  );
  const updated = result.recordset[0];
  await logAudit('Rezervimet', id, 'UPDATE', before, updated, actorId);
  return updated;
}

async function setStatus(id, statusi, actorId = null) {
  const before = await getById(id);
  if (!before) return null;
  await query(
    `UPDATE Rezervimet SET statusi = @statusi WHERE rezervim_id = @id`,
    [
      { name: 'id',      type: sql.Int,          value: id },
      { name: 'statusi', type: sql.NVarChar(15), value: statusi },
    ]
  );
  // If cancelled, free the table
  if (statusi === 'anulluar') {
    await tableService.setStatus(before.tavolina_id, 'e_lire', actorId);
  }
  await logAudit('Rezervimet', id, 'UPDATE',
    { statusi: before.statusi }, { statusi }, actorId);
  return true;
}

module.exports = { getAll, getById, create, update, setStatus };
