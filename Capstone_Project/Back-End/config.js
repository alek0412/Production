/**
 * App config — port and DB settings from environment.
 * Set these in .env (see .env.example); never commit .env.
 */
module.exports = {
  port: process.env.PORT || 3000,

  /**
   * Flask (Python) base URL — no trailing slash.
   * Node proxies customer auth, waiver, employee login, and court APIs here (same paths as routes/*.py).
   * Set FLASK_API_URL= (empty) to disable Flask and use Node-only customer preview / skip waiver proxy.
   */
  flaskApiBaseUrl: (() => {
    if (process.env.FLASK_API_URL !== undefined) {
      return String(process.env.FLASK_API_URL).replace(/\/$/, '');
    }
    if (process.env.FLASK_WAIVER_URL !== undefined) {
      return String(process.env.FLASK_WAIVER_URL).replace(/\/$/, '');
    }
    return 'http://127.0.0.1:3001';
  })(),

  /** @deprecated use flaskApiBaseUrl — kept for older references */
  get flaskWaiverBaseUrl() {
    return this.flaskApiBaseUrl;
  },

  db: {
    host: process.env.DB_HOST || 'reservation-capstone-db.czltypivanye.us-east-1.rds.amazonaws.com',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME || 'reservation_db_test',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },

  // Optional: full connection URL (overrides host/port/database/user/password if set)
  databaseUrl: process.env.DATABASE_URL,
};
