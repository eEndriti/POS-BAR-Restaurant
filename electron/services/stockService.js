const { query, sql } = require('../../db/queryHelper');
const { logAudit }   = require('../audit/auditService');

// ─── GET ALL STOCK (with product info) ──────────────────────
async function getAll({ lowStockOnly = false } = {}) {
  const where = lowStockOnly ? 'WHERE s.sasia_aktuale <= s.sasia_min' : '';
  const result = await query(
    `SELECT s.stok_id, s.sasia_aktuale, s.sasia_min, s.updated_me,
            p.produkt_id, p.emri AS produkt, p.njesia,
            k.emri AS kategori
     FROM   Stoku s
     JOIN   Produktet  p ON p.produkt_id  = s.produkt_id
     JOIN   Kategorite k ON k.kategori_id = p.kategori_id
     WHERE  p.eshte_aktiv = 1
     ${lowStockOnly ? 'AND s.sasia_aktuale <= s.sasia_min' : ''}
     ORDER  BY k.emri, p.emri`
  );
  return result.recordset;
}

// ─── GET BY PRODUCT ─────────────────────────────────────────
async function getByProduct(produktId) {
  const result = await query(
    `SELECT s.*, p.emri AS produkt, p.njesia
     FROM   Stoku s JOIN Produktet p ON p.produkt_id = s.produkt_id
     WHERE  s.produkt_id = @id`,
    [{ name: 'id', type: sql.Int, value: produktId }]
  );
  return result.recordset[0] || null;
}

// ─── ADJUST STOCK (manual correction) ───────────────────────
async function adjust(produktId, newQty, actorId = null) {
  const before = await getByProduct(produktId);
  if (!before) return null;

  const result = await query(
    `UPDATE Stoku
     SET sasia_aktuale = @qty, updated_me = GETDATE()
     OUTPUT INSERTED.*
     WHERE produkt_id = @id`,
    [
      { name: 'id',  type: sql.Int,           value: produktId },
      { name: 'qty', type: sql.Decimal(10,3), value: newQty },
    ]
  );
  const updated = result.recordset[0];
  await logAudit('Stoku', produktId, 'UPDATE',
    { sasia_aktuale: before.sasia_aktuale },
    { sasia_aktuale: newQty },
    actorId
  );
  return updated;
}

// ─── UPDATE MINIMUM THRESHOLD ───────────────────────────────
async function updateMinThreshold(produktId, sasiaMin, actorId = null) {
  const result = await query(
    `UPDATE Stoku SET sasia_min = @min, updated_me = GETDATE()
     OUTPUT INSERTED.*
     WHERE produkt_id = @id`,
    [
      { name: 'id',  type: sql.Int,           value: produktId },
      { name: 'min', type: sql.Decimal(10,3), value: sasiaMin },
    ]
  );
  await logAudit('Stoku', produktId, 'UPDATE', null, { sasia_min: sasiaMin }, actorId);
  return result.recordset[0];
}

// ─── GET LOW STOCK ALERTS ────────────────────────────────────
async function getLowStockAlerts() {
  return getAll({ lowStockOnly: true });
}

module.exports = { getAll, getByProduct, adjust, updateMinThreshold, getLowStockAlerts };
