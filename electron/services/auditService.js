const { query, sql } = require('../db/queryHelper');

/**
 * Write an entry to AuditLog.
 * Call this inside any INSERT / UPDATE / DELETE operation.
 *
 * @param {string} tabela       - Table name
 * @param {number} rekordId     - PK of affected row
 * @param {string} veprimi      - 'INSERT' | 'UPDATE' | 'DELETE'
 * @param {object|null} before  - Row snapshot before change
 * @param {object|null} after   - Row snapshot after change
 * @param {number|null} userId  - perdorues_id performing the action
 */
async function logAudit(tabela, rekordId, veprimi, before = null, after = null, userId = null) {
  await query(
    `INSERT INTO AuditLog (perdorues_id, tabela, rekord_id, veprimi, vlerat_para, vlerat_pas)
     VALUES (@userId, @tabela, @rekordId, @veprimi, @before, @after)`,
    [
      { name: 'userId',   type: sql.Int,          value: userId },
      { name: 'tabela',   type: sql.NVarChar(50),  value: tabela },
      { name: 'rekordId', type: sql.Int,           value: rekordId },
      { name: 'veprimi',  type: sql.NVarChar(10),  value: veprimi },
      { name: 'before',   type: sql.NVarChar(sql.MAX), value: before ? JSON.stringify(before) : null },
      { name: 'after',    type: sql.NVarChar(sql.MAX), value: after  ? JSON.stringify(after)  : null },
    ]
  );
}

module.exports = { logAudit };
