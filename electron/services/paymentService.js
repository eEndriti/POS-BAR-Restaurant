const { query, sql } = require('../../db/queryHelper');
const { logAudit }   = require('../audit/auditService');
const orderService   = require('../orders/orderService');

const VAT_RATE = 20; // percent — adjust per country

// ─── GET PAYMENT TYPES ────────────────────────────────────────
async function getPaymentTypes() {
  const result = await query(`SELECT * FROM TipetPageses ORDER BY emri`);
  return result.recordset;
}

// ─── GET PAYMENTS FOR AN ORDER ───────────────────────────────
async function getByOrder(porosiId) {
  const result = await query(
    `SELECT pg.pagese_id, pg.shuma, pg.tvsh_perqind, pg.shuma_tvsh,
            pg.bakshish, pg.kusur, pg.paguar_me,
            tp.emri AS tip_pagese,
            u.emri + ' ' + u.mbiemri AS kasieri
     FROM   Pagesat pg
     JOIN   TipetPageses tp ON tp.tip_pagese_id = pg.tip_pagese_id
     JOIN   Perdoruesit   u ON u.perdorues_id   = pg.perdorues_id
     WHERE  pg.porosi_id = @id
     ORDER  BY pg.paguar_me`,
    [{ name: 'id', type: sql.Int, value: porosiId }]
  );
  return result.recordset;
}

// ─── PROCESS PAYMENT ─────────────────────────────────────────
/**
 * Pay for an order. Supports split payment — call multiple times.
 * After full payment, the order is automatically closed.
 *
 * @param {number} porosiId
 * @param {object} data  - { tip_pagese_id, shuma_dhene, bakshish }
 * @param {number} actorId
 */
async function pay(porosiId, data, actorId = null) {
  const order = await orderService.getById(porosiId);
  if (!order) throw new Error('Order not found');

  const { tip_pagese_id, shuma_dhene, bakshish = 0 } = data;

  // Calculate subtotal of active lines
  const subtotal = order.linjet
    .filter(l => l.statusi === 'aktive')
    .reduce((sum, l) => sum + parseFloat(l.totali_linje), 0);

  // Apply order-level discount if any
  let discount = 0;
  if (order.zbritje_id) {
    const zbritja = { lloji: order.zbritja_lloji, vlera: order.zbritja_vlera };
    const discountService = require('../discounts/discountService');
    discount = discountService.calculate(zbritja, subtotal);
  }

  const totalPayable  = parseFloat((subtotal - discount).toFixed(2));
  const vatAmount     = parseFloat(((totalPayable * VAT_RATE) / 100).toFixed(2));
  const change        = parseFloat(Math.max(0, shuma_dhene - totalPayable).toFixed(2));

  const result = await query(
    `INSERT INTO Pagesat
       (porosi_id, tip_pagese_id, perdorues_id, shuma, tvsh_perqind, shuma_tvsh, bakshish, kusur)
     OUTPUT INSERTED.*
     VALUES (@porosi, @tip, @perdorues, @shuma, @tvsh, @shumaTvsh, @bakshish, @kusur)`,
    [
      { name: 'porosi',    type: sql.Int,          value: porosiId },
      { name: 'tip',       type: sql.Int,          value: tip_pagese_id },
      { name: 'perdorues', type: sql.Int,          value: actorId },
      { name: 'shuma',     type: sql.Decimal(10,2),value: totalPayable },
      { name: 'tvsh',      type: sql.Decimal(5,2), value: VAT_RATE },
      { name: 'shumaTvsh', type: sql.Decimal(10,2),value: vatAmount },
      { name: 'bakshish',  type: sql.Decimal(10,2),value: bakshish },
      { name: 'kusur',     type: sql.Decimal(10,2),value: change },
    ]
  );
  const payment = result.recordset[0];

  // Close the order automatically
  await orderService.close(porosiId, actorId);

  await logAudit('Pagesat', payment.pagese_id, 'INSERT', null, payment, actorId);
  return { ...payment, kusur: change, totalPayable, vatAmount };
}

// ─── RECEIPT DATA (all info needed to print) ────────────────
async function getReceipt(porosiId) {
  const order    = await orderService.getById(porosiId);
  const payments = await getByOrder(porosiId);
  if (!order) return null;

  const subtotali = order.linjet
    .filter(l => l.statusi === 'aktive')
    .reduce((sum, l) => sum + parseFloat(l.totali_linje), 0);

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.shuma), 0);
  const totalVat  = payments.reduce((sum, p) => sum + parseFloat(p.shuma_tvsh), 0);

  return {
    porosi_id:      order.porosi_id,
    tavolina:       order.tavolina,
    kamarier:       order.kamarier,
    hapur_me:       order.hapur_me,
    mbyllur_me:     order.mbyllur_me,
    linjet:         order.linjet.filter(l => l.statusi === 'aktive'),
    subtotali:      parseFloat(subtotali.toFixed(2)),
    tvsh:           parseFloat(totalVat.toFixed(2)),
    totali:         parseFloat(totalPaid.toFixed(2)),
    pagesat:        payments,
  };
}

module.exports = { getPaymentTypes, getByOrder, pay, getReceipt };
