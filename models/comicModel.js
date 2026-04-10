/* FILE: models/comicModel.js */
const db = require('../config/db');

const Comic = {

    // =============================================
    // API NGƯỜI DÙNG
    // =============================================

    // 1. Lấy danh sách truyện (lọc theo thể loại nếu có)
    getAll: async (category) => {
        let query = "SELECT * FROM comics";
        let params = [];
        if (category) {
            query += " WHERE category = ?";
            params.push(category);
        }
        query += " ORDER BY id DESC";
        const [rows] = await db.query(query, params);
        return rows;
    },

    // 2. Xem chi tiết 1 truyện
    getById: async (id) => {
        const [rows] = await db.query("SELECT * FROM comics WHERE id = ?", [id]);
        return rows[0] || null;
    },

    // 3. Xem danh sách chương (mới nhất trước)
    getChapters: async (comicId) => {
        const [rows] = await db.query(
            "SELECT * FROM chapters WHERE comic_id = ? ORDER BY chapter_number DESC",
            [comicId]
        );
        return rows;
    },

    // 4. Đọc bình luận (mới nhất trước)
    getComments: async (comicId) => {
        const [rows] = await db.query(
            "SELECT * FROM comments WHERE comic_id = ? ORDER BY created_at DESC",
            [comicId]
        );
        return rows;
    },

    // 5. Thêm bình luận
    addComment: async (comicId, userName, content) => {
        const [result] = await db.query(
            "INSERT INTO comments (comic_id, user_name, content) VALUES (?, ?, ?)",
            [comicId, userName, content]
        );
        return result.insertId;
    },

    // 6. Lưu lịch sử đọc
    saveHistory: async (userName, comicId, chapter) => {
        // Nếu đã có lịch sử thì cập nhật, chưa có thì thêm mới
        await db.query(
            `INSERT INTO history (user_name, comic_id, chapter_read)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE chapter_read = ?, read_at = CURRENT_TIMESTAMP`,
            [userName, comicId, chapter, chapter]
        );
    },

    // 7. Lấy lịch sử đọc của user
    getHistory: async (userName) => {
        const [rows] = await db.query(
            `SELECT h.*, c.title, c.image, c.category
             FROM history h
             JOIN comics c ON h.comic_id = c.id
             WHERE h.user_name = ?
             ORDER BY h.read_at DESC
             LIMIT 20`,
            [userName]
        );
        return rows;
    },

    // =============================================
    // API ADMIN
    // =============================================

    // 8. Thêm truyện mới
    addComic: async (title, category, author, description, image, status) => {
        const [result] = await db.query(
            "INSERT INTO comics (title, category, author, description, image, status) VALUES (?, ?, ?, ?, ?, ?)",
            [title, category, author, description, image, status || 'Đang tiến hành']
        );
        return result.insertId;
    },

    // 9. Sửa thông tin truyện
    updateComic: async (id, title, category, author, description, status) => {
        await db.query(
            "UPDATE comics SET title = ?, category = ?, author = ?, description = ?, status = ? WHERE id = ?",
            [title, category, author, description, status, id]
        );
    },

    // 10. Xóa truyện (cascade xóa chương và comment liên quan)
    deleteComic: async (id) => {
        // Xóa comments trước
        await db.query("DELETE FROM comments WHERE comic_id = ?", [id]);
        // Xóa chapters
        await db.query("DELETE FROM chapters WHERE comic_id = ?", [id]);
        // Xóa lịch sử
        await db.query("DELETE FROM history WHERE comic_id = ?", [id]);
        // Xóa truyện
        await db.query("DELETE FROM comics WHERE id = ?", [id]);
    },

    // 11. Thêm chương mới
    addChapter: async (comicId, chapterNum, content) => {
        const [result] = await db.query(
            "INSERT INTO chapters (comic_id, chapter_number, content) VALUES (?, ?, ?)",
            [comicId, chapterNum, content]
        );
        // Cập nhật số chương mới nhất trong bảng comics
        await db.query(
            "UPDATE comics SET latest_chapter = ? WHERE id = ? AND (latest_chapter IS NULL OR latest_chapter < ?)",
            [chapterNum, comicId, chapterNum]
        );
        return result.insertId;
    },

    // 12. Xóa chương
    deleteChapter: async (comicId, chapterNum) => {
        await db.query(
            "DELETE FROM chapters WHERE comic_id = ? AND chapter_number = ?",
            [comicId, chapterNum]
        );
    }
};

module.exports = Comic;