const { query, sql } = require('../../db/queryHelper');
const { logAudit }   = require('../audit/auditService');

async function getAll({ zona = null } = {}) {
  const params = [];
  let where = '';
  if (zona) {
    where = 'WHERE zona = @zona';
    params.push({ name: 'zona', type: sql.NVarChar(30), value: zona });
  }
  const result = await query(
    `SELECT tavolina_id, numri, zona, kapaciteti, statusi
     FROM   Tavolinat ${where} ORDER BY zona, numri`,
    params
  );
  return result.recordset;
}

async function getById(id) {
  const result = await query(
    `SELECT * FROM Tavolinat WHERE tavolina_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.recordset[0] || null;
}

// Get table with its currently open order (if any)
async function getWithOpenOrder(id) {
  const table = await getById(id);
  if (!table) return null;

  const orderResult = await query(
    `SELECT TOP 1 p.porosi_id, p.statusi, p.hapur_me,
            u.emri + ' ' + u.mbiemri AS kamarier,
            SUM(pd.sasia * pd.cmimi_njesi) AS totali
     FROM   Porosite p
     JOIN   Perdoruesit u ON u.perdorues_id = p.perdorues_id
     LEFT JOIN PorosiDetaje pd ON pd.porosi_id = p.porosi_id AND pd.statusi = 'aktive'
     WHERE  p.tavolina_id = @id
       AND  p.statusi NOT IN ('paguar','anulluar')
     GROUP  BY p.porosi_id, p.statusi, p.hapur_me, u.emri, u.mbiemri
     ORDER  BY p.hapur_me DESC`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return { ...table, porosi: orderResult.recordset[0] || null };
}

async function create(data, actorId = null) {
  const { numri, zona, kapaciteti } = data;
  const result = await query(
    `INSERT INTO Tavolinat (numri, zona, kapaciteti)
     OUTPUT INSERTED.*
     VALUES (@numri, @zona, @kap)`,
    [
      { name: 'numri', type: sql.NVarChar(10), value: numri },
      { name: 'zona',  type: sql.NVarChar(30), value: zona ?? 'brendshme' },
      { name: 'kap',   type: sql.TinyInt,      value: kapaciteti ?? 4 },
    ]
  );
  const created = result.recordset[0];
  await logAudit('Tavolinat', created.tavolina_id, 'INSERT', null, created, actorId);
  return created;
}

async function update(id, data, actorId = null) {
  const before = await getById(id);
  if (!before) return null;
  const { numri, zona, kapaciteti } = data;
  const result = await query(
    `UPDATE Tavolinat SET numri = @numri, zona = @zona, kapaciteti = @kap
     OUTPUT INSERTED.* WHERE tavolina_id = @id`,
    [
      { name: 'id',    type: sql.Int,          value: id },
      { name: 'numri', type: sql.NVarChar(10), value: numri },
      { name: 'zona',  type: sql.NVarChar(30), value: zona },
      { name: 'kap',   type: sql.TinyInt,      value: kapaciteti },
    ]
  );
  const updated = result.recordset[0];
  await logAudit('Tavolinat', id, 'UPDATE', before, updated, actorId);
  return updated;
}

async function setStatus(id, statusi, actorId = null) {
  const before = await getById(id);
  if (!before) return null;
  const result = await query(
    `UPDATE Tavolinat SET statusi = @statusi OUTPUT INSERTED.* WHERE tavolina_id = @id`,
    [
      { name: 'id',      type: sql.Int,          value: id },
      { name: 'statusi', type: sql.NVarChar(15), value: statusi },
    ]
  );
  await logAudit('Tavolinat', id, 'UPDATE',
    { statusi: before.statusi }, { statusi }, actorId);
  return result.recordset[0];
}

async function remove(id, actorId = null) {
  const before = await getById(id);
  if (!before) return null;
  await query(
    `DELETE FROM Tavolinat WHERE tavolina_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  await logAudit('Tavolinat', id, 'DELETE', before, null, actorId);
  return true;
}

module.exports = { getAll, getById, getWithOpenOrder, create, update, setStatus, remove };
