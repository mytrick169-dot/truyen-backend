/* FILE: middleware/authMiddleware.js
 * ======================================================
 * MIDDLEWARE XÁC THỰC TOKEN — chạy TRƯỚC controller
 * ======================================================
 * Vai trò: Kiểm tra token trong header Authorization trước
 * khi cho phép request đi vào controller xử lý.
 *
 * Cách hoạt động:
 *   Frontend gửi header: Authorization: Bearer <token>
 *   → authMiddleware đọc token → tra cứu DB → gắn req.user
 *   → controller nhận req.user để biết ai đang gọi API
 *
 * 3 loại middleware:
 *   - requireLogin  : Bắt buộc đăng nhập (user hoặc admin)
 *   - requireAdmin  : Bắt buộc phải là admin
 *   - optionalLogin : Không bắt buộc (req.user = null nếu chưa đăng nhập)
 *
 * Schema DB liên quan:
 *   - sessions: user_id, token, expires_at  ← token sau mỗi lần login
 *   - users:    có cột token riêng           ← schema cũ, vẫn fallback
 * ======================================================
 */
const db = require('../config/db');

// ─── HÀM NỘI BỘ: tra cứu user từ token ───────────────────────────
/**
 * getUser(token) — tìm user sở hữu token này trong DB
 *
 * Luồng tra cứu (2 bước):
 *   Bước 1: Tìm trong bảng sessions (token mới nhất, có thời hạn)
 *           → JOIN với users để lấy thông tin đầy đủ
 *           → Chỉ lấy session chưa hết hạn (expires_at > NOW())
 *   Bước 2: Nếu không có trong sessions → fallback tìm trực tiếp
 *           trong cột users.token (schema cũ trước khi có sessions)
 *
 * Trả về: object user { id, username, email, role, is_banned, ... }
 *         hoặc null nếu token không hợp lệ / hết hạn
 */
const getUser = async (token) => {
    // Bỏ qua token quá ngắn hoặc rỗng (tránh query DB vô ích)
    if (!token || token.length < 10) return null;

    // ── Bước 1: Tìm trong bảng sessions (ưu tiên — token mới nhất) ──
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.username, u.email, u.role,
                    u.is_banned, u.ban_reason, u.banned_until
             FROM sessions s
             JOIN users u ON s.user_id = u.id
             WHERE s.token = ? AND s.expires_at > NOW()
             LIMIT 1`,
            [token]
        );
        // Nếu tìm thấy trong sessions → trả về ngay, không cần bước 2
        if (rows.length > 0) return rows[0];
    } catch (e) {
        // sessions table có thể chưa tồn tại (chưa chạy Migrate.js) → bỏ qua lỗi
        console.error('[authMiddleware] sessions lookup error:', e.message);
    }

    // ── Bước 2: Fallback — tìm trong cột users.token (schema cũ) ──
    try {
        const [rows2] = await db.query(
            `SELECT id, username, email, role, is_banned, ban_reason, banned_until
             FROM users WHERE token = ? LIMIT 1`,
            [token]
        );
        if (rows2.length > 0) return rows2[0];
    } catch (e) {
        console.error('[authMiddleware] users.token lookup error:', e.message);
    }

    // Token không tìm thấy ở đâu → không xác thực được
    return null;
};

// ─── MIDDLEWARE 1: requireLogin ────────────────────────────────────
/**
 * requireLogin — bắt buộc người dùng phải đăng nhập
 *
 * Luồng xử lý:
 *   1. Đọc token từ header Authorization (bỏ tiền tố "Bearer ")
 *   2. Gọi getUser(token) để tra cứu DB
 *   3. Nếu không có token → 401 "Bạn cần đăng nhập!"
 *   4. Nếu token không hợp lệ/hết hạn → 401 "Phiên hết hạn"
 *   5. Nếu tài khoản bị ban (is_banned=1) → 403 "Tài khoản bị chặn"
 *   6. Nếu tài khoản bị khóa tạm thời (banned_until chưa qua) → 403
 *   7. Hợp lệ → gắn req.user = user và gọi next() để vào controller
 *
 * Sử dụng tại: tất cả route cần đăng nhập (xem truyện, bình luận, theo dõi...)
 */
exports.requireLogin = async (req, res, next) => {
    try {
        // Đọc token từ header, loại bỏ tiền tố "Bearer " nếu có
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

        // Không có token → chưa đăng nhập
        if (!token) {
            return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập!' });
        }

        // Tra cứu user từ token trong DB
        const user = await getUser(token);

        // Token không khớp hoặc đã hết hạn
        if (!user) {
            return res.status(401).json({ success: false, message: 'Phiên đăng nhập hết hạn! Vui lòng đăng nhập lại.' });
        }

        // Tài khoản bị ban vĩnh viễn (is_banned = 1)
        if (user.is_banned) {
            return res.status(403).json({ success: false, message: 'Tài khoản bị chặn: ' + (user.ban_reason || '') });
        }

        // Tài khoản bị khóa tạm thời (banned_until chưa qua ngày hiện tại)
        if (user.banned_until && new Date(user.banned_until) > new Date()) {
            return res.status(403).json({ success: false, message: 'Tài khoản bị khóa tạm thời!' });
        }

        // Tất cả hợp lệ → gắn thông tin user vào request để controller dùng
        req.user = user;
        next(); // Chuyển sang middleware hoặc controller tiếp theo
    } catch (err) {
        console.error('[requireLogin]', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─── MIDDLEWARE 2: requireAdmin ────────────────────────────────────
/**
 * requireAdmin — bắt buộc phải là tài khoản admin
 *
 * Luồng xử lý:
 *   1. Đọc và tra cứu token giống requireLogin
 *   2. Kiểm tra thêm điều kiện user.role === 'admin'
 *   3. Nếu role không phải admin → 403 "Không có quyền Admin"
 *
 * Sử dụng tại: tất cả route /api/admin/* (thêm/sửa/xóa truyện, quản lý user...)
 */
exports.requireAdmin = async (req, res, next) => {
    try {
        // Đọc token từ header Authorization
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

        // Tra cứu user từ token
        const user  = await getUser(token);

        // Token không hợp lệ → chưa đăng nhập
        if (!user) {
            return res.status(401).json({ success: false, message: 'Chưa đăng nhập!' });
        }

        // Đã đăng nhập nhưng không phải admin → từ chối quyền truy cập
        if (user.role !== 'admin') {
            return res.status(403).json({ success: false, message: `Tài khoản "${user.username}" không có quyền Admin!` });
        }

        // Là admin → gắn req.user và cho phép vào controller
        req.user = user;
        next();
    } catch (err) {
        console.error('[requireAdmin]', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─── MIDDLEWARE 3: optionalLogin ───────────────────────────────────
/**
 * optionalLogin — đăng nhập không bắt buộc
 *
 * Luồng xử lý:
 *   - Nếu có token hợp lệ → gắn req.user = user (như requireLogin)
 *   - Nếu không có token hoặc token lỗi → req.user = null (không trả 401)
 *   - Luôn gọi next() để tiếp tục dù có token hay không
 *
 * Sử dụng tại: các route mà user chưa đăng nhập vẫn xem được
 *   (VD: xem trạng thái follow — chưa đăng nhập thì is_following = false)
 */
exports.optionalLogin = async (req, res, next) => {
    try {
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        // Nếu có token thì tra cứu, không có thì đặt null — không throw lỗi
        req.user = token ? await getUser(token) : null;
        next();
    } catch {
        // Lỗi bất kỳ → coi như không đăng nhập, vẫn cho đi tiếp
        req.user = null;
        next();
    }
};
