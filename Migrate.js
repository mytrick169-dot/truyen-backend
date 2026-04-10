/**
 * FILE: migrate.js — đặt ở thư mục gốc backend, cùng cấp server.js
 * Chạy: node migrate.js
 * ★ FIX MỚI: thêm cột is_hot vào comics, thêm phone/fullname/birthday/avatar vào users
 */
const mysql = require('mysql2/promise');
require('dotenv').config();
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'truyen_db',
    port: parseInt(process.env.DB_PORT) || 3306,
    multipleStatements: true,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

async function migrate() {
    let conn;
    try {
        conn = await mysql.createConnection(DB_CONFIG);
        console.log('\n✅ Kết nối MySQL thành công!\n');

        console.log('📋 [1/7] Tạo bảng sessions...');
        await conn.execute(`CREATE TABLE IF NOT EXISTS sessions (
            id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL,
            token VARCHAR(64) NOT NULL, expires_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_token (token), INDEX idx_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        console.log('   ✅ sessions OK');

        console.log('📋 [2/7] Kiểm tra bảng follows...');
        const [cols] = await conn.execute(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='follows'`);
        const colNames = cols.map(c => c.COLUMN_NAME);
        if (!colNames.length) {
            await conn.execute(`CREATE TABLE IF NOT EXISTS follows (
                id INT AUTO_INCREMENT PRIMARY KEY, comic_id INT NOT NULL, user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_follow (comic_id, user_id),
                INDEX idx_user_id (user_id), INDEX idx_comic_id (comic_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        } else if (colNames.includes('user_id') && !colNames.includes('followed_at') && !colNames.includes('created_at')) {
            try { await conn.execute(`ALTER TABLE follows ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`); } catch {}
        } else if (colNames.includes('user_name') && !colNames.includes('user_id')) {
            console.log('   → Phát hiện user_name, thêm user_id...');
            try { await conn.execute(`ALTER TABLE follows ADD COLUMN user_id INT NOT NULL DEFAULT 0 AFTER comic_id`); } catch {}
            await conn.execute(`UPDATE follows f JOIN users u ON f.user_name = u.username SET f.user_id = u.id WHERE f.user_id = 0`);
        }
        console.log('   ✅ follows OK');

        console.log('📋 [3/7] Kiểm tra bảng history...');
        await conn.execute(`CREATE TABLE IF NOT EXISTS history (
            id INT AUTO_INCREMENT PRIMARY KEY, user_name VARCHAR(100) NOT NULL,
            comic_id INT NOT NULL, chapter_read INT NOT NULL DEFAULT 1,
            read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_history (user_name, comic_id),
            INDEX idx_h_user_name (user_name), INDEX idx_h_comic_id (comic_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        console.log('   ✅ history OK');

        console.log('📋 [4/7] Kiểm tra bảng comments...');
        await conn.execute(`CREATE TABLE IF NOT EXISTS comments (
            id INT AUTO_INCREMENT PRIMARY KEY, comic_id INT NOT NULL,
            user_name VARCHAR(100) NOT NULL DEFAULT 'Ẩn danh',
            content TEXT NOT NULL, parent_id INT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_c_comic_id (comic_id), INDEX idx_c_user_name (user_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        console.log('   ✅ comments OK');

        console.log('📋 [5/7] Kiểm tra bảng ratings...');
        await conn.execute(`CREATE TABLE IF NOT EXISTS ratings (
            id INT AUTO_INCREMENT PRIMARY KEY, comic_id INT NOT NULL,
            user_name VARCHAR(100) NOT NULL, score TINYINT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_rating (comic_id, user_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        console.log('   ✅ ratings OK');

        console.log('📋 [6/7] Thêm cột thiếu vào bảng comics...');
        const comicCols = [
            `ALTER TABLE comics ADD COLUMN IF NOT EXISTS is_hot TINYINT(1) DEFAULT 0`,
            `ALTER TABLE comics ADD COLUMN IF NOT EXISTS followers_count INT DEFAULT 0`,
            `ALTER TABLE comics ADD COLUMN IF NOT EXISTS rating_avg DECIMAL(3,2) DEFAULT 0`,
            `ALTER TABLE comics ADD COLUMN IF NOT EXISTS rating_count INT DEFAULT 0`,
            `ALTER TABLE comics ADD COLUMN IF NOT EXISTS latest_chapter INT DEFAULT NULL`,
            `ALTER TABLE comics ADD COLUMN IF NOT EXISTS views INT DEFAULT 0`,
            `ALTER TABLE comics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
        ];
        for (const sql of comicCols) { try { await conn.execute(sql); } catch {} }
        console.log('   ✅ comics OK');

        console.log('📋 [7/7] Thêm cột profile vào bảng users...');
        const userCols = [
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) DEFAULT NULL`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS fullname VARCHAR(150) DEFAULT NULL`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday DATE DEFAULT NULL`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(255) DEFAULT NULL`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned TINYINT(1) DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason VARCHAR(255) DEFAULT NULL`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until DATETIME DEFAULT NULL`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS token VARCHAR(64) DEFAULT NULL`,
        ];
        for (const sql of userCols) { try { await conn.execute(sql); } catch {} }
        console.log('   ✅ users OK');

        console.log('\n🎉 ============================================');
        console.log('✅ MIGRATE HOÀN TẤT! Khởi động lại server:');
        console.log('   node server.js');
        console.log('🎉 ============================================\n');
    } catch (err) {
        console.error('\n💥 Lỗi migrate:', err.message);
        console.error(err);
    } finally {
        if (conn) await conn.end();
    }
}
migrate();