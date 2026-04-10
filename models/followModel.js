/* FILE: models/followModel.js */
const db = require('../config/db');

const Follow = {

    // Theo dõi truyện (INSERT hoặc bỏ qua nếu đã theo dõi)
    follow: async (userId, comicId) => {
        const [result] = await db.query(
            `INSERT IGNORE INTO follows (user_id, comic_id) VALUES (?, ?)`,
            [userId, comicId]
        );
        return result.affectedRows > 0; // true = mới theo dõi, false = đã theo dõi rồi
    },

    // Bỏ theo dõi
    unfollow: async (userId, comicId) => {
        const [result] = await db.query(
            `DELETE FROM follows WHERE user_id = ? AND comic_id = ?`,
            [userId, comicId]
        );
        return result.affectedRows > 0;
    },

    // Toggle: nếu đang theo dõi thì bỏ, chưa theo dõi thì theo dõi
    toggle: async (userId, comicId) => {
        const isFollowing = await Follow.isFollowing(userId, comicId);
        if (isFollowing) {
            await Follow.unfollow(userId, comicId);
            return { following: false, message: 'Đã bỏ theo dõi truyện!' };
        } else {
            await Follow.follow(userId, comicId);
            return { following: true, message: 'Đã theo dõi truyện!' };
        }
    },

    // Kiểm tra user có đang theo dõi truyện này không
    isFollowing: async (userId, comicId) => {
        const [rows] = await db.query(
            `SELECT id FROM follows WHERE user_id = ? AND comic_id = ?`,
            [userId, comicId]
        );
        return rows.length > 0;
    },

    // Lấy danh sách truyện đang theo dõi của user (kèm thông tin truyện)
    getByUser: async (userId) => {
        const [rows] = await db.query(
            `SELECT f.id, f.comic_id, f.followed_at,
                    c.title, c.image, c.category, c.author, c.status,
                    c.latest_chapter, c.views
             FROM follows f
             JOIN comics c ON f.comic_id = c.id
             WHERE f.user_id = ?
             ORDER BY f.followed_at DESC`,
            [userId]
        );
        return rows;
    },

    // Đếm số người theo dõi của 1 truyện
    countFollowers: async (comicId) => {
        const [rows] = await db.query(
            `SELECT COUNT(*) as total FROM follows WHERE comic_id = ?`,
            [comicId]
        );
        return rows[0].total;
    },

    // Lấy danh sách user đang theo dõi 1 truyện (cho admin)
    getByComic: async (comicId) => {
        const [rows] = await db.query(
            `SELECT f.id, f.user_id, f.followed_at, u.username, u.email
             FROM follows f
             JOIN users u ON f.user_id = u.id
             WHERE f.comic_id = ?
             ORDER BY f.followed_at DESC`,
            [comicId]
        );
        return rows;
    }
};

module.exports = Follow;