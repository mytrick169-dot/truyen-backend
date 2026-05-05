require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST, user: process.env.DB_USER,
        password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT), ssl: { rejectUnauthorized: false }
    });

    const cols = [
        "ALTER TABLE comics ADD COLUMN is_hot TINYINT(1) DEFAULT 0",
        "ALTER TABLE comics ADD COLUMN latest_chapter INT DEFAULT NULL",
        "ALTER TABLE comics ADD COLUMN genre VARCHAR(255)",
        "ALTER TABLE comics ADD COLUMN cover VARCHAR(255)",
        "ALTER TABLE comics ADD COLUMN author VARCHAR(150)",
        "ALTER TABLE comics ADD COLUMN status VARCHAR(50) DEFAULT 'Đang tiến hành'",
        "ALTER TABLE comics ADD COLUMN views INT DEFAULT 0",
    ];

    for (const sql of cols) {
        try { await conn.execute(sql); console.log('OK:', sql.split(' ')[4]); }
        catch (e) { console.log('Skip (đã có):', sql.split(' ')[4]); }
    }

    await conn.end();
    console.log('\nXong!');
})().catch(console.error);
