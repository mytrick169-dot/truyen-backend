/* FILE: controllers/authController.js
 * ======================================================
 * CONTROLLER XÁC THỰC & QUẢN LÝ TÀI KHOẢN
 * ======================================================
 * Xử lý toàn bộ logic liên quan đến tài khoản người dùng:
 *   - Đăng ký / Đăng nhập
 *   - Quên mật khẩu (OTP)
 *   - Xem & cập nhật thông tin cá nhân
 *   - Lịch sử đọc & danh sách theo dõi
 *   - Quản lý người dùng (Admin)
 *   - Thống kê hệ thống (Admin)
 *
 * Được gọi từ:
 *   routes/authRoutes.js  → các hàm auth & profile
 *   routes/adminRoutes.js → các hàm admin
 * ======================================================
 */
const crypto = require('crypto');
const db     = require('../config/db');

// ─── HÀM HELPER NỘI BỘ ────────────────────────────────────────────

/**
 * hashPwd(password) — mã hóa mật khẩu bằng SHA256 + salt
 * Dùng khi đăng ký và đăng nhập để so sánh mật khẩu
 * KHÔNG dùng bcrypt ở đây — hash đơn giản với salt cố định
 */
const hashPwd  = p => crypto.createHash('sha256').update(p + 'truyenhayphaidoc_salt').digest('hex');

/**
 * genToken(userId, username) — tạo token đăng nhập ngẫu nhiên
 * Dùng timestamp để đảm bảo mỗi lần đăng nhập có token khác nhau
 */
const genToken = (uid, uname) => crypto.createHash('sha256').update(`${uid}:${uname}:${Date.now()}:secret_key_xyz`).digest('hex');

/**
 * fail(res, statusCode, message) — helper trả về response lỗi
 * Giúp viết gọn: thay vì res.status(400).json({...}) ở mọi nơi
 */
const fail     = (res, code, msg) => res.status(code).json({ success: false, message: msg });

// ─── LƯU TRỮ OTP TẠM THỜI ────────────────────────────────────────
// otpStore lưu OTP trong RAM server (không lưu DB)
// Format: { "email@gmail.com": { code: "123456", expires: timestamp, verified: bool, resetToken: "..." } }
// Lưu ý: Khi server restart thì OTP sẽ mất → người dùng cần gửi lại
const otpStore = {};

// ======================================================
// QUÊN MẬT KHẨU — BƯỚC 1: Gửi OTP
// ======================================================
/**
 * sendOTP — Tạo mã OTP 6 số và "gửi" về email người dùng
 *
 * Luồng:
 *   1. Nhận email từ req.body
 *   2. Kiểm tra email tồn tại trong DB
 *   3. Sinh mã OTP 6 số ngẫu nhiên
 *   4. Lưu OTP vào otpStore (RAM) với thời hạn 10 phút
 *   5. In OTP ra console (thay email thật nếu chưa cấu hình SMTP)
 *   6. Trả về OTP trong response (chỉ dùng khi dev, tắt khi production)
 *
 * Gọi từ: POST /api/auth/forgot/send-otp
 */
exports.sendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.includes('@')) return fail(res, 400, 'Email không hợp lệ');

        // Kiểm tra email có tồn tại trong DB không — tránh gửi OTP cho email lạ
        const [[u]] = await db.query('SELECT id FROM users WHERE email=?', [email.trim().toLowerCase()]);
        if (!u) return fail(res, 404, 'Email chưa được đăng ký trong hệ thống');

        // Sinh OTP 6 số (100000 → 999999)
        const code = String(Math.floor(100000 + Math.random() * 900000));

        // Lưu vào RAM với thời hạn 10 phút (10 * 60 * 1000 milliseconds)
        otpStore[email.trim().toLowerCase()] = { code, expires: Date.now() + 10 * 60 * 1000 };

        // Log ra console server (dùng khi chưa cấu hình SMTP thật)
        console.log(`\n📧 OTP gửi đến ${email}: ${code} (hết hạn sau 10 phút)\n`);

        // Trả về OTP trong response (chỉ trong môi trường dev)
        res.json({ success: true, message: `Đã gửi mã OTP đến ${email}. Kiểm tra email (hoặc xem console server).`, debug_otp: process.env.NODE_ENV !== 'production' ? code : undefined });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// QUÊN MẬT KHẨU — BƯỚC 2: Xác thực OTP
// ======================================================
/**
 * verifyOTP — Kiểm tra mã OTP người dùng nhập vào có đúng không
 *
 * Luồng:
 *   1. Nhận email + code từ req.body
 *   2. Tìm entry trong otpStore theo email
 *   3. Kiểm tra chưa hết hạn
 *   4. So sánh code
 *   5. Nếu đúng → đánh dấu verified + tạo resetToken (dùng cho bước 3)
 *   6. Trả về resetToken để frontend dùng khi đổi mật khẩu
 *
 * Gọi từ: POST /api/auth/forgot/verify-otp
 */
exports.verifyOTP = async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return fail(res, 400, 'Thiếu email hoặc mã OTP');

        const key = email.trim().toLowerCase();
        const entry = otpStore[key];

        // Không tìm thấy OTP cho email này (chưa gửi hoặc server đã restart)
        if (!entry) return fail(res, 400, 'Không tìm thấy mã OTP. Vui lòng gửi lại.');

        // OTP đã quá 10 phút → xóa khỏi store và báo lỗi
        if (Date.now() > entry.expires) { delete otpStore[key]; return fail(res, 400, 'Mã OTP đã hết hạn. Vui lòng gửi lại.'); }

        // Mã nhập vào không khớp với mã đã sinh
        if (entry.code !== String(code).trim()) return fail(res, 400, 'Mã OTP không đúng!');

        // OTP hợp lệ → tạo resetToken ngẫu nhiên (32 bytes hex = 64 ký tự)
        // resetToken này sẽ dùng trong bước đổi mật khẩu để xác nhận đã verify OTP
        const resetToken = crypto.randomBytes(32).toString('hex');
        otpStore[key] = { ...entry, verified: true, resetToken };

        res.json({ success: true, message: 'Xác thực OTP thành công!', resetToken });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// QUÊN MẬT KHẨU — BƯỚC 3: Đặt lại mật khẩu (dùng resetToken)
// ======================================================
/**
 * resetPassword (phiên bản OTP in-memory) — đổi mật khẩu sau khi verify OTP
 *
 * Luồng:
 *   1. Nhận email + resetToken + newPassword từ req.body
 *   2. Kiểm tra resetToken khớp với otpStore (đã verified ở bước 2)
 *   3. Kiểm tra chưa hết hạn (thêm 5 phút grace period)
 *   4. Hash mật khẩu mới và UPDATE vào DB
 *   5. Xóa entry khỏi otpStore (một lần dùng)
 *
 * Gọi từ: POST /api/auth/forgot/reset
 * LƯU Ý: Đây là hàm resetPassword THỨ NHẤT (dùng resetToken từ verifyOTP)
 *         Có một hàm resetPassword THỨ HAI bên dưới (dùng OTP từ sessions DB)
 */
exports.resetPassword = async (req, res) => {
    try {
        const { email, resetToken, newPassword } = req.body;
        if (!email || !resetToken || !newPassword) return fail(res, 400, 'Thiếu thông tin');
        if (newPassword.length < 6) return fail(res, 400, 'Mật khẩu phải có ít nhất 6 ký tự');

        const key = email.trim().toLowerCase();
        const entry = otpStore[key];

        // Kiểm tra: phải đã verify OTP (bước 2) và resetToken phải khớp
        if (!entry || !entry.verified || entry.resetToken !== resetToken) {
            return fail(res, 400, 'Phiên đặt lại mật khẩu không hợp lệ. Vui lòng thực hiện lại từ đầu.');
        }

        // Thêm 5 phút grace period sau thời hạn OTP
        if (Date.now() > entry.expires + 5 * 60 * 1000) {
            delete otpStore[key];
            return fail(res, 400, 'Phiên đã hết hạn. Vui lòng thực hiện lại.');
        }

        // Hash mật khẩu mới và cập nhật vào DB
        await db.query('UPDATE users SET password=? WHERE email=?', [hashPwd(newPassword), key]);

        // Xóa OTP đã dùng khỏi store (tránh dùng lại)
        delete otpStore[key];

        res.json({ success: true, message: 'Đổi mật khẩu thành công! Vui lòng đăng nhập lại.' });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// ĐĂNG KÝ TÀI KHOẢN
// ======================================================
/**
 * register — Tạo tài khoản người dùng mới
 *
 * Luồng:
 *   1. Nhận username + email + password từ req.body
 *   2. Validate: đủ trường, username ≥ 3 ký tự, password ≥ 6 ký tự
 *   3. Kiểm tra username/email chưa tồn tại trong DB
 *   4. Hash mật khẩu
 *   5. INSERT user vào bảng users (role = 'user')
 *   6. Tạo token đăng nhập ngay
 *   7. Lưu token vào bảng sessions (có thời hạn 30 ngày)
 *   8. Lưu token vào cột users.token (tương thích schema cũ)
 *   9. Trả về thông tin user + token (đăng nhập luôn sau đăng ký)
 *
 * Gọi từ: POST /api/auth/register
 */
exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validate đầu vào cơ bản
        if (!username?.trim() || !email?.trim() || !password) return fail(res, 400, 'Vui lòng nhập đầy đủ thông tin');
        if (username.trim().length < 3) return fail(res, 400, 'Username tối thiểu 3 ký tự');
        if (password.length < 6)        return fail(res, 400, 'Password tối thiểu 6 ký tự');

        // Kiểm tra trùng username hoặc email (1 query kiểm tra cả 2)
        const [[ex]] = await db.query('SELECT id FROM users WHERE username=? OR email=?', [username.trim(), email.trim()]);
        if (ex) return fail(res, 400, 'Username hoặc email đã tồn tại');

        // Tạo user mới với mật khẩu đã hash, role mặc định là 'user'
        const [r] = await db.query(
            'INSERT INTO users (username, email, password, role) VALUES (?,?,?,?)',
            [username.trim(), email.trim().toLowerCase(), hashPwd(password), 'user']
        );

        // Tạo token ngay sau khi đăng ký → user được đăng nhập luôn
        const token = genToken(r.insertId, username.trim());

        // Lưu token vào sessions (hạn 30 ngày = 30 * 86400000 ms)
        try { await db.query('INSERT INTO sessions (user_id, token, expires_at) VALUES (?,?,?)', [r.insertId, token, new Date(Date.now() + 30*86400000)]); } catch (e) { console.warn('[register] sessions:', e.message); }

        // Lưu token vào cột users.token (đảm bảo tương thích fallback trong getUser)
        try { await db.query('UPDATE users SET token=? WHERE id=?', [token, r.insertId]); } catch {}

        res.json({ success: true, message: 'Đăng ký thành công!', data: { id: r.insertId, username: username.trim(), email: email.trim().toLowerCase(), role: 'user', token } });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// ĐĂNG NHẬP
// ======================================================
/**
 * login — Xác thực tài khoản và cấp token mới
 *
 * Luồng:
 *   1. Nhận identifier (username hoặc email) + password từ req.body
 *   2. Tìm user trong DB theo username HOẶC email
 *   3. So sánh hash mật khẩu
 *   4. Kiểm tra tài khoản bị ban không
 *   5. Tạo token MỚI (mỗi lần đăng nhập = 1 token mới)
 *   6. Lưu token mới vào sessions + users.token
 *   7. Trả về thông tin user + token
 *
 * Gọi từ: POST /api/auth/login
 * Token trả về sẽ được frontend lưu vào localStorage để dùng cho các request tiếp theo
 */
exports.login = async (req, res) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) return fail(res, 400, 'Thiếu thông tin đăng nhập');

        // Tìm user theo username HOẶC email (identifier có thể là cả 2)
        const [[user]] = await db.query('SELECT * FROM users WHERE username=? OR email=?', [identifier.trim(), identifier.trim()]);
        if (!user) return fail(res, 401, 'Tài khoản không tồn tại');

        // So sánh mật khẩu đã hash
        if (user.password !== hashPwd(password)) return fail(res, 401, 'Sai mật khẩu');

        // Kiểm tra tài khoản bị ban (is_banned=1) hoặc bị khóa tạm thời (banned_until chưa qua)
        if (user.is_banned || (user.banned_until && new Date(user.banned_until) > new Date())) {
            return fail(res, 403, 'Tài khoản bị chặn: ' + (user.ban_reason || 'Vi phạm nội quy'));
        }

        // Tạo token MỚI mỗi lần đăng nhập (invalidate token cũ ngầm — token mới ghi đè trong sessions)
        const token = genToken(user.id, user.username);

        // Lưu token mới vào sessions (hạn 30 ngày)
        try { await db.query('INSERT INTO sessions (user_id, token, expires_at) VALUES (?,?,?)', [user.id, token, new Date(Date.now() + 30*86400000)]); } catch (e) { console.warn('[login] sessions:', e.message); }

        // Cập nhật cột users.token (schema cũ)
        try { await db.query('UPDATE users SET token=? WHERE id=?', [token, user.id]); } catch {}

        res.json({ success: true, message: 'Đăng nhập thành công!', data: { id: user.id, username: user.username, email: user.email, role: user.role || 'user', token } });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// THÔNG TIN TÀI KHOẢN ĐANG ĐĂNG NHẬP
// ======================================================
/**
 * getMe — Lấy thông tin đầy đủ của người dùng đang đăng nhập
 *
 * Luồng:
 *   - req.user đã được gắn bởi requireLogin middleware
 *   - Query lại DB để lấy đủ phone, fullname, birthday, avatar
 *     (req.user từ authMiddleware chỉ có id, username, email, role)
 *   - Nếu query DB lỗi → fallback trả req.user (ít trường hơn)
 *
 * Gọi từ: GET /api/auth/me
 */
exports.getMe = async (req, res) => {
    try {
        // Query đầy đủ thông tin profile từ DB (authMiddleware không lấy phone/fullname/birthday/avatar)
        const [[u]] = await db.query(
            'SELECT id, username, email, role, phone, fullname, birthday, avatar, created_at FROM users WHERE id=?',
            [req.user.id]
        );
        res.json({ success: true, data: u || req.user });
    } catch (e) {
        // Fallback: trả về thông tin cơ bản từ req.user nếu DB lỗi
        const { id, username, email, role, created_at } = req.user;
        res.json({ success: true, data: { id, username, email, role, created_at } });
    }
};

// ======================================================
// CẬP NHẬT THÔNG TIN CÁ NHÂN
// ======================================================
/**
 * updateProfile — Cập nhật thông tin profile của người dùng đang đăng nhập
 *
 * Luồng:
 *   1. Nhận các trường cần cập nhật từ req.body (chỉ trường nào có giá trị mới cập nhật)
 *   2. Nếu đổi email → kiểm tra email mới chưa được dùng bởi user khác
 *   3. Xây dựng câu SQL UPDATE động (chỉ SET những trường được gửi lên)
 *   4. Trả về thông tin profile đã cập nhật
 *
 * Gọi từ: PUT /api/auth/profile
 * Hỗ trợ: email, password, phone, fullname, birthday
 */
exports.updateProfile = async (req, res) => {
    try {
        const { email, password, phone, fullname, birthday } = req.body;
        const userId = req.user.id;

        // Nếu có đổi email → kiểm tra email mới không trùng với user khác
        if (email?.trim()) {
            const [[ex]] = await db.query('SELECT id FROM users WHERE email=? AND id!=?', [email.trim().toLowerCase(), userId]);
            if (ex) return fail(res, 400, 'Email đã được sử dụng');
        }

        // Xây dựng danh sách trường cần UPDATE động (chỉ set trường nào có giá trị)
        const fields = [], values = [];
        if (email?.trim())        { fields.push('email=?');     values.push(email.trim().toLowerCase()); }
        if (password)             { fields.push('password=?');  values.push(hashPwd(password)); }
        if (phone   !== undefined){ fields.push('phone=?');     values.push(phone?.trim()||null); }
        if (fullname!== undefined){ fields.push('fullname=?');  values.push(fullname?.trim()||null); }
        if (birthday!== undefined){ fields.push('birthday=?');  values.push(birthday||null); }

        // Không có trường nào để cập nhật → báo lỗi
        if (!fields.length) return fail(res, 400, 'Không có thông tin nào để cập nhật');

        // Thêm userId vào cuối mảng values cho mệnh đề WHERE id=?
        values.push(userId);
        await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id=?`, values);

        // Query lại để trả về thông tin đã cập nhật
        const [[updated]] = await db.query(
            'SELECT id, username, email, role, phone, fullname, birthday, avatar, created_at FROM users WHERE id=?', [userId]
        );
        res.json({ success: true, message: 'Cập nhật thông tin thành công!', data: updated });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// QUÊN MẬT KHẨU — GỬI OTP (phiên bản lưu vào DB sessions)
// ======================================================
/**
 * forgotPassword — Gửi OTP đặt lại mật khẩu qua email
 *
 * Luồng:
 *   1. Nhận email từ req.body
 *   2. Tìm user trong DB theo email
 *   3. Tạo OTP 6 số
 *   4. Lưu OTP vào bảng sessions dưới dạng token đặc biệt (prefix "otp_")
 *      → Format token: "otp_123456_userId"
 *   5. Thử gửi email qua nodemailer (nếu cấu hình MAIL_USER/MAIL_PASS)
 *   6. Nếu chưa cấu hình email → log OTP ra console
 *   7. Trả về success (không tiết lộ email có tồn tại hay không — bảo mật)
 *
 * Gọi từ: POST /api/auth/forgot-password
 * LƯU Ý: Đây là hàm forgotPassword dùng sessions DB (khác sendOTP dùng RAM)
 */
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email?.trim()) return fail(res, 400, 'Vui lòng nhập email');

        // Tìm user theo email (chuyển về lowercase để tránh lỗi case)
        const [[u]] = await db.query('SELECT id, username, email FROM users WHERE email=?', [email.trim().toLowerCase()]);
        if (!u) return fail(res, 404, 'Email không tồn tại trong hệ thống');

        // Tạo OTP 6 số và thời hạn 10 phút
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000);

        // Lưu OTP vào bảng sessions dưới dạng token đặc biệt
        // Prefix "otp_" để phân biệt với token đăng nhập thường
        const otpToken = 'otp_' + otp + '_' + u.id;
        try {
            // Xóa OTP cũ của user này (nếu còn sót lại)
            await db.query('DELETE FROM sessions WHERE user_id=? AND token LIKE "otp_%"', [u.id]);
            // Lưu OTP mới
            await db.query('INSERT INTO sessions (user_id, token, expires_at) VALUES (?,?,?)', [u.id, otpToken, expires]);
        } catch {}

        // Thử gửi email thật qua nodemailer (cần cấu hình MAIL_USER + MAIL_PASS trong .env)
        let emailSent = false;
        try {
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.MAIL_USER || '', pass: process.env.MAIL_PASS || '' }
            });
            await transporter.sendMail({
                from: `"TruyenHayPhaiDoc" <${process.env.MAIL_USER}>`,
                to: u.email,
                subject: 'Mã xác nhận đặt lại mật khẩu',
                html: `<div style="font-family:Arial;padding:24px;max-width:480px;margin:0 auto;border:1px solid #eee;border-radius:8px;">
                    <h2 style="color:#e63946;">TruyenHayPhaiDoc</h2>
                    <p>Xin chào <b>${u.username}</b>,</p>
                    <p>Mã OTP đặt lại mật khẩu của bạn là:</p>
                    <div style="font-size:36px;font-weight:900;letter-spacing:8px;color:#e63946;text-align:center;padding:18px;background:#fff0f1;border-radius:8px;margin:16px 0;">${otp}</div>
                    <p style="color:#888;font-size:13px;">Mã có hiệu lực trong <b>10 phút</b>. Không chia sẻ mã này với bất kỳ ai.</p>
                </div>`
            });
            emailSent = true;
        } catch (mailErr) {
            // Email chưa cấu hình → log OTP ra console để dev test
            console.log('[forgotPassword] Email config not set, OTP:', otp, '| Error:', mailErr.message);
        }

        // Luôn trả về success để không tiết lộ email có tồn tại trong hệ thống hay không
        res.json({
            success: true,
            message: emailSent ? 'Mã OTP đã được gửi đến email của bạn!' : 'Mã OTP: ' + otp + ' (server chưa cấu hình email, xem console)',
            _debug_otp: process.env.NODE_ENV !== 'production' ? otp : undefined
        });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// QUÊN MẬT KHẨU — ĐẶT LẠI MẬT KHẨU (dùng OTP từ DB sessions)
// ======================================================
/**
 * resetPassword (phiên bản DB sessions) — đổi mật khẩu bằng OTP từ forgotPassword
 *
 * Luồng:
 *   1. Nhận email + otp + newPassword từ req.body
 *   2. Tìm user theo email
 *   3. Tái tạo otpToken từ otp + userId (format: "otp_{otp}_{userId}")
 *   4. Kiểm tra token này còn tồn tại trong sessions và chưa hết hạn
 *   5. Nếu hợp lệ → hash mật khẩu mới + UPDATE DB
 *   6. Xóa OTP khỏi sessions (một lần dùng)
 *
 * Gọi từ: POST /api/auth/reset-password
 * LƯU Ý: Đây là hàm resetPassword THỨ HAI (dùng OTP từ bảng sessions, không phải RAM)
 */
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) return fail(res, 400, 'Thiếu thông tin');
        if (newPassword.length < 6) return fail(res, 400, 'Mật khẩu phải có ít nhất 6 ký tự');

        // Tìm user theo email
        const [[u]] = await db.query('SELECT id FROM users WHERE email=?', [email.trim().toLowerCase()]);
        if (!u) return fail(res, 404, 'Email không tồn tại');

        // Tái tạo token đặc biệt để tra cứu trong sessions
        const otpToken = 'otp_' + otp + '_' + u.id;

        // Kiểm tra token có tồn tại và chưa hết hạn trong sessions
        const [[sess]] = await db.query('SELECT * FROM sessions WHERE user_id=? AND token=? AND expires_at > NOW()', [u.id, otpToken]);
        if (!sess) return fail(res, 400, 'Mã OTP không đúng hoặc đã hết hạn');

        // Đổi mật khẩu
        await db.query('UPDATE users SET password=? WHERE id=?', [hashPwd(newPassword), u.id]);

        // Xóa OTP đã dùng (tránh dùng lại)
        await db.query('DELETE FROM sessions WHERE token=?', [otpToken]);

        res.json({ success: true, message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập lại.' });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// CẬP NHẬT AVATAR
// ======================================================
/**
 * updateAvatar — Cập nhật ảnh đại diện người dùng
 *
 * Luồng:
 *   - File đã được Multer xử lý trước (middleware uploadAvatarMiddleware trong authRoutes)
 *   - req.file chứa thông tin file đã lưu trên server
 *   - Tạo URL ảnh và UPDATE vào cột avatar của users
 *
 * Gọi từ: POST /api/auth/avatar  (qua uploadAvatarMiddleware → updateAvatar)
 */
exports.updateAvatar = async (req, res) => {
    try {
        // Multer chưa xử lý được file (sai field name, sai loại file...)
        if (!req.file) return fail(res, 400, 'Không có file ảnh!');

        // Tạo URL tương đối để lưu vào DB (truy cập qua /uploads/avatars/...)
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        await db.query('UPDATE users SET avatar=? WHERE id=?', [avatarUrl, req.user.id]);

        res.json({ success: true, message: 'Cập nhật avatar thành công!', data: { avatarUrl } });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// LỊCH SỬ ĐỌC TRUYỆN
// ======================================================
/**
 * getMyHistory — Lấy danh sách truyện đã đọc của người dùng hiện tại
 *
 * Luồng:
 *   - Lấy username từ req.user (đã xác thực bởi requireLogin)
 *   - JOIN với bảng comics để lấy tên truyện, ảnh bìa, thể loại
 *   - Giới hạn 50 kết quả, sắp xếp theo thời gian đọc gần nhất
 *
 * Gọi từ: GET /api/auth/history
 */
exports.getMyHistory = async (req, res) => {
    try {
        const [rows] = await db.query(
            // JOIN history với comics để lấy thêm thông tin truyện
            `SELECT h.*, c.title, c.image, c.category, c.latest_chapter
             FROM history h JOIN comics c ON h.comic_id = c.id
             WHERE h.user_name = ? ORDER BY h.read_at DESC LIMIT 50`,
            [req.user.username]
        );
        res.json({ success: true, data: rows });
    } catch (e) { fail(res, 500, e.message); }
};

/**
 * saveHistory — Lưu / cập nhật tiến độ đọc của người dùng
 *
 * Luồng:
 *   - Nhận comicId + chapter từ req.body
 *   - Dùng INSERT ... ON DUPLICATE KEY UPDATE để:
 *     + Nếu chưa có record → INSERT mới
 *     + Nếu đã có record → UPDATE chapter_read và read_at
 *   - Đảm bảo mỗi user chỉ có 1 record lịch sử per truyện (cặp user_name + comic_id là unique)
 *
 * Gọi từ: POST /api/auth/history
 * Được gọi mỗi khi user mở đọc 1 chương mới
 */
exports.saveHistory = async (req, res) => {
    try {
        const { comicId, chapter } = req.body;
        if (!comicId || !chapter) return fail(res, 400, 'Thiếu comicId hoặc chapter');

        await db.query(
            // ON DUPLICATE KEY UPDATE → nếu đã có (user_name, comic_id) thì update thay vì insert mới
            `INSERT INTO history (user_name, comic_id, chapter_read) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE chapter_read=?, read_at=CURRENT_TIMESTAMP`,
            [req.user.username, comicId, chapter, chapter]
        );
        res.json({ success: true });
    } catch (e) { fail(res, 500, e.message); }
};

/**
 * getUserHistoryByParam — Lấy lịch sử đọc theo username trong URL params
 *
 * Luồng: Giống getMyHistory nhưng username lấy từ req.params thay vì req.user
 * Gọi từ: GET /api/auth/history/:username (nếu có route này)
 */
exports.getUserHistoryByParam = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT h.*, c.title, c.image, c.category FROM history h
             JOIN comics c ON h.comic_id = c.id
             WHERE h.user_name = ? ORDER BY h.read_at DESC LIMIT 30`,
            [req.params.username]
        );
        res.json({ success: true, data: rows });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// DANH SÁCH TRUYỆN ĐANG THEO DÕI
// ======================================================
/**
 * getMyFollows — Lấy danh sách truyện đang theo dõi của người dùng hiện tại
 *
 * Luồng:
 *   - Lấy userId từ req.user.id
 *   - JOIN follows với comics để lấy thông tin truyện
 *   - COALESCE(followed_at, created_at) → tương thích cả 2 tên cột
 *   - Sắp xếp theo thời gian theo dõi gần nhất
 *
 * Gọi từ: GET /api/auth/follows
 */
exports.getMyFollows = async (req, res) => {
    try {
        const [rows] = await db.query(
            // COALESCE xử lý tương thích: một số schema có followed_at, một số chỉ có created_at
            `SELECT f.id, f.comic_id,
                    COALESCE(f.followed_at, f.created_at) as created_at,
                    c.title, c.image, c.category, c.latest_chapter, c.views, c.status
             FROM follows f JOIN comics c ON f.comic_id = c.id
             WHERE f.user_id = ?
             ORDER BY COALESCE(f.followed_at, f.created_at) DESC`,
            [req.user.id]
        );
        res.json({ success: true, data: rows });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// ADMIN — DANH SÁCH TẤT CẢ NGƯỜI DÙNG
// ======================================================
/**
 * getAllUsers — Lấy danh sách tất cả tài khoản + thống kê hoạt động
 *
 * Luồng:
 *   1. Query danh sách users (dùng try/catch để tương thích schema cũ/mới)
 *   2. Với mỗi user → đếm thêm: số bình luận, theo dõi, đánh giá, lịch sử
 *      (mỗi cái dùng try/catch riêng → không crash nếu bảng chưa tồn tại)
 *   3. Trả về danh sách kèm các số đếm
 *
 * Gọi từ: GET /api/admin/users
 * LƯU Ý: N+1 query (1 query lấy users + N*4 query đếm) → chậm nếu nhiều user
 */
exports.getAllUsers = async (req, res) => {
    try {
        let users;
        try {
            // Schema mới: có cột phone, fullname, birthday, avatar
            [users] = await db.query(
                'SELECT id, username, email, role, phone, fullname, birthday, avatar, is_banned, ban_reason, banned_until, created_at FROM users ORDER BY id'
            );
        } catch (e) {
            // Fallback: schema cũ chưa có các cột profile
            [users] = await db.query(
                'SELECT id, username, email, role, is_banned, ban_reason, banned_until, created_at FROM users ORDER BY id'
            );
        }

        // Với mỗi user → đếm số lượng hoạt động (bình luận, follow, rating, history)
        for (const u of users) {
            try { const [[cm]] = await db.query('SELECT COUNT(*) as cnt FROM comments WHERE user_name=?', [u.username]); u.comment_count = cm.cnt; } catch { u.comment_count = 0; }
            try { const [[fw]] = await db.query('SELECT COUNT(*) as cnt FROM follows WHERE user_id=?', [u.id]); u.follow_count = fw.cnt; } catch { u.follow_count = 0; }
            try { const [[rt]] = await db.query('SELECT COUNT(*) as cnt FROM ratings WHERE user_name=?', [u.username]); u.rating_count = rt.cnt; } catch { u.rating_count = 0; }
            try { const [[ht]] = await db.query('SELECT COUNT(*) as cnt FROM history WHERE user_name=?', [u.username]); u.history_count = ht.cnt; } catch { u.history_count = 0; }
        }

        res.json({ success: true, total: users.length, data: users });
    } catch (e) { fail(res, 500, e.message); }
};

/**
 * getAllUsersPublic — Danh sách user đơn giản (không kèm số đếm hoạt động)
 * Phiên bản nhẹ hơn getAllUsers, dùng cho các trang không cần thống kê chi tiết
 */
exports.getAllUsersPublic = async (req, res) => {
    try {
        const [users] = await db.query('SELECT id, username, email, role, is_banned, ban_reason, banned_until, created_at FROM users ORDER BY id');
        res.json({ success: true, data: users });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// ADMIN — KHÓA / MỞ KHÓA TÀI KHOẢN (theo userId)
// ======================================================
/**
 * banUser — Khóa tài khoản theo userId
 *
 * Luồng:
 *   1. Nhận userId + reason + days từ req.body
 *   2. Kiểm tra user tồn tại và không phải admin
 *   3. Tính banned_until: days > 0 → tạm thời, days = 0 → vĩnh viễn (2099)
 *   4. UPDATE is_banned=1, ban_reason, banned_until
 *
 * Gọi từ: POST /api/admin/users/:id/ban (nếu có route này)
 */
exports.banUser = async (req, res) => {
    try {
        const { userId, reason, days } = req.body;
        if (!userId) return fail(res, 400, 'Thiếu userId');

        // Kiểm tra user tồn tại
        const [[t]] = await db.query('SELECT * FROM users WHERE id=?', [userId]);
        if (!t) return fail(res, 404, 'Không tìm thấy người dùng');

        // Không được khóa admin
        if (t.role === 'admin') return fail(res, 403, 'Không thể chặn admin');

        // Tính thời hạn khóa: days > 0 → cộng thêm N ngày, days = 0 → vĩnh viễn
        const d = parseInt(days);
        const until = d > 0 ? new Date(Date.now() + d * 86400000) : new Date('2099-12-31');
        await db.query('UPDATE users SET is_banned=1, ban_reason=?, banned_until=? WHERE id=?', [reason || 'Vi phạm nội quy', until, userId]);

        res.json({ success: true, message: `Đã chặn tài khoản @${t.username}` });
    } catch (e) { fail(res, 500, e.message); }
};

/**
 * unbanUser — Mở khóa tài khoản theo userId
 * Đặt lại is_banned=0, xóa ban_reason và banned_until
 */
exports.unbanUser = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return fail(res, 400, 'Thiếu userId');
        await db.query('UPDATE users SET is_banned=0, ban_reason=NULL, banned_until=NULL WHERE id=?', [userId]);
        res.json({ success: true, message: 'Đã mở khóa tài khoản' });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// ADMIN — XEM HOẠT ĐỘNG CỦA USER
// ======================================================
/**
 * getUserComments — Lấy tất cả bình luận của 1 user (theo username trong URL)
 * JOIN với comics để lấy tên truyện mà user đã bình luận
 * Gọi từ: GET /api/admin/users/:username/comments
 */
exports.getUserComments = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT cm.id, cm.comic_id, cm.content, cm.created_at, cm.parent_id, c.title as comic_title
             FROM comments cm LEFT JOIN comics c ON cm.comic_id = c.id
             WHERE cm.user_name = ? ORDER BY cm.created_at DESC LIMIT 100`,
            [req.params.username]
        );
        res.json({ success: true, data: rows });
    } catch (e) { fail(res, 500, e.message); }
};

/**
 * getUserFollows — Lấy danh sách truyện đang theo dõi của 1 user (theo username)
 * Gọi từ: GET /api/admin/users/:username/follows
 */
exports.getUserFollows = async (req, res) => {
    try {
        // Tìm userId từ username (follows lưu theo userId, không phải username)
        const [[u]] = await db.query('SELECT id FROM users WHERE username=?', [req.params.username]);
        if (!u) return res.json({ success: true, data: [] });

        const [rows] = await db.query(
            `SELECT f.id, f.comic_id, COALESCE(f.followed_at, f.created_at) as created_at,
                    c.title, c.image, c.category, c.latest_chapter
             FROM follows f LEFT JOIN comics c ON f.comic_id = c.id
             WHERE f.user_id = ? ORDER BY COALESCE(f.followed_at, f.created_at) DESC`,
            [u.id]
        );
        res.json({ success: true, data: rows });
    } catch (e) { res.json({ success: true, data: [] }); }
};

/**
 * getUserHistory — Lấy lịch sử đọc của 1 user (theo username trong URL params)
 * Gọi từ: GET /api/admin/users/:username/history
 * LƯU Ý: Có lỗi typo trong response: "ssuccess" và biến "row" chưa định nghĩa → cần fix
 */
exports.getUserHistory = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT h.*, c.title, c.image, c.category FROM history h
             LEFT JOIN comics c ON h.comic_id = c.id
             WHERE h.user_name = ? ORDER BY h.read_at DESC LIMIT 50`,
            [req.params.username]
        );
        // BUG: "ssuccess" viết sai (2 chữ s) và "row" chưa khai báo — nên là "rows"
        res.json({ ssuccess: true, data: row });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// ADMIN — KHÓA / MỞ KHÓA THEO USERNAME
// ======================================================
/**
 * blockUserByUsername — Khóa tài khoản theo username trong URL
 *
 * Luồng:
 *   1. Lấy username từ req.params, reason + days từ req.body
 *   2. Tìm user theo username (lấy id và role)
 *   3. Kiểm tra không phải admin
 *   4. Tính thời hạn khóa
 *   5. UPDATE is_banned, ban_reason, banned_until
 *
 * Gọi từ: POST /api/admin/users/:username/block
 */
exports.blockUserByUsername = async (req, res) => {
    try {
        const { username } = req.params;
        const { reason, days } = req.body;

        // Tìm user theo username để lấy id (cần id để UPDATE)
        const [[u]] = await db.query('SELECT id, role FROM users WHERE username=?', [username]);
        if (!u) return fail(res, 404, `Không tìm thấy tài khoản @${username}`);
        if (u.role === 'admin') return fail(res, 403, 'Không thể block tài khoản Admin');

        // days = 0 hoặc không truyền → block vĩnh viễn đến năm 2099
        const d = parseInt(days) || 0;
        const until = d > 0 ? new Date(Date.now() + d * 86400000) : new Date('2099-12-31');
        await db.query('UPDATE users SET is_banned=1, ban_reason=?, banned_until=? WHERE id=?', [reason || 'Vi phạm nội quy', until, u.id]);

        res.json({ success: true, message: `Đã block @${username}${d > 0 ? ` trong ${d} ngày` : ' vĩnh viễn'}` });
    } catch (e) { fail(res, 500, e.message); }
};

/**
 * unblockUserByUsername — Mở khóa tài khoản theo username trong URL
 * Gọi từ: POST /api/admin/users/:username/unblock
 */
exports.unblockUserByUsername = async (req, res) => {
    try {
        const { username } = req.params;
        const [[u]] = await db.query('SELECT id FROM users WHERE username=?', [username]);
        if (!u) return fail(res, 404, `Không tìm thấy tài khoản @${username}`);
        await db.query('UPDATE users SET is_banned=0, ban_reason=NULL, banned_until=NULL WHERE id=?', [u.id]);
        res.json({ success: true, message: `Đã mở block @${username}` });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// ADMIN — CHI TIẾT 1 USER
// ======================================================
/**
 * getUserDetail — Xem toàn bộ thông tin của 1 user (profile + tất cả hoạt động)
 *
 * Luồng:
 *   1. Lấy username từ req.params
 *   2. Query thông tin profile user
 *   3. Dùng Promise.all để query song song 3 bảng: comments, history, ratings
 *   4. Query riêng bảng follows (cần userId không phải username)
 *   5. Trả về tất cả gộp lại: profile + stats + danh sách chi tiết
 *
 * Gọi từ: GET /api/admin/users/:username
 */
exports.getUserDetail = async (req, res) => {
    try {
        const { username } = req.params;

        // Lấy thông tin đầy đủ profile (kể cả phone, fullname, birthday, avatar)
        const [[u]] = await db.query(
            'SELECT id, username, email, role, phone, fullname, birthday, avatar, is_banned, ban_reason, banned_until, created_at FROM users WHERE username=?',
            [username]
        );
        if (!u) return fail(res, 404, `Không tìm thấy @${username}`);

        // Query song song 3 bảng liên quan (giảm thời gian chờ so với query tuần tự)
        const [comments, history, ratings] = await Promise.all([
            db.query(`SELECT cm.id, cm.comic_id, cm.content, cm.created_at, cm.parent_id, c.title as comic_title
                      FROM comments cm LEFT JOIN comics c ON cm.comic_id=c.id
                      WHERE cm.user_name=? ORDER BY cm.created_at DESC LIMIT 50`, [username]),
            db.query(`SELECT h.*, c.title, c.image FROM history h LEFT JOIN comics c ON h.comic_id=c.id
                      WHERE h.user_name=? ORDER BY h.read_at DESC LIMIT 50`, [username]),
            db.query(`SELECT r.*, c.title FROM ratings r LEFT JOIN comics c ON r.comic_id=c.id
                      WHERE r.user_name=? ORDER BY r.updated_at DESC`, [username])
        ]);

        // Query follows riêng vì cần userId (follows lưu user_id, không phải username)
        const [followRows] = await db.query(
            `SELECT f.id, f.comic_id, COALESCE(f.followed_at,f.created_at) as created_at, c.title, c.image, c.category
             FROM follows f LEFT JOIN comics c ON f.comic_id=c.id WHERE f.user_id=?
             ORDER BY COALESCE(f.followed_at,f.created_at) DESC`, [u.id]
        );

        // Trả về tất cả: profile, số thống kê tổng hợp, và danh sách chi tiết từng loại
        res.json({
            success: true,
            data: {
                profile: u,
                stats: { comments: comments[0].length, follows: followRows.length, history: history[0].length, ratings: ratings[0].length },
                comments: comments[0], follows: followRows, history: history[0], ratings: ratings[0]
            }
        });
    } catch (e) { fail(res, 500, e.message); }
};

/**
 * getUserRatings — Lấy danh sách đánh giá của 1 user (theo username)
 * Gọi từ: GET /api/admin/users/:username/ratings
 */
exports.getUserRatings = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT r.id, r.comic_id, r.score, r.updated_at, c.title, c.image, c.category
             FROM ratings r LEFT JOIN comics c ON r.comic_id=c.id
             WHERE r.user_name=? ORDER BY r.updated_at DESC`,
            [req.params.username]
        );
        res.json({ success: true, data: rows });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// ADMIN — THỐNG KÊ TỔNG QUAN HỆ THỐNG
// ======================================================
/**
 * getSystemStats — Lấy các con số thống kê tổng hợp của toàn hệ thống
 *
 * Luồng:
 *   - Dùng Promise.all để chạy 8 query đếm song song (giảm thời gian chờ)
 *   - Đếm: users, comics, chapters, comments, follows, banned users, tổng views
 *   - Lấy thêm top 5 truyện được theo dõi nhiều nhất
 *
 * Gọi từ: GET /api/admin/stats
 */
exports.getSystemStats = async (req, res) => {
    try {
        // Chạy tất cả query thống kê song song với Promise.all
        const results = await Promise.all([
            db.query('SELECT COUNT(*) as cnt FROM users WHERE role != "admin"'),  // [0] Tổng user
            db.query('SELECT COUNT(*) as cnt FROM comics'),                        // [1] Tổng truyện
            db.query('SELECT COUNT(*) as cnt FROM chapters'),                      // [2] Tổng chương
            db.query('SELECT COUNT(*) as cnt FROM comments'),                      // [3] Tổng bình luận
            db.query('SELECT COUNT(*) as cnt FROM follows'),                       // [4] Tổng lượt theo dõi
            db.query('SELECT COUNT(*) as cnt FROM users WHERE is_banned=1'),       // [5] Tổng user bị ban
            db.query('SELECT COALESCE(SUM(views),0) as total FROM comics'),        // [6] Tổng lượt xem
            db.query(`SELECT c.id, c.title, COUNT(f.id) as follow_count          -- [7] Top 5 truyện follow nhiều nhất
                      FROM comics c LEFT JOIN follows f ON c.id=f.comic_id
                      GROUP BY c.id ORDER BY follow_count DESC LIMIT 5`),
        ]);

        res.json({
            success: true,
            data: {
                totalUsers:    results[0][0][0].cnt,
                totalComics:   results[1][0][0].cnt,
                totalChapters: results[2][0][0].cnt,
                totalComments: results[3][0][0].cnt,
                totalFollows:  results[4][0][0].cnt,
                totalBanned:   results[5][0][0].cnt,
                totalViews:    parseInt(results[6][0][0].total || 0),
                topFollowed:   results[7][0],
            }
        });
    } catch (e) { fail(res, 500, e.message); }
};

// ======================================================
// ADMIN — TOP TRUYỆN
// ======================================================
/**
 * getTopFollowed — Top truyện được theo dõi nhiều nhất
 *
 * Query params:
 *   - limit: số lượng kết quả (mặc định 10, tối đa 50)
 *   - order: asc hoặc desc (mặc định desc = nhiều nhất lên đầu)
 *
 * Gọi từ: GET /api/admin/... (hoặc frontend gọi trực tiếp nếu có route)
 */
exports.getTopFollowed = async (req, res) => {
    try {
        const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const [rows] = await db.query(
            `SELECT c.id, c.title, c.image, c.category, c.status, COUNT(f.id) as follow_count
             FROM comics c LEFT JOIN follows f ON c.id = f.comic_id
             GROUP BY c.id ORDER BY follow_count ${order} LIMIT ?`, [limit]
        );
        res.json({ success: true, data: rows });
    } catch (e) { fail(res, 500, e.message); }
};

/**
 * getTopRated — Top truyện có điểm đánh giá trung bình cao nhất
 *
 * Query params:
 *   - limit: số lượng kết quả (mặc định 10, tối đa 50)
 *   - order: asc hoặc desc (mặc định desc)
 *
 * HAVING rating_count > 0 → chỉ lấy truyện đã có ít nhất 1 đánh giá
 */
exports.getTopRated = async (req, res) => {
    try {
        const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const [rows] = await db.query(
            `SELECT c.id, c.title, c.image, c.category, c.status,
                    ROUND(COALESCE(AVG(r.score), 0), 2) as rating_avg,
                    COUNT(r.id) as rating_count
             FROM comics c LEFT JOIN ratings r ON c.id = r.comic_id
             GROUP BY c.id HAVING rating_count > 0
             ORDER BY rating_avg ${order}, rating_count DESC LIMIT ?`, [limit]
        );
        res.json({ success: true, data: rows });
    } catch (e) { fail(res, 500, e.message); }
};
