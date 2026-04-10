/* FILE: routes/adminRoutes.js
 * ======================================================
 * ĐỊNH TUYẾN QUẢN TRỊ (ADMIN ONLY)
 * ======================================================
 * Mount tại: app.use('/api/admin', adminRoutes)  ← trong server.js
 * URL thực tế: /api/admin/stats, /api/admin/users, /api/admin/comics ...
 *
 * TẤT CẢ route trong file này đều yêu cầu requireAdmin:
 *   → Token phải hợp lệ VÀ role của user phải là 'admin'
 *   → User thường (role='user') sẽ nhận lỗi 403
 *
 * File này tách biệt hoàn toàn với authRoutes.js và comicRoutes.js
 * để đảm bảo URL khớp đúng với Swagger docs.
 *
 * Luồng request admin điển hình (VD: xem danh sách user):
 *   Admin gọi GET /api/admin/users  với header Authorization: Bearer <admin_token>
 *   → server.js → adminRoutes.js
 *   → requireAdmin (kiểm tra token + role=admin)
 *   → auth.getAllUsers (query users DB + đếm hoạt động)
 *   → trả JSON danh sách users
 * ======================================================
 */
const express  = require('express');
const router   = express.Router();
const auth     = require('../controllers/authController');
const comic    = require('../controllers/comicController');
const upload   = require('../controllers/uploadController');
const { requireAdmin } = require('../middleware/authMiddleware');

// ============================================================
// 🔧 ADMIN — THỐNG KÊ & QUẢN LÝ TÀI KHOẢN
// ============================================================

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: "[ADMIN] Thống kê tổng quan hệ thống"
 *     tags: [🔧 Admin - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Thống kê tổng hợp
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 totalUsers: 120
 *                 totalComics: 26
 *                 totalChapters: 1540
 *                 totalComments: 380
 *                 totalFollows: 650
 *                 totalRatings: 210
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request → requireAdmin → auth.getSystemStats
//   → 8 query đếm chạy song song (Promise.all) → trả object thống kê
router.get('/stats', requireAdmin, auth.getSystemStats);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: "[ADMIN] Danh sách tất cả tài khoản user"
 *     tags: [🔧 Admin - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách user kèm số liệu tổng hợp
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               total: 25
 *               data:
 *                 - id: 2
 *                   username: nguyenvana
 *                   email: vana@email.com
 *                   role: user
 *                   is_banned: 0
 *                   comment_count: 12
 *                   follow_count: 8
 *                   rating_count: 5
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request → requireAdmin → auth.getAllUsers
//   → query tất cả users + đếm số comment/follow/rating/history cho mỗi user
router.get('/users', requireAdmin, auth.getAllUsers);

/**
 * @swagger
 * /api/admin/users/{username}:
 *   get:
 *     summary: "[ADMIN] Xem toàn bộ thông tin chi tiết 1 user"
 *     description: "Trả về thông tin user kèm: theo dõi, lịch sử đọc, bình luận, đánh giá"
 *     tags: [🔧 Admin - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema: { type: string }
 *         example: nguyenvana
 *     responses:
 *       200:
 *         description: Chi tiết user đầy đủ
 *       403:
 *         description: Không phải Admin
 *       404:
 *         description: Không tìm thấy user
 */
// Luồng: request → requireAdmin → auth.getUserDetail
//   → query profile + Promise.all(comments, history, ratings) + query follows
//   → trả { profile, stats, comments, follows, history, ratings }
router.get('/users/:username', requireAdmin, auth.getUserDetail);

/**
 * @swagger
 * /api/admin/users/{username}/block:
 *   post:
 *     summary: "[ADMIN] Block tài khoản user (theo username)"
 *     tags: [🔧 Admin - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema: { type: string }
 *         example: nguyenvana
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Vi phạm nội quy — spam bình luận"
 *               days:
 *                 type: integer
 *                 example: 7
 *                 description: "Số ngày block. 0 = block vĩnh viễn."
 *     responses:
 *       200:
 *         description: Block thành công
 *       403:
 *         description: Không phải Admin / Không thể block Admin
 *       404:
 *         description: Không tìm thấy user
 */
// Luồng: request → requireAdmin → auth.blockUserByUsername
//   → tìm user theo username → kiểm tra không phải admin
//   → tính banned_until → UPDATE users SET is_banned=1, ban_reason, banned_until
router.post('/users/:username/block', requireAdmin, auth.blockUserByUsername);

/**
 * @swagger
 * /api/admin/users/{username}/unblock:
 *   post:
 *     summary: "[ADMIN] Mở block tài khoản user (theo username)"
 *     tags: [🔧 Admin - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema: { type: string }
 *         example: nguyenvana
 *     responses:
 *       200:
 *         description: Đã mở block
 *       403:
 *         description: Không phải Admin
 *       404:
 *         description: Không tìm thấy user
 */
// Luồng: request → requireAdmin → auth.unblockUserByUsername
//   → UPDATE users SET is_banned=0, ban_reason=NULL, banned_until=NULL WHERE username=?
router.post('/users/:username/unblock', requireAdmin, auth.unblockUserByUsername);

/**
 * @swagger
 * /api/admin/users/{username}/comments:
 *   get:
 *     summary: "[ADMIN] Xem tất cả bình luận của 1 user"
 *     tags: [🔧 Admin - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách bình luận
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request → requireAdmin → auth.getUserComments
//   → SELECT comments + JOIN comics WHERE user_name=:username
router.get('/users/:username/comments', requireAdmin, auth.getUserComments);

/**
 * @swagger
 * /api/admin/users/{username}/follows:
 *   get:
 *     summary: "[ADMIN] Xem danh sách theo dõi của 1 user"
 *     tags: [🔧 Admin - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách truyện đang theo dõi
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request → requireAdmin → auth.getUserFollows
//   → tìm userId từ username → SELECT follows + JOIN comics WHERE user_id=?
router.get('/users/:username/follows', requireAdmin, auth.getUserFollows);

/**
 * @swagger
 * /api/admin/users/{username}/history:
 *   get:
 *     summary: "[ADMIN] Xem lịch sử đọc của 1 user"
 *     tags: [🔧 Admin - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lịch sử đọc truyện
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request → requireAdmin → auth.getUserHistory
//   → SELECT history + JOIN comics WHERE user_name=:username
// LƯU Ý: hàm getUserHistory có bug "ssuccess" và biến "row" chưa khai báo → cần fix trong authController.js
router.get('/users/:username/history', requireAdmin, auth.getUserHistory);

/**
 * @swagger
 * /api/admin/users/{username}/ratings:
 *   get:
 *     summary: "[ADMIN] Xem tất cả đánh giá của 1 user"
 *     tags: [🔧 Admin - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách đánh giá
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request → requireAdmin → auth.getUserRatings
//   → SELECT ratings + JOIN comics WHERE user_name=:username
router.get('/users/:username/ratings', requireAdmin, auth.getUserRatings);

// ============================================================
// 🔧 ADMIN — QUẢN LÝ TRUYỆN
// ============================================================

/**
 * @swagger
 * /api/admin/comics:
 *   post:
 *     summary: "[ADMIN] Thêm truyện mới"
 *     tags: [🔧 Admin - Truyện]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:       { type: string, example: "Tên truyện mới" }
 *               category:    { type: string, example: "Manhwa" }
 *               author:      { type: string, example: "Tên tác giả" }
 *               description: { type: string, example: "Mô tả truyện..." }
 *               image:       { type: string, example: "https://example.com/anh-bia.jpg" }
 *               status:      { type: string, enum: ["Đang tiến hành","Đã hoàn thành"], example: "Đang tiến hành" }
 *     responses:
 *       200:
 *         description: Thêm thành công, trả về ID truyện mới
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request → requireAdmin → comic.addComic (INSERT INTO comics, trả insertId)
router.post('/comics', requireAdmin, comic.addComic);

/**
 * @swagger
 * /api/admin/comics/{id}:
 *   put:
 *     summary: "[ADMIN] Sửa thông tin truyện (bất kỳ trường nào)"
 *     tags: [🔧 Admin - Truyện]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:       { type: string }
 *               category:    { type: string }
 *               author:      { type: string }
 *               description: { type: string }
 *               image:       { type: string }
 *               status:      { type: string, enum: ["Đang tiến hành","Đã hoàn thành"] }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       403:
 *         description: Không phải Admin
 *       404:
 *         description: Không tìm thấy truyện
 */
// Luồng: request → requireAdmin → comic.updateComic
//   → lấy truyện cũ từ DB → merge giá trị (fallback về cũ nếu field không gửi)
//   → UPDATE comics SET ... WHERE id=?
router.put('/comics/:id', requireAdmin, comic.updateComic);

/**
 * @swagger
 * /api/admin/comics/{id}:
 *   delete:
 *     summary: "[ADMIN] Xóa truyện và toàn bộ dữ liệu liên quan"
 *     tags: [🔧 Admin - Truyện]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đã xóa truyện
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request → requireAdmin → comic.deleteComic
//   → xóa theo thứ tự: ratings → follows → comments → chapters → history → comics
//   (xóa bảng liên quan trước, comic chính xóa sau cùng)
router.delete('/comics/:id', requireAdmin, comic.deleteComic);

/**
 * @swagger
 * /api/admin/comics/{id}/cover:
 *   post:
 *     summary: "[ADMIN] Upload ảnh bìa truyện từ máy tính"
 *     tags: [🔧 Admin - Truyện]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [cover]
 *             properties:
 *               cover:
 *                 type: string
 *                 format: binary
 *                 description: "File ảnh bìa JPG/PNG/WEBP, tối đa 5MB"
 *     responses:
 *       200:
 *         description: Upload thành công
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request (multipart/form-data, field "cover")
//   → requireAdmin → coverMiddleware (Multer lưu file vào /uploads/covers/)
//   → upload.uploadComicCover (UPDATE comics SET image=url WHERE id=?)
router.post('/comics/:id/cover', requireAdmin, upload.coverMiddleware, upload.uploadComicCover);

/**
 * @swagger
 * /api/admin/comics/{id}/comments/{cid}:
 *   delete:
 *     summary: "[ADMIN] Xóa bất kỳ bình luận nào"
 *     tags: [🔧 Admin - Truyện]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: cid
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đã xóa bình luận
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request → requireAdmin → comic.adminDeleteComment
//   → DELETE replies (parent_id=cid) → DELETE comment (id=cid)
//   → Không kiểm tra chủ sở hữu — admin có quyền xóa bình luận của bất kỳ ai
router.delete('/comics/:id/comments/:cid', requireAdmin, comic.adminDeleteComment);

// ============================================================
// 🔧 ADMIN — QUẢN LÝ CHƯƠNG
// ============================================================

/**
 * @swagger
 * /api/admin/comics/{id}/chapters:
 *   post:
 *     summary: "[ADMIN] Thêm chương mới bằng danh sách link ảnh"
 *     tags: [🔧 Admin - Chương]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [chapterNumber]
 *             properties:
 *               chapterNumber:
 *                 type: integer
 *                 example: 101
 *               content:
 *                 type: string
 *                 example: '["https://cdn.example.com/p1.jpg","https://cdn.example.com/p2.jpg"]'
 *     responses:
 *       200:
 *         description: Thêm chương thành công
 *       400:
 *         description: Thiếu số chương
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request → requireAdmin → comic.addChapter
//   → INSERT INTO chapters (comic_id, chapter_number, content)
//   → UPDATE comics.latest_chapter nếu chapter này lớn hơn chapter hiện tại
router.post('/comics/:id/chapters', requireAdmin, comic.addChapter);

/**
 * @swagger
 * /api/admin/comics/{id}/chapters/{chapterNum}/upload:
 *   post:
 *     summary: "[ADMIN] Upload ảnh trang truyện từ máy tính (tối đa 100 ảnh)"
 *     tags: [🔧 Admin - Chương]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: chapterNum
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [images]
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: "Các file ảnh JPG/PNG/WEBP (tối đa 100 ảnh, mỗi ảnh ≤ 5MB)"
 *     responses:
 *       200:
 *         description: Upload thành công
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request (multipart/form-data, field "images", tối đa 100 file)
//   → requireAdmin → uploadMiddleware (Multer lưu vào /uploads/chapters/{id}/{chapterNum}/)
//   → upload.uploadChapterImages (sort file, tạo URL array, INSERT/UPDATE chapters)
router.post('/comics/:id/chapters/:chapterNum/upload', requireAdmin, upload.uploadMiddleware, upload.uploadChapterImages);

/**
 * @swagger
 * /api/admin/comics/{id}/chapters/{chapterNum}:
 *   delete:
 *     summary: "[ADMIN] Xóa 1 chương"
 *     tags: [🔧 Admin - Chương]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: chapterNum
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đã xóa chương
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request → requireAdmin → comic.deleteChapter
//   → DELETE FROM chapters WHERE comic_id=? AND chapter_number=?
router.delete('/comics/:id/chapters/:chapterNum', requireAdmin, comic.deleteChapter);

module.exports = router;
