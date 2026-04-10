/* FILE: controllers/comicController.js */
/* ★ FIX:
 *  1. Xóa khai báo getComics duplicate (lỗi gây toàn bộ file hỏng)
 *  2. updateComic thêm is_hot + views vào SQL → admin tick HOT mới lưu vào DB
 *     → index.html mới hiển thị đúng section TRUYỆN HOT
 */

// Kết nối database MySQL thông qua module cấu hình
const db   = require('../config/db');

// Hàm helper dùng chung: trả về response lỗi với HTTP status code và message tùy chỉnh
const fail = (res, code, msg) => res.status(code).json({ success: false, message: msg });

// Hàm loại bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu
function removeAccents(str) {
    return (str||'')              // Nếu str là null/undefined thì dùng chuỗi rỗng
        .normalize('NFD')         // Tách ký tự có dấu thành ký tự gốc + dấu riêng (VD: 'ê' → 'e' + '^')
        .replace(/[\u0300-\u036f]/g,'') // Xóa toàn bộ ký tự dấu (combining marks)
        .replace(/đ/g,'d')        // Thay 'đ' → 'd' (vì normalize không xử lý được)
        .replace(/Đ/g,'D')        // Thay 'Đ' → 'D'
        .toLowerCase();           // Chuyển toàn bộ về chữ thường để so sánh không phân biệt hoa/thường
}

// ===== TRUYỆN =====

// Lấy danh sách truyện, hỗ trợ lọc theo category/status/id và tìm kiếm theo tên
exports.getComics = async (req, res) => {
    try {
        // Đọc các tham số tìm kiếm từ query string (?category=...&search=...&id=...&status=...)
        const { category, search, id, status } = req.query;

        // Khởi tạo câu SQL cơ bản, mảng params (tham số) và conds (điều kiện WHERE)
        let sql = 'SELECT * FROM comics', params = [], conds = [];

        // Nếu có tham số id → thêm điều kiện lọc theo ID (ép kiểu sang số nguyên)
        if (id)       { conds.push('id=?'); params.push(parseInt(id)); }

        // Nếu có category và không phải 'All' → thêm điều kiện lọc theo thể loại
        if (category && category !== 'All') { conds.push('category=?'); params.push(category); }

        // Nếu có status → thêm điều kiện lọc theo trạng thái (Đang tiến hành / Đã hoàn thành)
        if (status)   { conds.push('status=?'); params.push(status); }

        // Nếu có ít nhất 1 điều kiện → ghép thành mệnh đề WHERE ... AND ...
        if (conds.length) sql += ' WHERE ' + conds.join(' AND ');

        // Sắp xếp kết quả: mới cập nhật nhất lên đầu, nếu bằng nhau thì id lớn hơn lên trước
        sql += ' ORDER BY updated_at DESC, id DESC';

        // Thực thi câu SQL xuống database, lấy mảng kết quả (rows)
        let [rows] = await db.query(sql, params);

        // Nếu có từ khóa search → lọc thêm theo tiêu đề (xử lý trong JS, không dùng SQL LIKE)
        if (search) {
            const kw = removeAccents(search.trim()); // Chuẩn hóa từ khóa: bỏ dấu + trim khoảng trắng
            // Giữ lại những truyện có tiêu đề (sau khi bỏ dấu) chứa từ khóa
            rows = rows.filter(c => removeAccents(c.title).includes(kw));
        }

        // Trả về kết quả thành công: số lượng truyện tìm được và mảng dữ liệu
        res.json({ success: true, count: rows.length, data: rows });
    } catch (e) { fail(res, 500, e.message); } // Bắt lỗi bất ngờ → trả 500
};

// Lấy chi tiết 1 truyện theo ID, kèm số lượt theo dõi
exports.getComicDetail = async (req, res) => {
    try {
        // Query lấy truyện theo id từ URL params (:id), dùng destructuring [[comic]] để lấy phần tử đầu tiên
        const [[comic]] = await db.query('SELECT * FROM comics WHERE id=?', [req.params.id]);

        // Nếu không tìm thấy truyện → trả lỗi 404
        if (!comic) return fail(res, 404, 'Không tìm thấy truyện');

        try {
            // Đếm số người đang theo dõi truyện này trong bảng follows
            const [[fc]] = await db.query('SELECT COUNT(*) as cnt FROM follows WHERE comic_id=?', [req.params.id]);
            // Gắn thêm trường followers_count vào object comic
            comic.followers_count = fc.cnt;
        } catch { comic.followers_count = 0; } // Nếu bảng follows lỗi → mặc định 0, không crash

        // Trả về thông tin chi tiết truyện
        res.json({ success: true, data: comic });
    } catch (e) { fail(res, 500, e.message); }
};

// Lấy danh sách chương của 1 truyện
exports.getChapters = async (req, res) => {
    try {
        // Kiểm tra truyện có tồn tại không (chỉ lấy id và title để nhẹ hơn SELECT *)
        const [[comic]] = await db.query('SELECT id, title FROM comics WHERE id=?', [req.params.id]);
        if (!comic) return fail(res, 404, 'Không tìm thấy truyện');

        // Lấy danh sách chương của truyện, sắp xếp giảm dần (chương mới nhất lên đầu)
        // Chỉ lấy các cột cần thiết, không lấy content (nội dung chương) để tránh response quá nặng
        const [rows] = await db.query(
            'SELECT id, comic_id, chapter_number, created_at FROM chapters WHERE comic_id=? ORDER BY chapter_number DESC',
            [req.params.id]
        );

        // Trả về thông tin truyện + danh sách chương
        res.json({ success: true, comic_id: comic.id, comic_title: comic.title, count: rows.length, data: rows });
    } catch (e) { fail(res, 500, e.message); }
};

// ===== BÌNH LUẬN =====

// Lấy tất cả bình luận của 1 truyện (có kèm các reply con)
exports.getComments = async (req, res) => {
    try {
        // Kiểm tra truyện tồn tại
        const [[comic]] = await db.query('SELECT id, title FROM comics WHERE id=?', [req.params.id]);
        if (!comic) return fail(res, 404, 'Không tìm thấy truyện');

        // Lấy các bình luận gốc (không phải reply): parent_id IS NULL hoặc = 0
        // Sắp xếp mới nhất lên đầu
        const [top] = await db.query(
            'SELECT * FROM comments WHERE comic_id=? AND (parent_id IS NULL OR parent_id=0) ORDER BY created_at DESC',
            [req.params.id]
        );

        // Với mỗi bình luận gốc → truy vấn thêm các reply con của nó
        for (const c of top) {
            // Lấy reply theo parent_id, sắp xếp tăng dần (reply cũ nhất hiển thị trước)
            const [replies] = await db.query('SELECT * FROM comments WHERE parent_id=? ORDER BY created_at ASC', [c.id]);
            // Gắn mảng replies vào object bình luận cha
            c.replies = replies;
        }

        // Trả về danh sách bình luận (mỗi item đã có mảng replies nhúng bên trong)
        res.json({ success: true, comic_id: comic.id, comic_title: comic.title, count: top.length, data: top });
    } catch (e) { fail(res, 500, e.message); }
};

// Đăng bình luận mới (hoặc reply vào bình luận khác)
exports.postComment = async (req, res) => {
    try {
        // Đọc dữ liệu từ request body: nội dung, tên người dùng, và id bình luận cha (nếu là reply)
        const { content, userName, parentId } = req.body;

        // Nội dung bình luận không được để trống
        if (!content?.trim()) return fail(res, 400, 'Nội dung không được để trống');

        // Ưu tiên lấy username từ token đã xác thực (req.user), sau đó từ body, cuối cùng dùng 'Ẩn danh'
        const finalName = req.user?.username || userName?.trim() || 'Ẩn danh';

        // Kiểm tra truyện tồn tại
        const [[comic]] = await db.query('SELECT id, title FROM comics WHERE id=?', [req.params.id]);
        if (!comic) return fail(res, 404, 'Không tìm thấy truyện');

        // Chèn bình luận mới vào database
        // parentId = null nếu là bình luận gốc, có giá trị nếu là reply
        const [result] = await db.query(
            'INSERT INTO comments (comic_id, user_name, content, parent_id) VALUES (?,?,?,?)',
            [req.params.id, finalName, content.trim(), parentId || null]
        );

        // Trả về thông tin bình luận vừa tạo (kèm insertId để frontend cập nhật UI ngay)
        res.json({ success: true, comic_id: comic.id, comic_title: comic.title, data: { id: result.insertId, user_name: finalName, content: content.trim() } });
    } catch (e) { fail(res, 500, e.message); }
};

// Xóa bình luận (chỉ chủ sở hữu mới được xóa)
exports.deleteComment = async (req, res) => {
    try {
        // Tìm bình luận theo id (:cid trong URL)
        const [[c]] = await db.query('SELECT * FROM comments WHERE id=?', [req.params.cid]);
        if (!c) return fail(res, 404, 'Không tìm thấy bình luận');

        // Kiểm tra quyền: username của người đăng phải trùng với người đang đăng nhập
        if (c.user_name !== req.user.username) return fail(res, 403, 'Không có quyền xóa');

        // Lấy thông tin truyện để gắn vào response
        const [[comic]] = await db.query('SELECT id, title FROM comics WHERE id=?', [req.params.id]);

        // Xóa các reply con trước (tránh lỗi khóa ngoại hoặc dữ liệu mồ côi)
        await db.query('DELETE FROM comments WHERE parent_id=?', [req.params.cid]);

        // Xóa bình luận cha
        await db.query('DELETE FROM comments WHERE id=?', [req.params.cid]);

        res.json({ success: true, comic_id: parseInt(req.params.id), comic_title: comic?.title || '' });
    } catch (e) { fail(res, 500, e.message); }
};

// ===== THEO DÕI =====

// Theo dõi một truyện (toggle follow)
exports.followComic = async (req, res) => {
    try {
        // Lấy id truyện từ URL và id người dùng từ token xác thực
        const comicId = req.params.id, userId = req.user.id;

        // Kiểm tra truyện tồn tại
        const [[comic]] = await db.query('SELECT id, title FROM comics WHERE id=?', [comicId]);
        if (!comic) return fail(res, 404, 'Không tìm thấy truyện');

        // Kiểm tra người dùng đã theo dõi chưa (tìm record trong bảng follows)
        const [[ex]] = await db.query('SELECT id FROM follows WHERE comic_id=? AND user_id=?', [comicId, userId]);

        // Nếu đã theo dõi rồi → trả về thông báo "đã theo dõi" mà không insert thêm
        if (ex) {
            const [[fc]] = await db.query('SELECT COUNT(*) as cnt FROM follows WHERE comic_id=?', [comicId]);
            return res.json({ success: true, comic_id: comic.id, comic_title: comic.title, message: 'Đã theo dõi rồi', already: true, following: true, followers: fc.cnt });
        }

        // Chưa theo dõi → thêm record vào bảng follows
        await db.query('INSERT INTO follows (comic_id, user_id) VALUES (?,?)', [comicId, userId]);

        // Tăng followers_count trong bảng comics (dùng COALESCE để tránh lỗi NULL+1)
        await db.query('UPDATE comics SET followers_count=COALESCE(followers_count,0)+1 WHERE id=?', [comicId]);

        // Đọc lại số lượt follow thực tế từ DB (đảm bảo chính xác)
        const [[fc2]] = await db.query('SELECT COUNT(*) as cnt FROM follows WHERE comic_id=?', [comicId]);

        res.json({ success: true, comic_id: comic.id, comic_title: comic.title, message: 'Đã theo dõi!', following: true, followers: fc2.cnt });
    } catch (e) { console.error('[followComic]', e.message); fail(res, 500, e.message); }
};

// Bỏ theo dõi một truyện
exports.unfollowComic = async (req, res) => {
    try {
        const comicId = req.params.id, userId = req.user.id;

        // Kiểm tra truyện tồn tại
        const [[comic]] = await db.query('SELECT id, title FROM comics WHERE id=?', [comicId]);
        if (!comic) return fail(res, 404, 'Không tìm thấy truyện');

        // Xóa record theo dõi trong bảng follows, lấy kết quả để kiểm tra có xóa được không
        const [r] = await db.query('DELETE FROM follows WHERE comic_id=? AND user_id=?', [comicId, userId]);

        // Nếu thực sự có xóa được (tức trước đó đang follow) → giảm followers_count
        // GREATEST(..., 0) đảm bảo không bị âm nếu dữ liệu không đồng bộ
        if (r.affectedRows > 0) await db.query('UPDATE comics SET followers_count=GREATEST(COALESCE(followers_count,0)-1,0) WHERE id=?', [comicId]);

        // Đọc lại số lượt follow thực tế
        const [[fc]] = await db.query('SELECT COUNT(*) as cnt FROM follows WHERE comic_id=?', [comicId]);

        res.json({ success: true, comic_id: comic.id, comic_title: comic.title, message: 'Đã bỏ theo dõi', following: false, followers: fc.cnt });
    } catch (e) { console.error('[unfollowComic]', e.message); fail(res, 500, e.message); }
};

// Kiểm tra trạng thái theo dõi của người dùng với một truyện
exports.getFollowStatus = async (req, res) => {
    try {
        // Kiểm tra truyện tồn tại
        const [[comic]] = await db.query('SELECT id, title FROM comics WHERE id=?', [req.params.id]);
        if (!comic) return fail(res, 404, 'Không tìm thấy truyện');

        let isFollowing = false; // Mặc định là chưa theo dõi

        // Chỉ kiểm tra nếu người dùng đã đăng nhập (có req.user)
        if (req.user) {
            const [[ex]] = await db.query('SELECT id FROM follows WHERE comic_id=? AND user_id=?', [req.params.id, req.user.id]);
            isFollowing = !!ex; // Chuyển object → boolean (có record = true, null = false)
        }

        // Đếm tổng số người theo dõi truyện này
        const [[fc]] = await db.query('SELECT COUNT(*) as cnt FROM follows WHERE comic_id=?', [req.params.id]);

        res.json({ success: true, comic_id: comic.id, comic_title: comic.title, data: { is_following: isFollowing, followers_count: fc.cnt } });
    } catch (e) { fail(res, 500, e.message); }
};

// ===== TOP =====

// Lấy danh sách truyện được theo dõi nhiều nhất
exports.getTopFollowed = async (req, res) => {
    try {
        // Xác định chiều sắp xếp: mặc định DESC (nhiều nhất lên đầu), cho phép đổi sang ASC
        const order = req.query.order === 'asc' ? 'ASC' : 'DESC';

        // Giới hạn số lượng kết quả: mặc định 10, tối đa 50 (tránh query quá nặng)
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);

        // JOIN bảng comics với follows, đếm số lượt follow cho mỗi truyện
        // LEFT JOIN để giữ lại cả truyện chưa có ai follow (follow_count = 0)
        const [rows] = await db.query(
            `SELECT c.id, c.title, c.image, c.category, c.status, c.latest_chapter, c.views,
                    COUNT(f.id) as follow_count
             FROM comics c LEFT JOIN follows f ON c.id = f.comic_id
             GROUP BY c.id ORDER BY follow_count ${order} LIMIT ?`, [limit]
        );

        res.json({ success: true, data: rows });
    } catch (e) { fail(res, 500, e.message); }
};

// ===== ADMIN =====

// Thêm truyện mới (chỉ admin)
exports.addComic = async (req, res) => {
    try {
        // Đọc thông tin truyện từ request body
        const { title, category, author, description, image, status, is_hot, views } = req.body;

        // Tên truyện là bắt buộc
        if (!title) return fail(res, 400, 'Thiếu tên truyện');

        // Insert truyện vào DB với các giá trị mặc định nếu không truyền lên
        const [r] = await db.query(
            'INSERT INTO comics (title, category, author, description, image, status, is_hot, views) VALUES (?,?,?,?,?,?,?,?)',
            [title, category||'Manga', author||'', description||'', image||'', status||'Đang tiến hành', is_hot ? 1 : 0, parseInt(views)||0]
        );

        // Trả về id của truyện vừa thêm
        res.json({ success: true, data: { id: r.insertId }, message: 'Thêm truyện thành công' });
    } catch (e) { fail(res, 500, e.message); }
};

// ★ FIX CHÍNH: thêm is_hot + views → admin cập nhật HOT được lưu vào DB
// Trước khi fix: UPDATE không có is_hot → index.html luôn không hiển thị HOT sau khi admin sửa
// Cập nhật thông tin truyện (chỉ admin)
exports.updateComic = async (req, res) => {
    try {
        // Lấy thông tin truyện hiện tại từ DB để dùng làm giá trị fallback
        const [[c]] = await db.query('SELECT * FROM comics WHERE id=?', [req.params.id]);
        if (!c) return fail(res, 404, 'Không tìm thấy truyện');

        // Đọc các trường cần cập nhật từ body
        const { title, category, author, description, image, status, is_hot, views } = req.body;

        // Xử lý is_hot: nếu body có truyền → dùng giá trị đó (ép về 0/1), không có → giữ nguyên DB
        const hotVal   = (is_hot  !== undefined && is_hot  !== null) ? (is_hot  ? 1 : 0) : (c.is_hot  || 0);

        // Xử lý views tương tự: nếu body có truyền → parse sang số, không có → giữ nguyên DB
        const viewsVal = (views   !== undefined && views   !== null) ? parseInt(views)    : (c.views   || 0);

        // Thực hiện UPDATE, dùng ?? (nullish coalescing) để fallback về giá trị cũ nếu field không được truyền lên
        await db.query(
            'UPDATE comics SET title=?, category=?, author=?, description=?, image=?, status=?, is_hot=?, views=?, updated_at=NOW() WHERE id=?',
            [title??c.title, category??c.category, author??c.author, description??c.description,
             image??c.image, status??c.status, hotVal, viewsVal, req.params.id]
        );

        res.json({ success: true, message: 'Đã cập nhật truyện' });
    } catch (e) { fail(res, 500, e.message); }
};

// Xóa truyện và toàn bộ dữ liệu liên quan (chỉ admin)
exports.deleteComic = async (req, res) => {
    try {
        const id = req.params.id;

        // Xóa ratings của truyện (dùng try/catch riêng phòng bảng không tồn tại)
        try { await db.query('DELETE FROM ratings WHERE comic_id=?', [id]); } catch {}

        // Xóa danh sách theo dõi của truyện
        try { await db.query('DELETE FROM follows WHERE comic_id=?', [id]); } catch {}

        // Xóa toàn bộ bình luận của truyện
        await db.query('DELETE FROM comments WHERE comic_id=?', [id]);

        // Xóa toàn bộ chương của truyện
        await db.query('DELETE FROM chapters WHERE comic_id=?', [id]);

        // Xóa lịch sử đọc liên quan đến truyện này
        try { await db.query('DELETE FROM history WHERE comic_id=?', [id]); } catch {}

        // Cuối cùng mới xóa truyện chính (xóa sau cùng để tránh lỗi khóa ngoại)
        await db.query('DELETE FROM comics WHERE id=?', [id]);

        res.json({ success: true, message: 'Đã xóa truyện' });
    } catch (e) { fail(res, 500, e.message); }
};

// Xóa bình luận bằng quyền admin (không cần kiểm tra chủ sở hữu)
exports.adminDeleteComment = async (req, res) => {
    try {
        // Xóa các reply con của bình luận trước
        await db.query('DELETE FROM comments WHERE parent_id=?', [req.params.cid]);

        // Xóa bình luận cha
        await db.query('DELETE FROM comments WHERE id=?', [req.params.cid]);

        res.json({ success: true });
    } catch (e) { fail(res, 500, e.message); }
};

// Thêm chương mới vào truyện (chỉ admin)
exports.addChapter = async (req, res) => {
    try {
        // Hỗ trợ cả 2 cách đặt tên field: chapterNumber (camelCase) hoặc chapter_number (snake_case)
        const num = req.body.chapterNumber || req.body.chapter_number;
        if (!num) return fail(res, 400, 'Thiếu số chương');

        // Kiểm tra truyện tồn tại
        const [[comic]] = await db.query('SELECT id, title FROM comics WHERE id=?', [req.params.id]);
        if (!comic) return fail(res, 404, 'Không tìm thấy truyện');

        // Thêm chương vào bảng chapters
        const [r] = await db.query(
            'INSERT INTO chapters (comic_id, chapter_number, content) VALUES (?,?,?)',
            [req.params.id, parseInt(num), req.body.content||'']
        );

        // Cập nhật latest_chapter trong bảng comics CHỈ KHI chương mới lớn hơn chương hiện tại
        // Tránh ghi đè chương cũ hơn lên latest_chapter
        await db.query(
            'UPDATE comics SET latest_chapter=?, updated_at=NOW() WHERE id=? AND (latest_chapter IS NULL OR latest_chapter<?)',
            [parseInt(num), req.params.id, parseInt(num)]
        );

        res.json({ success: true, comic_id: comic.id, comic_title: comic.title, message: `Đã thêm chương ${num}`, data: { id: r.insertId } });
    } catch (e) { fail(res, 500, e.message); }
};

// Xóa một chương của truyện (chỉ admin)
exports.deleteChapter = async (req, res) => {
    try {
        // Xóa theo cặp comic_id + chapter_number (tránh xóa nhầm chương của truyện khác)
        await db.query('DELETE FROM chapters WHERE comic_id=? AND chapter_number=?', [req.params.id, req.params.chapterNum]);
        res.json({ success: true });
    } catch (e) { fail(res, 500, e.message); }
};

// Tăng lượt xem khi người dùng đọc truyện
exports.addView = async (req, res) => {
    try {
        // Tăng views lên 1, COALESCE đảm bảo không bị lỗi nếu views đang là NULL
        await db.query('UPDATE comics SET views=COALESCE(views,0)+1 WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); } // Lỗi view không nghiêm trọng → không trả 500
};
