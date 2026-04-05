const { query, sql } = require('../../db/queryHelper');
const { logAudit }   = require('../audit/auditService');

// ─── GET ALL (with category name joined) ────────────────────
async function getAll({ includeInactive = false, kategoriId = null } = {}) {
  const conditions = [];
  const params     = [];

  if (!includeInactive) {
    conditions.push('p.eshte_aktiv = 1');
  }
  if (kategoriId) {
    conditions.push('p.kategori_id = @kategoriId');
    params.push({ name: 'kategoriId', type: sql.Int, value: kategoriId });
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const result = await query(
    `SELECT p.produkt_id, p.emri, p.pershkrimi, p.cmimi, p.cmimi_blerje,
            p.njesia, p.eshte_aktiv,
            k.kategori_id, k.emri AS kategori,
            k.printer_dest,
            f.furnizues_id, f.emri AS furnizues,
            s.sasia_aktuale, s.sasia_min
     FROM   Produktet p
     JOIN   Kategorite  k ON k.kategori_id   = p.kategori_id
     LEFT JOIN Furnizimet f ON f.furnizues_id = p.furnizues_id
     LEFT JOIN Stoku      s ON s.produkt_id   = p.produkt_id
     ${where}
     ORDER  BY k.emri, p.emri`,
    params
  );
  return result.recordset;
}

// ─── GET BY ID ──────────────────────────────────────────────
async function getById(id) {
  const result = await query(
    `SELECT p.*, k.emri AS kategori, k.printer_dest,
            f.emri AS furnizues, s.sasia_aktuale, s.sasia_min
     FROM   Produktet p
     JOIN   Kategorite  k ON k.kategori_id   = p.kategori_id
     LEFT JOIN Furnizimet f ON f.furnizues_id = p.furnizues_id
     LEFT JOIN Stoku      s ON s.produkt_id   = p.produkt_id
     WHERE  p.produkt_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.recordset[0] || null;
}

// ─── SEARCH by name ─────────────────────────────────────────
async function search(term) {
  const result = await query(
    `SELECT p.produkt_id, p.emri, p.cmimi, k.emri AS kategori, s.sasia_aktuale
     FROM   Produktet p
     JOIN   Kategorite k ON k.kategori_id = p.kategori_id
     LEFT JOIN Stoku   s ON s.produkt_id  = p.produkt_id
     WHERE  p.eshte_aktiv = 1 AND p.emri LIKE @term
     ORDER  BY p.emri`,
    [{ name: 'term', type: sql.NVarChar(100), value: `%${term}%` }]
  );
  return result.recordset;
}

// ─── CREATE (also initialises Stoku row) ────────────────────
async function create(data, actorId = null) {
  const { emri, pershkrimi, cmimi, cmimi_blerje, njesia, kategori_id, furnizues_id, sasia_min = 0 } = data;

  const result = await query(
    `INSERT INTO Produktet (emri, pershkrimi, cmimi, cmimi_blerje, njesia, kategori_id, furnizues_id)
     OUTPUT INSERTED.*
     VALUES (@emri, @pershkrim, @cmimi, @cmimiBlerje, @njesia, @kategori, @furnizues)`,
    [
      { name: 'emri',        type: sql.NVarChar(100), value: emri },
      { name: 'pershkrim',   type: sql.NVarChar(255), value: pershkrimi ?? null },
      { name: 'cmimi',       type: sql.Decimal(10,2), value: cmimi },
      { name: 'cmimiBlerje', type: sql.Decimal(10,2), value: cmimi_blerje ?? null },
      { name: 'njesia',      type: sql.NVarChar(20),  value: njesia ?? 'cope' },
      { name: 'kategori',    type: sql.Int,           value: kategori_id },
      { name: 'furnizues',   type: sql.Int,           value: furnizues_id ?? null },
    ]
  );
  const created = result.recordset[0];

  // Initialise stock row
  await query(
    `INSERT INTO Stoku (produkt_id, sasia_aktuale, sasia_min) VALUES (@id, 0, @min)`,
    [
      { name: 'id',  type: sql.Int,          value: created.produkt_id },
      { name: 'min', type: sql.Decimal(10,3),value: sasia_min },
    ]
  );

  await logAudit('Produktet', created.produkt_id, 'INSERT', null, created, actorId);
  return created;
}

// ─── UPDATE ──────────────────────────────────────────────────
async function update(id, data, actorId = null) {
  const before = await getById(id);
  if (!before) return null;

  const { emri, pershkrimi, cmimi, cmimi_blerje, njesia, kategori_id, furnizues_id, eshte_aktiv } = data;
  const result = await query(
    `UPDATE Produktet
     SET emri = @emri, pershkrimi = @pershkrim, cmimi = @cmimi,
         cmimi_blerje = @cmimiBlerje, njesia = @njesia,
         kategori_id = @kategori, furnizues_id = @furnizues,
         eshte_aktiv = @aktiv
     OUTPUT INSERTED.*
     WHERE produkt_id = @id`,
    [
      { name: 'id',          type: sql.Int,           value: id },
      { name: 'emri',        type: sql.NVarChar(100), value: emri },
      { name: 'pershkrim',   type: sql.NVarChar(255), value: pershkrimi ?? null },
      { name: 'cmimi',       type: sql.Decimal(10,2), value: cmimi },
      { name: 'cmimiBlerje', type: sql.Decimal(10,2), value: cmimi_blerje ?? null },
      { name: 'njesia',      type: sql.NVarChar(20),  value: njesia ?? 'cope' },
      { name: 'kategori',    type: sql.Int,           value: kategori_id },
      { name: 'furnizues',   type: sql.Int,           value: furnizues_id ?? null },
      { name: 'aktiv',       type: sql.Bit,           value: eshte_aktiv ?? 1 },
    ]
  );
  const updated = result.recordset[0];
  await logAudit('Produktet', id, 'UPDATE', before, updated, actorId);
  return updated;
}

// ─── DEACTIVATE (soft delete) ────────────────────────────────
async function deactivate(id, actorId = null) {
  const before = await getById(id);
  if (!before) return null;
  await query(
    `UPDATE Produktet SET eshte_aktiv = 0 WHERE produkt_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  await logAudit('Produktet', id, 'UPDATE', before, { ...before, eshte_aktiv: 0 }, actorId);
  return true;
}

module.exports = { getAll, getById, search, create, update, deactivate };
