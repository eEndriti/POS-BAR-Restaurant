const { query, sql } = require('../../db/queryHelper');
const { logAudit }   = require('../audit/auditService');
const orderService   = require('../orders/orderService');

// ─── GET ALL RETURNS ──────────────────────────────────────────
async function getAll({ date = null } = {}) {
  const params     = [];
  const conditions = [];

  if (date) {
    conditions.push('CAST(k.kthyer_me AS DATE) = @date');
    params.push({ name: 'date', type: sql.Date, value: date });
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const result = await query(
    `SELECT k.kthim_id, k.arsyeja, k.shuma_kthyer, k.kthyer_me,
            k.porosi_id, k.porosi_det_id,
            u.emri + ' ' + u.mbiemri AS aprovoi,
            p.emri AS produkt
     FROM   Kthimet k
     JOIN   Perdoruesit   u  ON u.perdorues_id   = k.perdorues_id
     LEFT JOIN PorosiDetaje pd ON pd.porosi_det_id = k.porosi_det_id
     LEFT JOIN Produktet   p  ON p.produkt_id      = pd.produkt_id
     ${where}
     ORDER  BY k.kthyer_me DESC`,
    params
  );
  return result.recordset;
}

// ─── RETURN FULL ORDER ───────────────────────────────────────
async function returnOrder(porosiId, arsyeja, actorId = null) {
  const order = await orderService.getById(porosiId);
  if (!order) throw new Error('Order not found');

  const shuma = order.linjet
    .filter(l => l.statusi === 'aktive')
    .reduce((sum, l) => sum + parseFloat(l.totali_linje), 0);

  const result = await query(
    `INSERT INTO Kthimet (porosi_id, porosi_det_id, perdorues_id, arsyeja, shuma_kthyer)
     OUTPUT INSERTED.*
     VALUES (@porosi, NULL, @perdorues, @arsye, @shuma)`,
    [
      { name: 'porosi',    type: sql.Int,           value: porosiId },
      { name: 'perdorues', type: sql.Int,           value: actorId },
      { name: 'arsye',     type: sql.NVarChar(255), value: arsyeja },
      { name: 'shuma',     type: sql.Decimal(10,2), value: parseFloat(shuma.toFixed(2)) },
    ]
  );
  const ret = result.recordset[0];

  // Mark order as returned
  await query(
    `UPDATE Porosite SET statusi = 'kthyer' WHERE porosi_id = @id`,
    [{ name: 'id', type: sql.Int, value: porosiId }]
  );

  // Restore stock for each line
  for (const line of order.linjet.filter(l => l.statusi === 'aktive')) {
    await query(
      `UPDATE Stoku SET sasia_aktuale = sasia_aktuale + @sasia, updated_me = GETDATE()
       WHERE produkt_id = @id`,
      [
        { name: 'sasia', type: sql.Decimal(10,3), value: line.sasia },
        { name: 'id',    type: sql.Int,           value: line.produkt_id },
      ]
    );
  }

  await logAudit('Kthimet', ret.kthim_id, 'INSERT', null, ret, actorId);
  return ret;
}

// ─── RETURN SINGLE LINE ──────────────────────────────────────
async function returnLine(porosiDetId, arsyeja, actorId = null) {
  const lineResult = await query(
    `SELECT pd.*, p.emri AS produkt FROM PorosiDetaje pd
     JOIN Produktet p ON p.produkt_id = pd.produkt_id
     WHERE pd.porosi_det_id = @id`,
    [{ name: 'id', type: sql.Int, value: porosiDetId }]
  );
  const line = lineResult.recordset[0];
  if (!line) throw new Error('Order line not found');

  const shuma = parseFloat((line.sasia * line.cmimi_njesi).toFixed(2));

  const result = await query(
    `INSERT INTO Kthimet (porosi_id, porosi_det_id, perdorues_id, arsyeja, shuma_kthyer)
     OUTPUT INSERTED.*
     VALUES (@porosi, @det, @perdorues, @arsye, @shuma)`,
    [
      { name: 'porosi',    type: sql.Int,           value: line.porosi_id },
      { name: 'det',       type: sql.Int,           value: porosiDetId },
      { name: 'perdorues', type: sql.Int,           value: actorId },
      { name: 'arsye',     type: sql.NVarChar(255), value: arsyeja },
      { name: 'shuma',     type: sql.Decimal(10,2), value: shuma },
    ]
  );
  const ret = result.recordset[0];

  // Cancel the specific line
  await query(
    `UPDATE PorosiDetaje SET statusi = 'kthyer' WHERE porosi_det_id = @id`,
    [{ name: 'id', type: sql.Int, value: porosiDetId }]
  );

  // Restore stock for that item
  await query(
    `UPDATE Stoku SET sasia_aktuale = sasia_aktuale + @sasia, updated_me = GETDATE()
     WHERE produkt_id = @id`,
    [
      { name: 'sasia', type: sql.Decimal(10,3), value: line.sasia },
      { name: 'id',    type: sql.Int,           value: line.produkt_id },
    ]
  );

  await logAudit('Kthimet', ret.kthim_id, 'INSERT', null, ret, actorId);
  return ret;
}

module.exports = { getAll, returnOrder, returnLine };
