const { query, sql } = require('../../db/queryHelper');
const { logAudit }   = require('../audit/auditService');

async function getAll({ includeInactive = false } = {}) {
  const result = await query(
    `SELECT furnizues_id, emri, kontakti, telefoni, adresa, eshte_aktiv
     FROM   Furnizimet
     ${!includeInactive ? 'WHERE eshte_aktiv = 1' : ''}
     ORDER  BY emri`
  );
  return result.recordset;
}

async function getById(id) {
  const result = await query(
    `SELECT * FROM Furnizimet WHERE furnizues_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.recordset[0] || null;
}

// Delivery history for one supplier
async function getDeliveries(furnizuesId) {
  const result = await query(
    `SELECT fd.furnizim_det_id, p.emri AS produkt, fd.sasia,
            fd.cmimi_njesi, fd.data_furnizimit,
            u.emri + ' ' + u.mbiemri AS pranoi
     FROM   FurnizimiDetaje fd
     JOIN   Produktet  p ON p.produkt_id  = fd.produkt_id
     JOIN   Perdoruesit u ON u.perdorues_id = fd.perdorues_id
     WHERE  fd.furnizues_id = @id
     ORDER  BY fd.data_furnizimit DESC`,
    [{ name: 'id', type: sql.Int, value: furnizuesId }]
  );
  return result.recordset;
}

async function create(data, actorId = null) {
  const { emri, kontakti, telefoni, adresa } = data;
  const result = await query(
    `INSERT INTO Furnizimet (emri, kontakti, telefoni, adresa)
     OUTPUT INSERTED.*
     VALUES (@emri, @kontakti, @telefoni, @adresa)`,
    [
      { name: 'emri',     type: sql.NVarChar(100), value: emri },
      { name: 'kontakti', type: sql.NVarChar(100), value: kontakti ?? null },
      { name: 'telefoni', type: sql.NVarChar(20),  value: telefoni ?? null },
      { name: 'adresa',   type: sql.NVarChar(200), value: adresa ?? null },
    ]
  );
  const created = result.recordset[0];
  await logAudit('Furnizimet', created.furnizues_id, 'INSERT', null, created, actorId);
  return created;
}

async function update(id, data, actorId = null) {
  const before = await getById(id);
  if (!before) return null;
  const { emri, kontakti, telefoni, adresa, eshte_aktiv } = data;
  const result = await query(
    `UPDATE Furnizimet
     SET emri = @emri, kontakti = @kontakti, telefoni = @telefoni,
         adresa = @adresa, eshte_aktiv = @aktiv
     OUTPUT INSERTED.*
     WHERE furnizues_id = @id`,
    [
      { name: 'id',       type: sql.Int,            value: id },
      { name: 'emri',     type: sql.NVarChar(100),  value: emri },
      { name: 'kontakti', type: sql.NVarChar(100),  value: kontakti ?? null },
      { name: 'telefoni', type: sql.NVarChar(20),   value: telefoni ?? null },
      { name: 'adresa',   type: sql.NVarChar(200),  value: adresa ?? null },
      { name: 'aktiv',    type: sql.Bit,             value: eshte_aktiv ?? 1 },
    ]
  );
  const updated = result.recordset[0];
  await logAudit('Furnizimet', id, 'UPDATE', before, updated, actorId);
  return updated;
}

// Record a new delivery and update stock
async function recordDelivery(data, actorId = null) {
  const { furnizues_id, produkt_id, sasia, cmimi_njesi } = data;

  const result = await query(
    `INSERT INTO FurnizimiDetaje (furnizues_id, produkt_id, sasia, cmimi_njesi, perdorues_id)
     OUTPUT INSERTED.*
     VALUES (@furnizues, @produkt, @sasia, @cmimi, @perdorues)`,
    [
      { name: 'furnizues', type: sql.Int,          value: furnizues_id },
      { name: 'produkt',   type: sql.Int,          value: produkt_id },
      { name: 'sasia',     type: sql.Decimal(10,3),value: sasia },
      { name: 'cmimi',     type: sql.Decimal(10,2),value: cmimi_njesi },
      { name: 'perdorues', type: sql.Int,          value: actorId },
    ]
  );

  // Update stock quantity
  await query(
    `UPDATE Stoku
     SET sasia_aktuale = sasia_aktuale + @sasia, updated_me = GETDATE()
     WHERE produkt_id = @produkt`,
    [
      { name: 'sasia',   type: sql.Decimal(10,3), value: sasia },
      { name: 'produkt', type: sql.Int,           value: produkt_id },
    ]
  );

  return result.recordset[0];
}

async function deactivate(id, actorId = null) {
  const before = await getById(id);
  if (!before) return null;
  await query(
    `UPDATE Furnizimet SET eshte_aktiv = 0 WHERE furnizues_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  await logAudit('Furnizimet', id, 'UPDATE', before, { ...before, eshte_aktiv: 0 }, actorId);
  return true;
}

module.exports = { getAll, getById, getDeliveries, create, update, recordDelivery, deactivate };
