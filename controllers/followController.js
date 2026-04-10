/* FILE: controllers/followController.js
 * ======================================================
 * CONTROLLER QUẢN LÝ THEO DÕI (FOLLOW)
 * ======================================================
 * Xử lý các thao tác theo dõi / bỏ theo dõi truyện.
 * Controller này dùng Model (followModel.js) thay vì
 * truy vấn DB trực tiếp — khác với comicController.js
 * (comicController query DB trực tiếp cho followComic/unfollow).
 *
 * Luồng request điển hình (người dùng nhấn nút "Theo dõi"):
 *   Frontend → POST /api/comics/:id/follow
 *   → authMiddleware.requireLogin (kiểm tra token, gắn req.user)
 *   → followController.toggleFollow
 *   → followModel.toggle (thực thi SQL)
 *   → trả về { following: true/false, followers: số_lượng }
 *
 * Được gọi từ: routes/comicRoutes.js (nếu dùng controller này)
 * LƯU Ý: comicRoutes.js hiện tại dùng comic.followComic/unfollowComic
 *         (trong comicController), không dùng controller này trực tiếp.
 * ======================================================
 */
const Follow = require('../models/followModel');

/**
 * sendError(res, statusCode, message) — helper trả lỗi chuẩn format
 * Dùng thay vì viết res.status(xxx).json({...}) nhiều lần
 */
const sendError = (res, status, message) => {
    return res.status(status).json({ success: false, message });
};

// ======================================================
// TOGGLE THEO DÕI / BỎ THEO DÕI
// ======================================================
/**
 * toggleFollow — Đổi trạng thái theo dõi (theo dõi ↔ bỏ theo dõi)
 *
 * Luồng:
 *   1. Lấy comicId từ req.params.id (URL)
 *   2. Lấy userId từ req.user.id (token đã được requireLogin xác thực)
 *   3. Gọi Follow.toggle() → kiểm tra đang follow hay chưa:
 *      - Nếu chưa follow → INSERT vào bảng follows
 *      - Nếu đã follow → DELETE khỏi bảng follows
 *   4. Gọi Follow.countFollowers() → đếm lại số lượt follow
 *   5. Trả về trạng thái mới và số lượt follow hiện tại
 *
 * Request:  POST /api/comics/:id/follow  (Authorization: Bearer <token>)
 * Response: { success, message, data: { following: bool, followers: int } }
 */
exports.toggleFollow = async (req, res) => {
    try {
        const comicId = req.params.id;
        const userId  = req.user.id;

        // Toggle trạng thái follow trong DB
        const result = await Follow.toggle(userId, comicId);

        // Đếm lại tổng số người follow truyện này (sau khi toggle)
        const followers = await Follow.countFollowers(comicId);

        res.json({
            success: true,
            message: result.message,   // "Đã theo dõi!" hoặc "Đã bỏ theo dõi"
            data: {
                following: result.following,  // true = đang follow, false = đã bỏ follow
                followers: followers          // tổng số người follow truyện này
            }
        });
    } catch (err) {
        console.error('[toggleFollow]', err.message);
        sendError(res, 500, err.message);
    }
};

// ======================================================
// KIỂM TRA TRẠNG THÁI THEO DÕI
// ======================================================
/**
 * getFollowStatus — Kiểm tra người dùng có đang theo dõi truyện này không
 *
 * Luồng:
 *   1. Lấy comicId từ req.params.id
 *   2. Lấy userId từ req.user (có thể null nếu dùng optionalLogin)
 *   3. Đếm tổng số followers của truyện
 *   4. Nếu chưa đăng nhập (userId = null) → trả following = false
 *   5. Nếu đã đăng nhập → gọi Follow.isFollowing() để kiểm tra
 *   6. Trả về { following: bool, followers: int }
 *
 * Request:  GET /api/comics/:id/follow-status  (Authorization có thể có hoặc không)
 * Response: { success, data: { following: bool, followers: int } }
 */
exports.getFollowStatus = async (req, res) => {
    try {
        const comicId   = req.params.id;
        // req.user có thể null nếu route dùng optionalLogin thay vì requireLogin
        const userId    = req.user ? req.user.id : null;

        // Đếm tổng số người theo dõi truyện này (không phụ thuộc vào userId)
        const followers = await Follow.countFollowers(comicId);

        // Chưa đăng nhập → trả về following = false, không cần query DB thêm
        if (!userId) {
            return res.json({
                success: true,
                data: { following: false, followers }
            });
        }

        // Đã đăng nhập → kiểm tra user này có trong bảng follows không
        const following = await Follow.isFollowing(userId, comicId);
        res.json({
            success: true,
            data: { following, followers }
        });
    } catch (err) {
        console.error('[getFollowStatus]', err.message);
        sendError(res, 500, err.message);
    }
};

// ======================================================
// DANH SÁCH TRUYỆN ĐANG THEO DÕI CỦA USER HIỆN TẠI
// ======================================================
/**
 * getMyFollows — Lấy danh sách tất cả truyện user đang theo dõi
 *
 * Luồng:
 *   1. Lấy userId từ req.user.id
 *   2. Gọi Follow.getByUser(userId) → query bảng follows + JOIN comics
 *   3. Trả về mảng truyện kèm thông tin chi tiết (tên, ảnh, thể loại, chương mới nhất)
 *
 * Request:  GET /api/user/follows  (Authorization: Bearer <token>)
 * Response: { success, count, data: [...comics] }
 */
exports.getMyFollows = async (req, res) => {
    try {
        const userId = req.user.id;

        // Lấy danh sách truyện đang follow kèm thông tin chi tiết từ bảng comics
        const data   = await Follow.getByUser(userId);

        res.json({
            success: true,
            count: data.length,
            data
        });
    } catch (err) {
        console.error('[getMyFollows]', err.message);
        sendError(res, 500, err.message);
    }
};

// ======================================================
// ADMIN — DANH SÁCH NGƯỜI THEO DÕI 1 TRUYỆN
// ======================================================
/**
 * getComicFollowers — Lấy danh sách tất cả user đang theo dõi 1 truyện cụ thể
 *
 * Luồng:
 *   1. Lấy comicId từ req.params.id
 *   2. Gọi Follow.getByComic(comicId) → query bảng follows + JOIN users
 *   3. Đếm tổng số followers qua Follow.countFollowers()
 *   4. Trả về { total, data: [...users] }
 *
 * Request:  GET /api/admin/comics/:id/followers  (Authorization: Bearer admin token)
 * Response: { success, total, data: [...users đang follow] }
 * Dùng cho: Admin xem ai đang theo dõi truyện X
 */
exports.getComicFollowers = async (req, res) => {
    try {
        // Lấy danh sách user đang follow truyện này
        const data = await Follow.getByComic(req.params.id);

        // Đếm tổng số followers (số chính xác từ DB, không dùng data.length)
        const total = await Follow.countFollowers(req.params.id);

        res.json({
            success: true,
            total,
            data
        });
    } catch (err) {
        console.error('[getComicFollowers]', err.message);
        sendError(res, 500, err.message);
    }
};
