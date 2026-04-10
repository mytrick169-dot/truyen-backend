/* FILE: models/userModel.js */
const db = require('../config/db');

const User = {

    // Tìm user theo username hoặc email
    findByUsernameOrEmail: async (identifier) => {
        const [rows] = await db.query(
            "SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1",
            [identifier, identifier]
        );
        return rows[0] || null;
    },

    // Tìm user theo id
    findById: async (id) => {
        const [rows] = await db.query(
            "SELECT id, username, email, created_at FROM users WHERE id = ?",
            [id]
        );
        return rows[0] || null;
    },

    // Kiểm tra username đã tồn tại chưa
    existsByUsername: async (username) => {
        const [rows] = await db.query(
            "SELECT id FROM users WHERE username = ?",
            [username]
        );
        return rows.length > 0;
    },

    // Kiểm tra email đã tồn tại chưa
    existsByEmail: async (email) => {
        const [rows] = await db.query(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );
        return rows.length > 0;
    },

    // Tạo tài khoản mới (password đã được hash trước khi truyền vào)
    create: async (username, email, passwordHash) => {
        const [result] = await db.query(
            "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
            [username, email, passwordHash]
        );
        return result.insertId;
    },

    // Lấy toàn bộ users (cho admin)
    getAll: async () => {
        const [rows] = await db.query(
            "SELECT id, username, email, role, banned_until, ban_reason, created_at FROM users ORDER BY id ASC"
        );
        return rows;
    }
};

module.exports = User;