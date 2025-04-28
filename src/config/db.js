const mariadb = require('mariadb');
require('dotenv').config();

// --- Table Schemas ---
const TABLE_SCHEMAS = {
  members: `
    CREATE TABLE IF NOT EXISTS members (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      first_name VARCHAR(100) DEFAULT NULL,
      last_name VARCHAR(100) DEFAULT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      discord_id VARCHAR(255) DEFAULT NULL,
      slack_id TEXT DEFAULT NULL,
      github_username TEXT DEFAULT NULL,
      school VARCHAR(255) DEFAULT NULL,
      ysws_projects TEXT DEFAULT NULL,
      hcb_member VARCHAR(255) DEFAULT NULL,
      birthdate DATE DEFAULT NULL,
      class VARCHAR(20) DEFAULT NULL,
      phone VARCHAR(20) DEFAULT NULL,
      role VARCHAR(50) DEFAULT NULL,
      join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      description TEXT DEFAULT NULL,
      active_member BOOLEAN DEFAULT FALSE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
  `,
  applications: `
    CREATE TABLE IF NOT EXISTS applications (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      school VARCHAR(255) NOT NULL,
      class VARCHAR(20) NOT NULL,
      birthdate DATE NOT NULL,
      phone VARCHAR(20) NOT NULL,
      superpowers TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      student_id VARCHAR(255) DEFAULT NULL,
      discord_username VARCHAR(255) DEFAULT NULL
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci
  `,
  contact_submissions: `
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci
  `,
  ysws_projects: `
    CREATE TABLE IF NOT EXISTS ysws_projects (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      start_date DATE DEFAULT NULL,
      end_date DATE DEFAULT NULL,
      description TEXT DEFAULT NULL,
      website_url VARCHAR(100) DEFAULT NULL,
      apply_url VARCHAR(100) DEFAULT NULL
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci
  `
};

// --- Connection Pool ---
const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  idleTimeout: 5000,
  metaAsArray: false,
  namedPlaceholders: true,
  supportBigNumbers: true
});

// --- Schema Management Helpers ---
function parseSchema(sql) {
  const columns = [];
  const columnRegex = /`?(\w+)`?\s+((?:.(?!\b(?:CHARACTER SET|COLLATE|\)\s*ENGINE)))*)/gmi;
  let columnDefinitions = sql.split('\n').filter(line =>
    line.trim() &&
    !line.includes('CREATE TABLE') &&
    !line.includes('CHARACTER SET') &&
    !line.includes(') ENGINE')
  ).join('\n');
  let match;
  while ((match = columnRegex.exec(columnDefinitions)) !== null) {
    const [, name, definition] = match;
    const cleanDefinition = definition
      .replace(/,\s*$/, '')
      .replace(/\)\s*$/, '')
      .trim();
    if (name && cleanDefinition &&
      !['PRIMARY', 'UNIQUE', 'KEY', 'CONSTRAINT', 'FOREIGN'].some(kw =>
        cleanDefinition.toUpperCase().includes(kw))) {
      columns.push({ name: name.trim(), definition: cleanDefinition });
    }
  }
  return columns;
}

async function ensureColumnsExist(conn, tableName, columns) {
  for (const column of columns) {
    try {
      const [rows] = await conn.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [process.env.DB_NAME, tableName, column.name]
      );
      if (!rows || rows.length === 0) {
        console.log(`Adding column ${tableName}.${column.name}...`);
        await conn.query(
          `ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition}`
        );
      }
    } catch (error) {
      console.error(`Column verification failed for ${tableName}.${column.name}:`, error);
      throw error;
    }
  }
}

async function createTables(conn) {
  for (const [tableName, schema] of Object.entries(TABLE_SCHEMAS)) {
    await conn.query(schema);
    console.log(`${tableName} table validated`);
  }
}


// --- Main Database Initialization ---
async function initDatabase() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('Database connected successfully');
    await conn.beginTransaction();

    // 1. Create tables with latest schema
    await createTables(conn);

    // 2. Ensure all columns exist
    for (const [tableName, schema] of Object.entries(TABLE_SCHEMAS)) {
      const columns = parseSchema(schema);
      await ensureColumnsExist(conn, tableName, columns);
    }

    // 3. Create indexes
    await conn.commit();
    console.log('Database schema validated successfully');
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Database initialization failed:', err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { pool, initDatabase };
