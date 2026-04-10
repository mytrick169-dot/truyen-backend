/* FILE: routes/authRoutes.js
 * ======================================================
 * ĐỊNH TUYẾN XÁC THỰC & TÀI KHOẢN
 * ======================================================
 * Mount tại: app.use('/api/auth', authRoutes)  ← trong server.js
 * URL thực tế: /api/auth/register, /api/auth/login, ...
 *
 * Mỗi route định nghĩa theo dạng:
 *   router.METHOD('/path', [middleware1, middleware2, ...], controller)
 *
 * Middleware chains theo thứ tự:
 *   - route công khai: không cần middleware xác thực
 *   - route riêng tư: requireLogin → controller
 *   - route upload:   requireLogin → uploadMiddleware (Multer) → controller
 *
 * Luồng request điển hình cho route cần auth:
 *   Client gửi request với header Authorization: Bearer <token>
 *   → authRoutes.js khớp URL
 *   → requireLogin kiểm tra token (→ gắn req.user)
 *   → controller xử lý logic
 *   → trả JSON response
 * ======================================================
 */
const express = require('express');
const router  = express.Router();
const auth    = require('../controllers/authController');
const { requireLogin } = require('../middleware/authMiddleware');
const upload  = require('../controllers/uploadController');

// ============================================================
// 🟢 AUTH — Không cần token (public routes)
// ============================================================

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Đăng ký tài khoản mới
 *     tags: [🟢 Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: nguyenvana
 *               email:
 *                 type: string
 *                 example: vana@email.com
 *               password:
 *                 type: string
 *                 example: matkhau123
 *     responses:
 *       200:
 *         description: Đăng ký thành công
 *       400:
 *         description: Thiếu thông tin / đã tồn tại
 */
// Luồng: request → auth.register (kiểm tra trùng, hash pass, tạo token, trả token)
router.post('/register', auth.register);

// ─── Quên mật khẩu (3 bước: gửi OTP → xác thực OTP → đặt lại mật khẩu) ─────
// Bước 1: Người dùng nhập email → server sinh OTP → log ra console
router.post('/forgot/send-otp',  auth.sendOTP);
// Bước 2: Người dùng nhập OTP nhận được → server xác thực → trả resetToken
router.post('/forgot/verify-otp', auth.verifyOTP);
// Bước 3: Người dùng nhập mật khẩu mới + resetToken → server đổi mật khẩu
router.post('/forgot/reset',      auth.resetPassword);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập (user hoặc admin)
 *     tags: [🟢 Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password]
 *             properties:
 *               identifier:
 *                 type: string
 *                 example: admin
 *               password:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *       401:
 *         description: Sai tài khoản hoặc mật khẩu
 *       403:
 *         description: Tài khoản bị khóa
 */
// Luồng: request → auth.login (tìm user, so sánh hash pass, tạo token mới, trả token)
// Token trả về → frontend lưu vào localStorage → gửi kèm mọi request sau
router.post('/login', auth.login);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Quên mật khẩu — gửi OTP về email
 *     tags: [🟢 Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@email.com
 *     responses:
 *       200:
 *         description: Gửi OTP thành công
 *       404:
 *         description: Email không tồn tại
 */
// Luồng: request → auth.forgotPassword (tìm user, tạo OTP, lưu sessions DB, gửi email)
router.post('/forgot-password', auth.forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Đặt lại mật khẩu bằng OTP
 *     tags: [🟢 Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, newPassword]
 *             properties:
 *               email:       { type: string }
 *               otp:         { type: string }
 *               newPassword: { type: string }
 *     responses:
 *       200:
 *         description: Đặt lại mật khẩu thành công
 *       400:
 *         description: OTP sai hoặc hết hạn
 */
// Luồng: request → auth.resetPassword (xác minh OTP từ sessions DB, hash pass mới, UPDATE DB)
router.post('/reset-password', auth.resetPassword);

// ============================================================
// 👤 USER — Cần token (protected routes)
// ============================================================

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Xem thông tin tài khoản đang đăng nhập
 *     tags: [👤 User - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin tài khoản
 *       401:
 *         description: Chưa đăng nhập / token hết hạn
 */
// Luồng: request → requireLogin (kiểm tra token, gắn req.user) → auth.getMe (query DB, trả profile)
router.get('/me', requireLogin, auth.getMe);

/**
 * @swagger
 * /api/auth/history:
 *   get:
 *     summary: Xem lịch sử đọc truyện
 *     tags: [👤 User - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách truyện đã đọc
 *       401:
 *         description: Chưa đăng nhập
 */
// Luồng: request → requireLogin → auth.getMyHistory (JOIN history+comics theo username)
router.get('/history', requireLogin, auth.getMyHistory);

/**
 * @swagger
 * /api/auth/history:
 *   post:
 *     summary: Lưu lịch sử đọc chương
 *     tags: [👤 User - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [comicId, chapter]
 *             properties:
 *               comicId:
 *                 type: integer
 *                 example: 10
 *               chapter:
 *                 type: integer
 *                 example: 150
 *     responses:
 *       200:
 *         description: Đã lưu lịch sử
 *       401:
 *         description: Chưa đăng nhập
 */
// Luồng: request → requireLogin → auth.saveHistory (INSERT OR UPDATE history table)
// Gọi mỗi khi user mở đọc 1 chương (frontend tự gọi)
router.post('/history', requireLogin, auth.saveHistory);

/**
 * @swagger
 * /api/auth/follows:
 *   get:
 *     summary: Xem danh sách truyện đang theo dõi
 *     tags: [👤 User - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách truyện theo dõi
 *       401:
 *         description: Chưa đăng nhập
 */
// Luồng: request → requireLogin → auth.getMyFollows (JOIN follows+comics theo userId)
router.get('/follows', requireLogin, auth.getMyFollows);

// Cập nhật thông tin profile (email, password, phone, fullname, birthday)
// Luồng: request → requireLogin → auth.updateProfile (UPDATE users SET ... WHERE id=req.user.id)
router.put('/profile', requireLogin, auth.updateProfile);

/**
 * @swagger
 * /api/auth/avatar:
 *   post:
 *     summary: Cập nhật avatar tài khoản
 *     tags: [👤 User - Tài khoản]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Cập nhật avatar thành công
 */
// Luồng: request (form-data) → requireLogin → uploadAvatarMiddleware (Multer lưu file)
//        → upload.uploadAvatar (UPDATE users SET avatar=url WHERE id=req.user.id)
router.post('/avatar', requireLogin, upload.uploadAvatarMiddleware, upload.uploadAvatar);

module.exports = router;
