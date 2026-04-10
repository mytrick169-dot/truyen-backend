/* FILE: config/db.js */
const mysql = require('mysql2');

// Ưu tiên DATABASE_URL (Aiven/PlanetScale cấp), fallback về từng biến riêng lẻ
const pool = process.env.DATABASE_URL
    ? mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":true}')
    : mysql.createPool({
        host:     process.env.DB_HOST     || 'localhost',
        user:     process.env.DB_USER     || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME     || 'truyen_db',
        port:     parseInt(process.env.DB_PORT || '3306'),
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

// Kiểm tra kết nối khi khởi động
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Kết nối MySQL thất bại:', err.message);
        console.error('   → Kiểm tra lại biến môi trường DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
    } else {
        console.log('✅ Kết nối MySQL thành công! Database:', process.env.DB_NAME || 'truyen_db');
        connection.release();
    }
});

module.exports = pool.promise();