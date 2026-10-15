/** Configure the database role used by the application containers. */
export async function configureRuntimeRole(db, password) {
  if (!password || !/^[A-Za-z0-9_-]{32,}$/.test(password)) throw Error('RUNTIME_DATABASE_PASSWORD exige pelo menos 32 caracteres seguros para URL.');
  await db.query('BEGIN');
  try {
    const exists = (await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1', ['hunter_runtime'])).rowCount > 0;
    const operation = exists ? 'ALTER ROLE' : 'CREATE ROLE';
    const statement = (await db.query(`SELECT format('${operation} %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', $1::text, $2::text) AS sql`, ['hunter_runtime', password])).rows[0].sql;
    await db.query(statement);
    const connect = (await db.query("SELECT format('GRANT CONNECT ON DATABASE %I TO hunter_runtime', current_database()) AS sql")).rows[0].sql;
    await db.query(connect);
    await db.query('GRANT USAGE ON SCHEMA public TO hunter_runtime');
    await db.query('GRANT SELECT, INSERT, UPDATE ON hunter_users, hunter_sheets TO hunter_runtime');
    await db.query('GRANT SELECT, INSERT, UPDATE, DELETE ON hunter_sessions, hunter_auth_flows, hunter_rate_limits TO hunter_runtime');
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
