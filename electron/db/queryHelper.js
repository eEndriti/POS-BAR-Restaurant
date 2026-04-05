const { getPool, sql } = require('./connection');

/**
 * Execute a parameterised query.
 * @param {string} query  - T-SQL string with @param placeholders
 * @param {Array}  params - [{ name, type, value }]
 * @returns {Promise<sql.IResult>}
 */
async function query(queryStr, params = []) {
  const pool    = await getPool();
  const request = pool.request();
  for (const p of params) {
    request.input(p.name, p.type, p.value);
  }
  return request.query(queryStr);
}

/**
 * Execute a stored procedure (if needed later).
 */
async function execute(procName, params = []) {
  const pool    = await getPool();
  const request = pool.request();
  for (const p of params) {
    request.input(p.name, p.type, p.value);
  }
  return request.execute(procName);
}

module.exports = { query, execute, sql };
