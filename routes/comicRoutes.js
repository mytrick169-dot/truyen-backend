/* FILE: routes/comicRoutes.js
 * ======================================================
 * ĐỊNH TUYẾN TRUYỆN, CHƯƠNG, BÌNH LUẬN, THEO DÕI
 * ======================================================
 * Mount tại: app.use('/api', comicRoutes)  ← trong server.js
 * URL thực tế: /api/comics/..., /api/admin/comics/... (fallback)
 *
 * QUAN TRỌNG: File này mount SAU CÙNG trong server.js
 * vì nó xử lý /api/* (tổng quát nhất).
 * → /api/auth/* và /api/admin/* phải mount TRƯỚC file này.
 *
 * Cấu trúc middleware chain của mỗi route:
 *   router.METHOD('/path', [requireLogin|requireAdmin], controller)
 *
 * Luồng request khi người dùng tìm kiếm truyện:
 *   Frontend gọi GET /api/comics?search=naruto
 *   → server.js → comicRoutes.js
 *   → router.get('/comics', comic.getComics)
 *   → comicController.getComics (lọc dữ liệu, tìm kiếm)
 *   → trả JSON danh sách truyện
 *
 * Luồng request khi người dùng đọc 1 chương:
 *   GET /api/comics/:id/chapters/:chapterNum/images
 *   → requireLogin (kiểm tra token)
 *   → upload.getChapterImages (query DB lấy mảng URL ảnh)
 *   → trả JSON mảng URL ảnh
 * ======================================================
 */
const express = require('express');
const router  = express.Router();
const comic   = require('../controllers/comicController');
const upload  = require('../controllers/uploadController');
const { requireLogin, requireAdmin } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   - name: 📚 Truyện
 *     description: Xem danh sách, tìm kiếm theo tên/ID, lọc thể loại, top truyện
 *   - name: 📖 Chương & Ảnh
 *     description: Xem danh sách chương và ảnh trang truyện
 *   - name: 💬 Bình luận
 *     description: Bình luận, phản hồi, xóa bình luận (tên tự động từ token)
 *   - name: ❤️ Theo dõi
 *     description: Theo dõi / bỏ theo dõi truyện
 *   - name: 🔧 Admin - Truyện
 *     description: Thêm / sửa / xóa truyện, upload ảnh bìa
 *   - name: 🔧 Admin - Chương
 *     description: Thêm / xóa chương, upload ảnh trang từ máy tính
 */

// ============================================================
// 📚 TRUYỆN — Xem & tìm kiếm
// ============================================================

/**
 * @swagger
 * /api/comics:
 *   get:
 *     summary: Danh sách truyện — tìm kiếm theo tên/ID, lọc thể loại, lọc trạng thái
 *     tags: [📚 Truyện]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         example: "One Piece"
 *         description: "Tìm theo tên truyện"
 *       - in: query
 *         name: id
 *         schema: { type: integer }
 *         example: 10
 *         description: "Tìm chính xác theo ID truyện"
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *         example: "Manga"
 *         description: "Lọc thể loại: Manga / Manhwa / Manhua / Action / Romance / Fantasy..."
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: ["Đang tiến hành", "Đã hoàn thành"] }
 *         description: "Lọc theo trạng thái hoàn thành"
 *     responses:
 *       200:
 *         description: Danh sách truyện phù hợp
 *       401:
 *         description: Chưa đăng nhập — cần token
 */
// Luồng tìm kiếm: request → comic.getComics
//   → query DB với các điều kiện WHERE (category, status, id)
//   → lọc tiếp bằng JS theo search (bỏ dấu tiếng Việt)
//   → trả danh sách truyện
// Không cần requireLogin (route này mở để cả guest xem được)
router.get('/comics', comic.getComics);

/**
 * @swagger
 * /api/comics/top-followed:
 *   get:
 *     summary: Top truyện được theo dõi nhiều nhất
 *     tags: [📚 Truyện]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: "Số lượng (mặc định 10, tối đa 50)"
 *     responses:
 *       200:
 *         description: Top truyện theo dõi
 *       401:
 *         description: Chưa đăng nhập
 */
// QUAN TRỌNG: Route /comics/top-followed phải đặt TRƯỚC /comics/:id
// Nếu đặt sau, Express sẽ hiểu "top-followed" là giá trị của :id → 404
// Luồng: request → requireLogin → comic.getTopFollowed (JOIN comics+follows, GROUP BY, ORDER BY)
router.get('/comics/top-followed', requireLogin, comic.getTopFollowed);


/**
 * @swagger
 * /api/comics/{id}:
 *   get:
 *     summary: Chi tiết 1 truyện (kèm số người theo dõi, điểm đánh giá)
 *     tags: [📚 Truyện]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Thông tin chi tiết truyện
 *       401:
 *         description: Chưa đăng nhập
 *       404:
 *         description: Không tìm thấy truyện
 */

/**
 * @swagger
 * /api/comics/{id}/view:
 *   post:
 *     summary: Tăng lượt xem truyện (gọi mỗi khi mở trang chi tiết)
 *     tags: [📚 Truyện]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đã tăng lượt xem
 */
// Luồng: request → requireLogin → comic.addView (UPDATE comics SET views=views+1 WHERE id=?)
// Được gọi bởi frontend mỗi khi user mở trang đọc truyện
router.post('/comics/:id/view', requireLogin, comic.addView);

// Luồng: request → requireLogin → comic.getComicDetail (SELECT + đếm followers)
router.get('/comics/:id', requireLogin, comic.getComicDetail);

// ============================================================
// 📖 CHƯƠNG & ẢNH
// ============================================================

/**
 * @swagger
 * /api/comics/{id}/chapters:
 *   get:
 *     summary: Danh sách tất cả chương của truyện (sắp xếp giảm dần)
 *     tags: [📖 Chương & Ảnh]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Danh sách chương
 *       401:
 *         description: Chưa đăng nhập
 */
// Luồng: request → requireLogin → comic.getChapters (SELECT chapters WHERE comic_id=?)
router.get('/comics/:id/chapters', requireLogin, comic.getChapters);

/**
 * @swagger
 * /api/comics/{id}/chapters/{chapterNum}/images:
 *   get:
 *     summary: Lấy danh sách URL ảnh trang của 1 chương để đọc
 *     tags: [📖 Chương & Ảnh]
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
 *         description: "Mảng URL ảnh theo thứ tự trang"
 *       401:
 *         description: Chưa đăng nhập
 */
// Luồng: request → requireLogin → upload.getChapterImages
//   → query cột content trong bảng chapters
//   → parse JSON → trả mảng URL ảnh
// Frontend nhận mảng URL và render từng ảnh = từng trang truyện
router.get('/comics/:id/chapters/:chapterNum/images', requireLogin, upload.getChapterImages);

// ============================================================
// 💬 BÌNH LUẬN
// ============================================================

/**
 * @swagger
 * /api/comics/{id}/comments:
 *   get:
 *     summary: Xem tất cả bình luận của truyện (kèm replies lồng nhau)
 *     tags: [💬 Bình luận]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Danh sách bình luận
 *       401:
 *         description: Chưa đăng nhập
 */
// Luồng: request → requireLogin → comic.getComments
//   → lấy bình luận gốc (parent_id = null) rồi lồng replies vào từng comment
router.get('/comics/:id/comments', requireLogin, comic.getComments);

/**
 * @swagger
 * /api/comics/{id}/comments:
 *   post:
 *     summary: Đăng bình luận — tên tự động lấy từ tài khoản đăng nhập
 *     description: |
 *       Chỉ cần ID truyện (path) và nội dung bình luận.
 *       Tên hiển thị **tự động** là tên tài khoản đang đăng nhập — không cần gửi thêm.
 *       Để phản hồi 1 bình luận, thêm `parentId`.
 *     tags: [💬 Bình luận]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID truyện
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 example: "Truyện này hay quá, chờ chương tiếp!"
 *               parentId:
 *                 type: integer
 *                 nullable: true
 *                 example: null
 *                 description: "ID bình luận cha để reply. Bỏ trống = bình luận mới."
 *     responses:
 *       200:
 *         description: "Bình luận thành công, tên = tên tài khoản đang đăng nhập"
 *       401:
 *         description: Chưa đăng nhập
 */
// Luồng: request → requireLogin → comic.postComment
//   → username tự động lấy từ req.user.username (không cần gửi trong body)
//   → INSERT INTO comments (comic_id, user_name, content, parent_id)
router.post('/comics/:id/comments', requireLogin, comic.postComment);

/**
 * @swagger
 * /api/comics/{id}/comments/{cid}:
 *   delete:
 *     summary: Xóa bình luận của chính mình
 *     tags: [💬 Bình luận]
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
 *         description: ID bình luận
 *     responses:
 *       200:
 *         description: Đã xóa
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền — bình luận này không phải của bạn
 */
// Luồng: request → requireLogin → comic.deleteComment
//   → kiểm tra comment.user_name === req.user.username (chỉ xóa bình luận của mình)
//   → DELETE replies trước → DELETE comment cha
router.delete('/comics/:id/comments/:cid', requireLogin, comic.deleteComment);

// ============================================================
// ❤️ THEO DÕI
// ============================================================

/**
 * @swagger
 * /api/comics/{id}/follow:
 *   post:
 *     summary: Theo dõi truyện (lưu vào tài khoản đang đăng nhập)
 *     tags: [❤️ Theo dõi]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đã theo dõi
 *       401:
 *         description: Chưa đăng nhập
 */
// Luồng: request → requireLogin → comic.followComic
//   → kiểm tra chưa follow → INSERT follows → UPDATE comics.followers_count+1
router.post('/comics/:id/follow', requireLogin, comic.followComic);

/**
 * @swagger
 * /api/comics/{id}/follow:
 *   delete:
 *     summary: Bỏ theo dõi truyện
 *     tags: [❤️ Theo dõi]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đã bỏ theo dõi
 *       401:
 *         description: Chưa đăng nhập
 */
// Luồng: request → requireLogin → comic.unfollowComic
//   → DELETE follows → UPDATE comics.followers_count-1 (GREATEST để không âm)
router.delete('/comics/:id/follow', requireLogin, comic.unfollowComic);

/**
 * @swagger
 * /api/comics/{id}/follow-status:
 *   get:
 *     summary: Kiểm tra bạn có đang theo dõi truyện này không
 *     tags: [❤️ Theo dõi]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: "{ is_following: bool, followers_count: int }"
 *       401:
 *         description: Chưa đăng nhập
 */
// Luồng: request → requireLogin → comic.getFollowStatus
//   → đếm followers + kiểm tra user có trong follows không
//   → trả { is_following, followers_count }
router.get('/comics/:id/follow-status', requireLogin, comic.getFollowStatus);


// ============================================================
// 🔧 ADMIN — QUẢN LÝ TRUYỆN (fallback nếu adminRoutes.js không load được)
// ============================================================
// Các route dưới đây trùng với adminRoutes.js nhưng có prefix /admin/
// trong URL tại đây là /api/admin/... (vì mount tại /api)
// Nếu adminRoutes.js đã load thành công trong server.js → các route này không được gọi

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
// Luồng: request → requireAdmin (kiểm tra role=admin) → comic.addComic (INSERT INTO comics)
router.post('/admin/comics', requireAdmin, comic.addComic);

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
 *               image:       { type: string, description: "URL ảnh bìa (link ngoài hoặc dùng /cover để upload)" }
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
//   → lấy giá trị cũ từ DB → merge với giá trị mới → UPDATE
router.put('/admin/comics/:id', requireAdmin, comic.updateComic);

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
//   → xóa ratings, follows, comments, chapters, history → xóa comics (theo thứ tự tránh lỗi FK)
router.delete('/admin/comics/:id', requireAdmin, comic.deleteComic);

/**
 * @swagger
 * /api/admin/comics/{id}/cover:
 *   post:
 *     summary: "[ADMIN] Upload ảnh bìa/logo truyện từ máy tính (tự động cập nhật DB)"
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
 *         description: "Upload thành công, URL ảnh bìa đã được cập nhật vào DB"
 *       400:
 *         description: Không có file hoặc sai định dạng
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request (form-data) → requireAdmin → coverMiddleware (Multer lưu file /uploads/covers/)
//   → upload.uploadComicCover (UPDATE comics SET image=url WHERE id=?)
router.post('/admin/comics/:id/cover', requireAdmin, upload.coverMiddleware, upload.uploadComicCover);

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
//   → DELETE replies → DELETE comment (không kiểm tra chủ sở hữu — admin xóa được hết)
router.delete('/admin/comics/:id/comments/:cid', requireAdmin, comic.adminDeleteComment);

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
 *                 description: "JSON array dạng chuỗi, mỗi phần tử là URL ảnh 1 trang. Bỏ trống nếu chưa có ảnh."
 *     responses:
 *       200:
 *         description: Thêm chương thành công
 *       400:
 *         description: Thiếu số chương
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request → requireAdmin → comic.addChapter
//   → INSERT INTO chapters → UPDATE comics.latest_chapter nếu cần
router.post('/admin/comics/:id/chapters', requireAdmin, comic.addChapter);

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
 *         description: "Upload thành công, trả về danh sách URL ảnh đã lưu"
 *       400:
 *         description: Không có ảnh nào
 *       403:
 *         description: Không phải Admin
 */
// Luồng: request (form-data, field "images") → requireAdmin
//   → uploadMiddleware (Multer lưu file vào /uploads/chapters/{id}/{chapterNum}/)
//   → upload.uploadChapterImages (serialize URL → UPDATE/INSERT chapters)
router.post('/admin/comics/:id/chapters/:chapterNum/upload', requireAdmin, upload.uploadMiddleware, upload.uploadChapterImages);

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
router.delete('/admin/comics/:id/chapters/:chapterNum', requireAdmin, comic.deleteChapter);

module.exports = router;
