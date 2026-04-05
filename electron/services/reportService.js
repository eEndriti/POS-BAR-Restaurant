const { query, sql } = require('../../db/queryHelper');
const { logAudit }   = require('../audit/auditService');

// ─── DAILY SUMMARY (used to build Z-report) ─────────────────
async function getDailySummary(date) {
  const params = [{ name: 'date', type: sql.Date, value: date }];

  const totalsResult = await query(
    `SELECT
       COUNT(DISTINCT p.porosi_id)                                              AS nr_porosive,
       ISNULL(SUM(pd.sasia * pd.cmimi_njesi), 0)                               AS total_shitje,
       ISNULL(SUM(pg.shuma_tvsh), 0)                                           AS total_tvsh,
       ISNULL(SUM(CASE WHEN tp.emri = 'kesh'  THEN pg.shuma ELSE 0 END), 0)   AS total_kesh,
       ISNULL(SUM(CASE WHEN tp.emri = 'karte' THEN pg.shuma ELSE 0 END), 0)   AS total_karte,
       ISNULL(SUM(pg.bakshish), 0)                                             AS total_bakshish
     FROM   Porosite p
     JOIN   Pagesat        pg ON pg.porosi_id     = p.porosi_id
     JOIN   TipetPageses   tp ON tp.tip_pagese_id = pg.tip_pagese_id
     LEFT JOIN PorosiDetaje pd ON pd.porosi_id    = p.porosi_id AND pd.statusi = 'aktive'
     WHERE  CAST(p.mbyllur_me AS DATE) = @date AND p.statusi = 'paguar'`,
    params
  );

  const discountResult = await query(
    `SELECT ISNULL(SUM(
       CASE z.lloji
         WHEN 'perqind' THEN (pd.sasia * pd.cmimi_njesi) * z.vlera / 100
         ELSE z.vlera
       END), 0) AS total_zbritje
     FROM   Porosite p
     JOIN   Zbritjet z ON z.zbritje_id = p.zbritje_id
     LEFT JOIN PorosiDetaje pd ON pd.porosi_id = p.porosi_id AND pd.statusi = 'aktive'
     WHERE  CAST(p.mbyllur_me AS DATE) = @date AND p.statusi = 'paguar'`,
    params
  );

  const returnsResult = await query(
    `SELECT ISNULL(SUM(shuma_kthyer), 0) AS total_kthime
     FROM Kthimet
     WHERE CAST(kthyer_me AS DATE) = @date`,
    params
  );

  const byCategory = await query(
    `SELECT k.emri AS kategori,
            COUNT(DISTINCT p.porosi_id)          AS nr_porosive,
            SUM(pd.sasia)                        AS total_sasia,
            SUM(pd.sasia * pd.cmimi_njesi)       AS total_vlera
     FROM   Porosite p
     JOIN   PorosiDetaje pd ON pd.porosi_id  = p.porosi_id AND pd.statusi = 'aktive'
     JOIN   Produktet    pr ON pr.produkt_id = pd.produkt_id
     JOIN   Kategorite   k  ON k.kategori_id = pr.kategori_id
     WHERE  CAST(p.mbyllur_me AS DATE) = @date AND p.statusi = 'paguar'
     GROUP  BY k.emri
     ORDER  BY total_vlera DESC`,
    params
  );

  const topProducts = await query(
    `SELECT TOP 10 pr.emri AS produkt,
            SUM(pd.sasia)                  AS total_sasia,
            SUM(pd.sasia * pd.cmimi_njesi) AS total_vlera
     FROM   Porosite p
     JOIN   PorosiDetaje pd ON pd.porosi_id  = p.porosi_id AND pd.statusi = 'aktive'
     JOIN   Produktet    pr ON pr.produkt_id = pd.produkt_id
     WHERE  CAST(p.mbyllur_me AS DATE) = @date AND p.statusi = 'paguar'
     GROUP  BY pr.emri
     ORDER  BY total_vlera DESC`,
    params
  );

  return {
    date,
    ...totalsResult.recordset[0],
    ...discountResult.recordset[0],
    ...returnsResult.recordset[0],
    sipas_kategorise: byCategory.recordset,
    produktet_top:    topProducts.recordset,
  };
}

// ─── SAVE Z-REPORT ───────────────────────────────────────────
async function saveZReport(date, actorId) {
  const summary = await getDailySummary(date);

  // Upsert — replace if already saved today
  await query(
    `IF EXISTS (SELECT 1 FROM MbylljaDites WHERE data_raport = @date)
       UPDATE MbylljaDites
       SET total_shitje = @shitje, total_tvsh = @tvsh, total_kesh = @kesh,
           total_karte = @karte, total_zbritje = @zbritje, total_kthime = @kthime,
           nr_porosive = @nrPoros, perdorues_id = @user, mbyllur_me = GETDATE()
       WHERE data_raport = @date
     ELSE
       INSERT INTO MbylljaDites
         (data_raport, perdorues_id, total_shitje, total_tvsh, total_kesh,
          total_karte, total_zbritje, total_kthime, nr_porosive)
       VALUES
         (@date, @user, @shitje, @tvsh, @kesh, @karte, @zbritje, @kthime, @nrPoros)`,
    [
      { name: 'date',    type: sql.Date,          value: date },
      { name: 'user',    type: sql.Int,           value: actorId },
      { name: 'shitje',  type: sql.Decimal(12,2), value: summary.total_shitje },
      { name: 'tvsh',    type: sql.Decimal(12,2), value: summary.total_tvsh },
      { name: 'kesh',    type: sql.Decimal(12,2), value: summary.total_kesh },
      { name: 'karte',   type: sql.Decimal(12,2), value: summary.total_karte },
      { name: 'zbritje', type: sql.Decimal(12,2), value: summary.total_zbritje },
      { name: 'kthime',  type: sql.Decimal(12,2), value: summary.total_kthime },
      { name: 'nrPoros', type: sql.Int,           value: summary.nr_porosive },
    ]
  );

  return summary;
}

// ─── GET SAVED Z-REPORTS ─────────────────────────────────────
async function getZReports({ from = null, to = null } = {}) {
  const params     = [];
  const conditions = [];

  if (from) {
    conditions.push('m.data_raport >= @from');
    params.push({ name: 'from', type: sql.Date, value: from });
  }
  if (to) {
    conditions.push('m.data_raport <= @to');
    params.push({ name: 'to', type: sql.Date, value: to });
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const result = await query(
    `SELECT m.*, u.emri + ' ' + u.mbiemri AS mbylloi
     FROM MbylljaDites m
     JOIN Perdoruesit u ON u.perdorues_id = m.perdorues_id
     ${where}
     ORDER BY m.data_raport DESC`,
    params
  );
  return result.recordset;
}

// ─── REVENUE BY PERIOD ───────────────────────────────────────
async function getRevenueByPeriod(from, to) {
  const result = await query(
    `SELECT CAST(p.mbyllur_me AS DATE) AS data,
            COUNT(DISTINCT p.porosi_id)          AS nr_porosi,
            SUM(pd.sasia * pd.cmimi_njesi)       AS total
     FROM   Porosite p
     JOIN   PorosiDetaje pd ON pd.porosi_id = p.porosi_id AND pd.statusi = 'aktive'
     WHERE  p.statusi = 'paguar'
       AND  CAST(p.mbyllur_me AS DATE) BETWEEN @from AND @to
     GROUP  BY CAST(p.mbyllur_me AS DATE)
     ORDER  BY data`,
    [
      { name: 'from', type: sql.Date, value: from },
      { name: 'to',   type: sql.Date, value: to },
    ]
  );
  return result.recordset;
}

// ─── HOURLY BREAKDOWN (busy hours) ──────────────────────────
async function getHourlyBreakdown(date) {
  const result = await query(
    `SELECT DATEPART(HOUR, p.hapur_me)           AS ora,
            COUNT(DISTINCT p.porosi_id)           AS nr_porosi,
            SUM(pd.sasia * pd.cmimi_njesi)        AS total
     FROM   Porosite p
     JOIN   PorosiDetaje pd ON pd.porosi_id = p.porosi_id AND pd.statusi = 'aktive'
     WHERE  CAST(p.hapur_me AS DATE) = @date AND p.statusi = 'paguar'
     GROUP  BY DATEPART(HOUR, p.hapur_me)
     ORDER  BY ora`,
    [{ name: 'date', type: sql.Date, value: date }]
  );
  return result.recordset;
}

module.exports = { getDailySummary, saveZReport, getZReports, getRevenueByPeriod, getHourlyBreakdown };
