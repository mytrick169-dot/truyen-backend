/* FILE: controllers/uploadController.js
 * ======================================================
 * CONTROLLER XỬ LÝ UPLOAD FILE (MULTER)
 * ======================================================
 * Quản lý toàn bộ việc upload ảnh lên server:
 *   1. Ảnh trang truyện (chapter images)
 *   2. Ảnh bìa truyện (comic cover)
 *   3. Ảnh đại diện người dùng (avatar)
 *
 * Luồng upload ảnh chương (ví dụ):
 *   Frontend gửi form-data với field "images"
 *   → Route: POST /api/admin/comics/:id/chapters/:chapterNum/upload
 *   → requireAdmin (kiểm tra token admin)
 *   → uploadMiddleware (Multer lưu file vào /uploads/chapters/{id}/{chapterNum}/)
 *   → uploadChapterImages (lưu đường dẫn vào DB)
 *
 * Cấu trúc thư mục lưu file:
 *   uploads/
 *     chapters/{comicId}/{chapterNum}/  → ảnh trang truyện
 *     covers/                           → ảnh bìa
 *     avatars/                          → ảnh đại diện
 * ======================================================
 */
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const db     = require('../config/db');

// ─── BỘ LỌC FILE: chỉ nhận ảnh ───────────────────────────────────
/**
 * imgFilter — Kiểm tra loại file khi upload
 * Multer gọi hàm này trước khi lưu file
 * - cb(null, true)  → cho phép lưu file
 * - cb(error, false) → từ chối file, trả lỗi cho client
 */
const imgFilter = (req, file, cb) => {
    const ok = ['image/jpeg','image/jpg','image/png','image/webp','image/gif'];
    // Chỉ chấp nhận các MIME type ảnh hợp lệ
    ok.includes(file.mimetype) ? cb(null, true) : cb(new Error('Chỉ nhận file ảnh JPG/PNG/WEBP/GIF'), false);
};

// ─── CẤU HÌNH LƯU TRỮ ẢNH TRANG TRUYỆN ─────────────────────────
/**
 * chapterStorage — Multer storage config cho ảnh trang truyện
 *
 * Thư mục lưu: /uploads/chapters/{comicId}/{chapterNum}/
 * Tên file: {4_digit_index}_{timestamp}.{ext}
 *   VD: 0001_1700000000000.jpg, 0002_1700000000001.jpg, ...
 *
 * Dùng index 4 chữ số để ảnh sắp xếp đúng thứ tự khi sort theo tên file
 * req._fileIndex là biến tự tạo để đếm thứ tự file trong 1 request upload
 */
const chapterStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Tạo đường dẫn thư mục theo comicId và chapterNum từ URL
        const { id, chapterNum } = req.params;
        const dir = path.join(__dirname, '..', 'uploads', 'chapters', String(id), String(chapterNum));
        // Tạo thư mục nếu chưa tồn tại (recursive = true → tạo cả thư mục cha)
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Đếm thứ tự file trong cùng 1 request (để sắp xếp đúng thứ tự trang)
        const idx = String(req._fileIndex || 0).padStart(4, '0'); // VD: "0000", "0001"
        req._fileIndex = (req._fileIndex || 0) + 1;
        // Lấy phần mở rộng file gốc, nếu không có thì dùng .jpg
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${idx}_${Date.now()}${ext}`);
    }
});

// ─── CẤU HÌNH LƯU TRỮ ẢNH BÌA TRUYỆN ────────────────────────────
/**
 * coverStorage — Multer storage config cho ảnh bìa truyện
 *
 * Thư mục lưu: /uploads/covers/
 * Tên file: {comicId}_{timestamp}.{ext}
 *   VD: 10_1700000000000.jpg
 *
 * Dùng comicId trong tên file để dễ nhận biết ảnh bìa của truyện nào
 */
const coverStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads', 'covers');
        fs.mkdirSync(dir, { recursive: true }); // Tạo thư mục nếu chưa có
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        // Đặt tên file theo comicId để tránh trùng
        cb(null, `${req.params.id}_${Date.now()}${ext}`);
    }
});

// ─── CẤU HÌNH LƯU TRỮ AVATAR NGƯỜI DÙNG ─────────────────────────
/**
 * avatarStorage — Multer storage config cho ảnh đại diện
 *
 * Thư mục lưu: /uploads/avatars/
 * Tên file: avatar_{userId}_{timestamp}.{ext}
 *   VD: avatar_5_1700000000000.jpg
 *
 * req.user.id được gắn bởi requireLogin trước khi Multer chạy
 */
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads', 'avatars');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        // Đặt tên file chứa userId để dễ quản lý, không bị trùng
        cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
    }
});

// ─── KHỞI TẠO MULTER INSTANCES ───────────────────────────────────
// Mỗi loại upload có instance riêng với storage và giới hạn kích thước khác nhau

// Upload ảnh chương: tối đa 100 file/request, mỗi file ≤ 5MB
const uploadChapter = multer({ storage: chapterStorage, fileFilter: imgFilter, limits: { fileSize: 5*1024*1024 } });

// Upload ảnh bìa: chỉ 1 file/request, ≤ 5MB
const uploadCover   = multer({ storage: coverStorage,   fileFilter: imgFilter, limits: { fileSize: 5*1024*1024 } });

// Upload avatar: chỉ 1 file/request, ≤ 3MB (nhỏ hơn vì chỉ là ảnh đại diện)
const uploadAvatar  = multer({ storage: avatarStorage,  fileFilter: imgFilter, limits: { fileSize: 3*1024*1024 } });

// ─── EXPORT MIDDLEWARE ─────────────────────────────────────────────
// Các middleware này được dùng trong route TRƯỚC controller handler
// Route dùng: [requireAdmin, uploadMiddleware, uploadChapterImages]

// Nhận mảng file với field name "images", tối đa 100 ảnh
exports.uploadMiddleware       = uploadChapter.array('images', 100);

// Nhận 1 file với field name "cover"
exports.coverMiddleware        = uploadCover.single('cover');

// Nhận 1 file với field name "avatar"
exports.uploadAvatarMiddleware = uploadAvatar.single('avatar');

// ======================================================
// UPLOAD ẢNH TRANG TRUYỆN
// ======================================================
/**
 * uploadChapterImages — Lưu đường dẫn ảnh vào DB sau khi Multer đã upload file
 *
 * Luồng (Multer đã chạy trước — req.files chứa thông tin file đã lưu):
 *   1. Kiểm tra có file nào được upload không
 *   2. Sắp xếp files theo tên (để đảm bảo thứ tự trang đúng)
 *   3. Tạo mảng URL cho từng ảnh
 *   4. Serialize thành JSON string để lưu vào cột content trong DB
 *   5. Kiểm tra chapter đã tồn tại chưa:
 *      - Có rồi → UPDATE content
 *      - Chưa có → INSERT mới
 *   6. Cập nhật latest_chapter trong bảng comics nếu chương này mới nhất
 *
 * Request:  POST /api/admin/comics/:id/chapters/:chapterNum/upload
 * Form-data: field "images" (nhiều file ảnh)
 */
exports.uploadChapterImages = async (req, res) => {
    try {
        const { id, chapterNum } = req.params;

        // Không có file nào được upload (field sai tên, không chọn file, ...)
        if (!req.files || req.files.length === 0)
            return res.status(400).json({ success: false, message: 'Không có ảnh nào được upload!' });

        // Sắp xếp file theo tên (đảm bảo thứ tự: 0001_... < 0002_... < ...)
        const sorted    = req.files.sort((a, b) => a.filename.localeCompare(b.filename));

        // Tạo mảng URL tương đối cho từng ảnh (truy cập qua /uploads/chapters/...)
        const imageUrls = sorted.map(f => `/uploads/chapters/${id}/${chapterNum}/${f.filename}`);

        // Serialize mảng URL thành JSON string để lưu vào cột content
        const content   = JSON.stringify(imageUrls);

        // Kiểm tra chapter đã tồn tại trong DB chưa
        const [ex] = await db.query('SELECT id FROM chapters WHERE comic_id=? AND chapter_number=?', [id, chapterNum]);
        if (ex.length > 0) {
            // Đã có chapter → UPDATE nội dung (thay ảnh cũ bằng ảnh mới)
            await db.query('UPDATE chapters SET content=? WHERE comic_id=? AND chapter_number=?', [content, id, chapterNum]);
        } else {
            // Chưa có chapter → INSERT mới
            await db.query('INSERT INTO chapters (comic_id, chapter_number, content) VALUES (?,?,?)', [id, chapterNum, content]);
        }

        // Cập nhật latest_chapter trong comics CHỈ KHI chapter này lớn hơn chapter hiện tại
        // Tránh ghi đè chương cũ hơn lên latest_chapter
        await db.query(
            'UPDATE comics SET latest_chapter=?, updated_at=NOW() WHERE id=? AND (latest_chapter IS NULL OR latest_chapter<?)',
            [chapterNum, id, chapterNum]
        );

        res.json({
            success: true,
            message: `Upload thành công ${req.files.length} ảnh cho chương ${chapterNum}!`,
            data: { comicId: id, chapterNumber: chapterNum, totalImages: imageUrls.length, images: imageUrls }
        });
    } catch (e) {
        console.error('[uploadChapterImages]', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
};

// ======================================================
// UPLOAD ẢNH BÌA TRUYỆN
// ======================================================
/**
 * uploadComicCover — Lưu đường dẫn ảnh bìa vào DB
 *
 * Luồng (Multer đã chạy trước — req.file chứa thông tin file đã lưu):
 *   1. Kiểm tra có file không (req.file từ coverMiddleware)
 *   2. Kiểm tra truyện tồn tại trong DB
 *   3. Tạo URL ảnh và UPDATE vào cột image của bảng comics
 *
 * Request:  POST /api/admin/comics/:id/cover
 * Form-data: field "cover" (1 file ảnh)
 */
exports.uploadComicCover = async (req, res) => {
    try {
        const { id } = req.params;

        // Không có file (Multer từ chối do sai loại file hoặc vượt kích thước)
        if (!req.file) return res.status(400).json({ success: false, message: 'Không có file ảnh!' });

        // Kiểm tra truyện tồn tại (tránh cập nhật ảnh cho truyện không có trong DB)
        const [[comic]] = await db.query('SELECT id FROM comics WHERE id=?', [id]);
        if (!comic) return res.status(404).json({ success: false, message: 'Không tìm thấy truyện' });

        // Tạo URL tương đối và cập nhật vào DB
        const imageUrl = `/uploads/covers/${req.file.filename}`;
        await db.query('UPDATE comics SET image=?, updated_at=NOW() WHERE id=?', [imageUrl, id]);

        res.json({
            success: true,
            message: 'Đã cập nhật ảnh bìa!',
            data: { imageUrl }
        });
    } catch (e) {
        console.error('[uploadComicCover]', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
};

// ======================================================
// LẤY DANH SÁCH ẢNH TRANG CỦA 1 CHƯƠNG
// ======================================================
/**
 * getChapterImages — Trả về mảng URL ảnh trang để frontend render trang đọc truyện
 *
 * Luồng:
 *   1. Lấy comicId + chapterNum từ URL params
 *   2. Query cột content trong bảng chapters
 *   3. Parse JSON string → mảng URL
 *   4. Xử lý tương thích: content có thể là JSON array, string đơn, hoặc null
 *
 * Request:  GET /api/comics/:id/chapters/:chapterNum/images
 * Response: { success, data: ["/uploads/chapters/.../0001.jpg", ...] }
 *
 * Frontend nhận mảng này và render từng ảnh thành từng trang truyện theo thứ tự
 */
exports.getChapterImages = async (req, res) => {
    try {
        const { id, chapterNum } = req.params;

        // Query cột content (chứa JSON string mảng URL ảnh)
        const [rows] = await db.query('SELECT content FROM chapters WHERE comic_id=? AND chapter_number=?', [id, chapterNum]);

        // Không tìm thấy chapter → trả mảng rỗng (không phải lỗi 404)
        if (!rows.length) return res.json({ success: true, data: [] });

        let images = [];
        try {
            // Parse JSON: content = '["url1", "url2", ...]'
            images = JSON.parse(rows[0].content || '[]');
            // Nếu parse ra không phải array (VD: chuỗi đơn) → bọc vào array
            if (!Array.isArray(images)) images = rows[0].content ? [rows[0].content] : [];
        } catch {
            // JSON parse lỗi (content không hợp lệ) → coi content là 1 URL đơn
            images = rows[0].content ? [rows[0].content] : [];
        }

        res.json({ success: true, data: images });
    } catch (e) {
        console.error('[getChapterImages]', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
};

// ======================================================
// UPLOAD AVATAR NGƯỜI DÙNG
// ======================================================
/**
 * uploadAvatar — Lưu đường dẫn avatar vào DB sau khi Multer upload
 *
 * Luồng (Multer đã chạy trước — req.file chứa thông tin file đã lưu):
 *   1. Kiểm tra có file không (req.file từ uploadAvatarMiddleware)
 *   2. Tạo URL avatar
 *   3. UPDATE cột avatar trong bảng users theo req.user.id
 *
 * Request:  POST /api/auth/avatar
 * Form-data: field "avatar" (1 file ảnh)
 */
exports.uploadAvatar = async (req, res) => {
    try {
        // Không có file (sai field name hoặc Multer từ chối)
        if (!req.file) return res.status(400).json({ success: false, message: 'Chưa chọn file ảnh' });

        // Tạo URL tương đối để lưu vào DB
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;

        // Cập nhật cột avatar trong users theo userId của người đang đăng nhập
        await db.query('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, req.user.id]);

        res.json({
            success: true,
            message: 'Cập nhật ảnh đại diện thành công!',
            data: { avatar: avatarUrl }
        });
    } catch (e) {
        console.error('[uploadAvatar]', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
};
