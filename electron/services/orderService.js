const { query, sql } = require('../../db/queryHelper');
const { logAudit }   = require('../audit/auditService');
const tableService   = require('../tables/tableService');
const discountService = require('../discounts/discountService');

// ─── GET ALL ─────────────────────────────────────────────────
async function getAll({ statusi = null, tavolinaId = null, date = null } = {}) {
  const params     = [];
  const conditions = [];

  if (statusi) {
    conditions.push('p.statusi = @statusi');
    params.push({ name: 'statusi', type: sql.NVarChar(20), value: statusi });
  }
  if (tavolinaId) {
    conditions.push('p.tavolina_id = @tavolina');
    params.push({ name: 'tavolina', type: sql.Int, value: tavolinaId });
  }
  if (date) {
    conditions.push('CAST(p.hapur_me AS DATE) = @date');
    params.push({ name: 'date', type: sql.Date, value: date });
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const result = await query(
    `SELECT p.porosi_id, p.statusi, p.hapur_me, p.mbyllur_me,
            p.numri_personave, p.shenime,
            t.numri AS tavolina, t.zona,
            u.emri + ' ' + u.mbiemri AS kamarier,
            z.emri AS zbritja,
            ISNULL(SUM(pd.sasia * pd.cmimi_njesi), 0) AS subtotali
     FROM   Porosite p
     LEFT JOIN Tavolinat    t ON t.tavolina_id  = p.tavolina_id
     JOIN      Perdoruesit  u ON u.perdorues_id = p.perdorues_id
     LEFT JOIN Zbritjet     z ON z.zbritje_id   = p.zbritje_id
     LEFT JOIN PorosiDetaje pd ON pd.porosi_id  = p.porosi_id AND pd.statusi = 'aktive'
     ${where}
     GROUP BY p.porosi_id, p.statusi, p.hapur_me, p.mbyllur_me,
              p.numri_personave, p.shenime,
              t.numri, t.zona, u.emri, u.mbiemri, z.emri
     ORDER BY p.hapur_me DESC`,
    params
  );
  return result.recordset;
}

// ─── GET BY ID (with lines) ──────────────────────────────────
async function getById(id) {
  const orderResult = await query(
    `SELECT p.*, t.numri AS tavolina, t.zona,
            u.emri + ' ' + u.mbiemri AS kamarier,
            z.emri AS zbritja, z.lloji AS zbritja_lloji, z.vlera AS zbritja_vlera
     FROM   Porosite p
     LEFT JOIN Tavolinat   t ON t.tavolina_id  = p.tavolina_id
     JOIN   Perdoruesit    u ON u.perdorues_id  = p.perdorues_id
     LEFT JOIN Zbritjet    z ON z.zbritje_id    = p.zbritje_id
     WHERE  p.porosi_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );

  const order = orderResult.recordset[0];
  if (!order) return null;

  const linesResult = await query(
    `SELECT pd.porosi_det_id, pd.sasia, pd.cmimi_njesi, pd.shenime, pd.statusi,
            pr.produkt_id, pr.emri AS produkt, pr.njesia,
            k.emri AS kategori, k.printer_dest,
            (pd.sasia * pd.cmimi_njesi) AS totali_linje
     FROM   PorosiDetaje pd
     JOIN   Produktet    pr ON pr.produkt_id  = pd.produkt_id
     JOIN   Kategorite   k  ON k.kategori_id  = pr.kategori_id
     WHERE  pd.porosi_id = @id
     ORDER  BY pd.porosi_det_id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );

  order.linjet = linesResult.recordset;
  order.subtotali = order.linjet
    .filter(l => l.statusi === 'aktive')
    .reduce((sum, l) => sum + parseFloat(l.totali_linje), 0);

  return order;
}

// ─── OPEN NEW ORDER ─────────────────────────────────────────
async function open(data, actorId = null) {
  const { tavolina_id, numri_personave, shenime } = data;

  const result = await query(
    `INSERT INTO Porosite (tavolina_id, perdorues_id, numri_personave, shenime)
     OUTPUT INSERTED.*
     VALUES (@tavolina, @perdorues, @numri, @shenime)`,
    [
      { name: 'tavolina',  type: sql.Int,          value: tavolina_id ?? null },
      { name: 'perdorues', type: sql.Int,          value: actorId },
      { name: 'numri',     type: sql.TinyInt,      value: numri_personave ?? null },
      { name: 'shenime',   type: sql.NVarChar(255),value: shenime ?? null },
    ]
  );
  const order = result.recordset[0];

  // Mark table as occupied
  if (tavolina_id) {
    await tableService.setStatus(tavolina_id, 'e_zene', actorId);
  }

  await logAudit('Porosite', order.porosi_id, 'INSERT', null, order, actorId);
  return order;
}

// ─── ADD LINE ITEM ───────────────────────────────────────────
async function addLine(porosiId, data, actorId = null) {
  const { produkt_id, sasia, cmimi_njesi, shenime, zbritje_id } = data;
  const result = await query(
    `INSERT INTO PorosiDetaje (porosi_id, produkt_id, sasia, cmimi_njesi, shenime, zbritje_id)
     OUTPUT INSERTED.*
     VALUES (@porosi, @produkt, @sasia, @cmimi, @shenime, @zbritje)`,
    [
      { name: 'porosi',  type: sql.Int,           value: porosiId },
      { name: 'produkt', type: sql.Int,           value: produkt_id },
      { name: 'sasia',   type: sql.Decimal(10,3), value: sasia },
      { name: 'cmimi',   type: sql.Decimal(10,2), value: cmimi_njesi },
      { name: 'shenime', type: sql.NVarChar(100), value: shenime ?? null },
      { name: 'zbritje', type: sql.Int,           value: zbritje_id ?? null },
    ]
  );
  return result.recordset[0];
}

// ─── UPDATE LINE ITEM ────────────────────────────────────────
async function updateLine(porosiDetId, data) {
  const { sasia, shenime, zbritje_id } = data;
  const result = await query(
    `UPDATE PorosiDetaje
     SET sasia = @sasia, shenime = @shenime, zbritje_id = @zbritje
     OUTPUT INSERTED.*
     WHERE porosi_det_id = @id`,
    [
      { name: 'id',      type: sql.Int,           value: porosiDetId },
      { name: 'sasia',   type: sql.Decimal(10,3), value: sasia },
      { name: 'shenime', type: sql.NVarChar(100), value: shenime ?? null },
      { name: 'zbritje', type: sql.Int,           value: zbritje_id ?? null },
    ]
  );
  return result.recordset[0];
}

// ─── CANCEL LINE ITEM ────────────────────────────────────────
async function cancelLine(porosiDetId, actorId = null) {
  const result = await query(
    `UPDATE PorosiDetaje SET statusi = 'anulluar'
     OUTPUT INSERTED.*
     WHERE porosi_det_id = @id`,
    [{ name: 'id', type: sql.Int, value: porosiDetId }]
  );
  await logAudit('PorosiDetaje', porosiDetId, 'UPDATE',
    { statusi: 'aktive' }, { statusi: 'anulluar' }, actorId);
  return result.recordset[0];
}

// ─── SEND TO KITCHEN/BAR ─────────────────────────────────────
async function sendToKitchen(porosiId, actorId = null) {
  const result = await query(
    `UPDATE Porosite
     SET statusi = 'ne_kuzhin', derguar_kuzhin = GETDATE()
     OUTPUT INSERTED.*
     WHERE porosi_id = @id`,
    [{ name: 'id', type: sql.Int, value: porosiId }]
  );
  await logAudit('Porosite', porosiId, 'UPDATE',
    { statusi: 'e_re' }, { statusi: 'ne_kuzhin' }, actorId);
  return result.recordset[0];
}

// ─── MARK READY ─────────────────────────────────────────────
async function markReady(porosiId, actorId = null) {
  const result = await query(
    `UPDATE Porosite SET statusi = 'gati', gati_me = GETDATE()
     OUTPUT INSERTED.*
     WHERE porosi_id = @id`,
    [{ name: 'id', type: sql.Int, value: porosiId }]
  );
  await logAudit('Porosite', porosiId, 'UPDATE',
    { statusi: 'ne_kuzhin' }, { statusi: 'gati' }, actorId);
  return result.recordset[0];
}

// ─── MARK SERVED ────────────────────────────────────────────
async function markServed(porosiId, actorId = null) {
  const result = await query(
    `UPDATE Porosite SET statusi = 'sherbyer'
     OUTPUT INSERTED.*
     WHERE porosi_id = @id`,
    [{ name: 'id', type: sql.Int, value: porosiId }]
  );
  await logAudit('Porosite', porosiId, 'UPDATE',
    { statusi: 'gati' }, { statusi: 'sherbyer' }, actorId);
  return result.recordset[0];
}

// ─── APPLY ORDER-LEVEL DISCOUNT ──────────────────────────────
async function applyDiscount(porosiId, zbritjeId, actorId = null) {
  const result = await query(
    `UPDATE Porosite SET zbritje_id = @zbritje
     OUTPUT INSERTED.*
     WHERE porosi_id = @id`,
    [
      { name: 'id',      type: sql.Int, value: porosiId },
      { name: 'zbritje', type: sql.Int, value: zbritjeId },
    ]
  );
  await logAudit('Porosite', porosiId, 'UPDATE',
    { zbritje_id: null }, { zbritje_id: zbritjeId }, actorId);
  return result.recordset[0];
}

// ─── CANCEL ORDER ────────────────────────────────────────────
async function cancel(porosiId, actorId = null) {
  const order = await getById(porosiId);
  if (!order) return null;

  await query(
    `UPDATE Porosite SET statusi = 'anulluar', mbyllur_me = GETDATE()
     WHERE porosi_id = @id`,
    [{ name: 'id', type: sql.Int, value: porosiId }]
  );

  if (order.tavolina_id) {
    await tableService.setStatus(order.tavolina_id, 'e_lire', actorId);
  }

  await logAudit('Porosite', porosiId, 'UPDATE',
    { statusi: order.statusi }, { statusi: 'anulluar' }, actorId);
  return true;
}

// ─── CLOSE ORDER (after payment) ────────────────────────────
async function close(porosiId, actorId = null) {
  const order = await getById(porosiId);
  if (!order) return null;

  await query(
    `UPDATE Porosite SET statusi = 'paguar', mbyllur_me = GETDATE()
     WHERE porosi_id = @id`,
    [{ name: 'id', type: sql.Int, value: porosiId }]
  );

  if (order.tavolina_id) {
    await tableService.setStatus(order.tavolina_id, 'e_lire', actorId);
  }

  // Deduct stock for each sold line
  for (const line of order.linjet.filter(l => l.statusi === 'aktive')) {
    await query(
      `UPDATE Stoku
       SET sasia_aktuale = sasia_aktuale - @sasia, updated_me = GETDATE()
       WHERE produkt_id = @id`,
      [
        { name: 'sasia', type: sql.Decimal(10,3), value: line.sasia },
        { name: 'id',    type: sql.Int,           value: line.produkt_id },
      ]
    );
  }

  await logAudit('Porosite', porosiId, 'UPDATE',
    { statusi: order.statusi }, { statusi: 'paguar' }, actorId);
  return true;
}

module.exports = {
  getAll, getById,
  open, addLine, updateLine, cancelLine,
  sendToKitchen, markReady, markServed,
  applyDiscount, cancel, close,
};
