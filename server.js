/* FILE: server.js
 * ======================================================
 * ĐIỂM KHỞI ĐỘNG CỦA TOÀN BỘ BACKEND
 * ======================================================
 * Luồng request đi qua file này theo thứ tự:
 *   1. CORS middleware  → cho phép frontend gọi API từ domain khác
 *   2. Body parser      → chuyển JSON body thành req.body
 *   3. Static files     → phục vụ ảnh upload tại /uploads/*
 *   4. Route matching   → phân phối request đến đúng router
 *      a. /api/auth/*   → authRoutes.js  (đăng ký, đăng nhập, profile)
 *      b. /api/admin/*  → adminRoutes.js (quản trị)
 *      c. /api/*        → comicRoutes.js (truyện, chương, bình luận)
 *   5. 404 handler      → trả lỗi nếu không khớp route nào
 *   6. Error handler    → bắt lỗi toàn cục
 * ======================================================
 */
require('dotenv').config();   // Load .env trước mọi thứ
const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const swaggerUI    = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');
const comicRoutes  = require('./routes/comicRoutes');
const authRoutes   = require('./routes/authRoutes');

const app = express();

// ─── MIDDLEWARE TOÀN CỤC ────────────────────────────────────────────
// Cho phép mọi origin gọi API (CORS mở hoàn toàn — phù hợp dev, cần giới hạn khi production)
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE'], allowedHeaders: ['Content-Type','Authorization'] }));

// Cho phép đọc body dạng JSON (req.body sẽ có giá trị sau middleware này)
app.use(express.json());

// Cho phép đọc body dạng form (application/x-www-form-urlencoded)
app.use(express.urlencoded({ extended: true }));

// Phục vụ file tĩnh trong thư mục /uploads (ảnh bìa, ảnh chương, avatar)
// Truy cập qua URL: http://localhost:5000/uploads/covers/ten-anh.jpg
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─────────────────────────────────────────────────────────────
//  CẤU HÌNH SWAGGER — tài liệu API tự động tại /api-docs
// ─────────────────────────────────────────────────────────────
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: '📚 API Web Đọc Truyện — TruyenHayPhaiDoc',
            version: '3.0.0',
            description: `
## 🔐 Phân quyền & Cách sử dụng

> **Tất cả các API đều yêu cầu đăng nhập** (trừ \`/register\` và \`/login\`)

### Phân quyền
| Role | Quyền hạn |
|------|-----------|
| **user** | Xem truyện, tìm kiếm, lọc thể loại, xem top, bình luận, theo dõi, đánh giá, lịch sử |
| **admin** | Toàn bộ quyền user + quản lý truyện/chương/ảnh + quản lý tài khoản user |

---

### 🚀 Bắt đầu nhanh

**Bước 1** — Đăng ký tài khoản (nếu chưa có):
\`\`\`
POST /api/auth/register
{ "username": "tenban", "email": "email@example.com", "password": "matkhau123" }
\`\`\`

**Bước 2** — Đăng nhập:
\`\`\`
POST /api/auth/login
{ "identifier": "tenban", "password": "matkhau123" }
\`\`\`

**Bước 3** — Copy giá trị \`token\` từ response, nhấn nút **Authorize 🔒** góc trên phải, dán token vào (không cần gõ "Bearer ").

---

### 📋 Danh sách đầy đủ các API

\`\`\`
🟢 AUTH (không cần token)
  POST  /api/auth/register         Đăng ký tài khoản user
  POST  /api/auth/login            Đăng nhập (user hoặc admin)

👤 USER — Tài khoản (cần token)
  GET   /api/auth/me               Thông tin tài khoản của mình
  GET   /api/auth/history          Lịch sử đọc truyện của mình
  POST  /api/auth/history          Lưu lịch sử đọc
  GET   /api/auth/follows          Danh sách truyện đang theo dõi

📚 TRUYỆN — User (cần token)
  GET   /api/comics                Danh sách truyện (+ tìm kiếm, lọc thể loại)
  GET   /api/comics/top-followed   Top truyện theo dõi nhiều nhất
  GET   /api/comics/top-rated      Top truyện đánh giá cao
  GET   /api/comics/:id            Chi tiết truyện
  GET   /api/comics/:id/chapters   Danh sách chương

📖 NỘI DUNG CHƯƠNG (cần token)
  GET   /api/comics/:id/chapters/:num/images   Ảnh trang của chương

💬 BÌNH LUẬN (cần token)
  GET   /api/comics/:id/comments              Xem bình luận
  POST  /api/comics/:id/comments              Đăng bình luận (auto tên tài khoản)
  DELETE /api/comics/:id/comments/:cid        Xóa bình luận của mình

❤️ THEO DÕI (cần token)
  POST   /api/comics/:id/follow               Theo dõi
  DELETE /api/comics/:id/follow               Bỏ theo dõi
  GET    /api/comics/:id/follow-status        Trạng thái theo dõi

⭐ ĐÁNH GIÁ (cần token)
  GET    /api/comics/:id/rating               Xem điểm đánh giá
  POST   /api/comics/:id/rating               Đánh giá (1-5 sao)
  DELETE /api/comics/:id/rating               Xóa đánh giá của mình

🔧 ADMIN — Quản lý truyện (cần token Admin)
  POST   /api/admin/comics                    Thêm truyện mới
  PUT    /api/admin/comics/:id                Sửa thông tin truyện
  DELETE /api/admin/comics/:id                Xóa truyện
  POST   /api/admin/comics/:id/cover          Upload ảnh bìa từ máy tính
  DELETE /api/admin/comics/:id/comments/:cid  Xóa bất kỳ bình luận

🔧 ADMIN — Quản lý chương (cần token Admin)
  POST   /api/admin/comics/:id/chapters                     Thêm chương (link ảnh)
  POST   /api/admin/comics/:id/chapters/:num/upload         Upload ảnh từ máy tính
  DELETE /api/admin/comics/:id/chapters/:num                Xóa chương

🔧 ADMIN — Quản lý tài khoản (cần token Admin)
  GET    /api/admin/users                          Danh sách tất cả user
  GET    /api/admin/users/:username                Chi tiết user (follows, history, comment, rating)
  POST   /api/admin/users/:username/block          Block tài khoản
  POST   /api/admin/users/:username/unblock        Mở block tài khoản
  GET    /api/admin/users/:username/comments       Bình luận của user
  GET    /api/admin/users/:username/follows        Danh sách theo dõi của user
  GET    /api/admin/users/:username/history        Lịch sử đọc của user
  GET    /api/admin/users/:username/ratings        Đánh giá của user
  GET    /api/admin/stats                          Thống kê tổng quan hệ thống
\`\`\`
            `
        },
        servers: [{ url: 'http://localhost:5000', description: '🖥️ Local Server' }],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'SHA256Token',
                    description: '📌 Token lấy từ POST /api/auth/login → trường "token". Chỉ dán token, Swagger tự thêm "Bearer ".'
                }
            }
        },
        security: [{ BearerAuth: [] }]   // Áp dụng global — tất cả API đều cần auth
    },
    apis: ['./routes/*.js'],   // Swagger quét JSDoc comment trong tất cả route files
};

// Khởi tạo Swagger UI tại /api-docs với giao diện tùy chỉnh
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerJsDoc(swaggerOptions), {
    swaggerOptions: { persistAuthorization: true },  // Giữ token sau khi reload trang
    customCss: `
        .swagger-ui .topbar { background: #1e2139; }
        .swagger-ui .topbar .download-url-wrapper { display: none; }
        .swagger-ui .info .title { color: #e63946; }
    `,
    customSiteTitle: 'TruyenHayPhaiDoc API Docs'
}));

// ─── GẮN ROUTES — THỨ TỰ MOUNT RẤT QUAN TRỌNG ────────────────────
// Quy tắc: route CỤ THỂ hơn phải được mount TRƯỚC route TỔNG QUÁT hơn
// Nếu mount comicRoutes (/api/*) trước → Express sẽ match nhầm /api/auth/login vào comicRoutes

// Thử load adminRoutes (có thể chưa tồn tại ở một số môi trường)
let adminRoutes;
try {
    adminRoutes = require('./routes/adminRoutes');
} catch(e) {
    // adminRoutes.js chưa tồn tại thì fallback về authRoutes xử lý /admin/*
    adminRoutes = null;
}

// Bước 1: Mount authRoutes — xử lý /api/auth/register, /api/auth/login, /api/auth/me, ...
app.use('/api/auth', authRoutes);

// Bước 2: Mount adminRoutes — xử lý /api/admin/users, /api/admin/comics, /api/admin/stats, ...
if (adminRoutes) {
    app.use('/api/admin', adminRoutes);
}

// Bước 3: Mount comicRoutes — xử lý /api/comics/*, /api/admin/comics/* (fallback nếu adminRoutes null)
// Đây là catch-all nên phải mount SAU CÙNG
app.use('/api', comicRoutes);

// ─── ROUTE GỐC — kiểm tra server đang chạy ────────────────────────
// Truy cập http://localhost:5000/ để xem trạng thái server
app.get('/', (req, res) => res.json({
    success: true,
    message: '✅ Backend TruyenHayPhaiDoc v3.0 đang chạy!',
    docs: 'http://localhost:5000/api-docs',
    note: 'Tất cả API đều yêu cầu đăng nhập. Đọc hướng dẫn tại /api-docs'
}));

// ─── XỬ LÝ LỖI 404 — route không tồn tại ─────────────────────────
// Nếu request không khớp BẤT KỲ route nào ở trên → trả về 404
// Middleware này phải đặt CUỐI CÙNG sau tất cả app.use(router)
app.use((req, res) => res.status(404).json({ success: false, message: `Route không tồn tại: ${req.method} ${req.originalUrl}` }));

// ─── XỬ LÝ LỖI TOÀN CỤC ──────────────────────────────────────────
// Bắt mọi lỗi không được xử lý trong controller (throw error, next(err))
// 4 tham số (err, req, res, next) là signature bắt buộc của Express error handler
app.use((err, req, res, next) => {
    console.error('💥 Lỗi:', err.message);
    res.status(500).json({ success: false, message: err.message });
});

// ─── KHỞI ĐỘNG SERVER ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('\n🚀 ==========================================');
    console.log(`✅  Server:   http://localhost:${PORT}`);
    console.log(`📖  Swagger:  http://localhost:${PORT}/api-docs`);
    console.log(`🖼️   Uploads:  http://localhost:${PORT}/uploads/`);
    console.log(`🔐  Login:    POST http://localhost:${PORT}/api/auth/login`);
    console.log('🚀 ==========================================\n');
});
