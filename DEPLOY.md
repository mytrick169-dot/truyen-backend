# Hướng dẫn Deploy lên Render (cực chi tiết)

---

## BƯỚC 1 — Tạo tài khoản GitHub (nếu chưa có)

1. Vào **https://github.com**
2. Nhấn **Sign up** (góc trên phải)
3. Điền email, password, username → xác nhận email
4. Đăng nhập vào GitHub

---

## BƯỚC 2 — Tạo database MySQL miễn phí trên Aiven

### 2.1 Đăng ký Aiven

1. Vào **https://aiven.io**
2. Nhấn **Get started free** (góc trên phải)
3. Chọn **Sign up with GitHub** (tiện hơn, dùng account GitHub vừa tạo)
4. Authorize → tạo xong tài khoản, vào trang Console

### 2.2 Tạo MySQL service

1. Nhấn **+ Create service** (nút xanh lớn giữa màn hình)
2. Chọn **MySQL** từ danh sách
3. Phần **Select service plan** → chọn **Free** (có chữ "Free forever")
4. Phần **Select cloud provider** → giữ nguyên
5. Phần **Select cloud region** → chọn **google-asia-southeast1** (Singapore, gần VN nhất)
6. Phần **Name your service** → đặt tên: `truyen-db`
7. Nhấn **Create service** (nút xanh dưới cùng)
8. Đợi ~2 phút, trạng thái chuyển từ **REBUILDING** sang **RUNNING** (chấm xanh)

### 2.3 Lấy thông tin kết nối

1. Nhấn vào service `truyen-db` vừa tạo
2. Nhấn tab **Overview**
3. Kéo xuống phần **Connection information** → nhìn thấy bảng sau:

   ```
   Host:     mysql-truyen-db-xxx.aivencloud.com
   Port:     12345
   User:     avnadmin
   Password: xxxxxxxxxxxx
   Database: defaultdb
   ```

4. Nhấn icon **copy** bên cạnh từng giá trị để copy

> **Lưu lại các giá trị này** — sẽ dùng ở Bước 4 và Bước 5

### 2.4 Tạo database tên `truyen_db`

1. Vẫn trong trang service `truyen-db`, nhấn tab **Databases**
2. Ô **Create a database** → gõ `truyen_db` → nhấn **Add database**
3. Thấy `truyen_db` xuất hiện trong danh sách là xong

---

## BƯỚC 3 — Chạy migrate để tạo bảng

### 3.1 Sửa file .env điền thông tin Aiven

Mở file [.env](.env) trong VS Code, sửa thành:

```
DB_HOST=    (dán Host từ Aiven vào đây)
DB_USER=    (dán User từ Aiven vào đây)
DB_PASSWORD=(dán Password từ Aiven vào đây)
DB_NAME=truyen_db
DB_PORT=    (dán Port từ Aiven vào đây)
DB_SSL=true

PORT=5000
```

**Ví dụ thực tế:**
```
DB_HOST=mysql-truyen-db-abc123.aivencloud.com
DB_USER=avnadmin
DB_PASSWORD=YOUR_AIVEN_PASSWORD_HERE
DB_NAME=truyen_db
DB_PORT=12345
DB_SSL=true

PORT=5000
```

### 3.2 Mở terminal trong VS Code

Nhấn **Ctrl + `** (phím backtick, cạnh số 1) để mở terminal

### 3.3 Chạy migrate

```bash
node Migrate.js
```

Nếu thành công sẽ thấy:
```
✅ Kết nối MySQL thành công!
📋 [1/7] Tạo bảng sessions... ✅
📋 [2/7] Kiểm tra bảng follows... ✅
...
```

Nếu lỗi `ECONNREFUSED` → kiểm tra lại Host, Port trong `.env`
Nếu lỗi `SSL` → đảm bảo `DB_SSL=true`

---

## BƯỚC 4 — Đẩy code lên GitHub

### 4.1 Tạo repository trên GitHub

1. Vào **https://github.com** → đăng nhập
2. Nhấn **+** (góc trên phải) → **New repository**
3. Điền:
   - **Repository name**: `baocaobackend`
   - **Public** hoặc **Private** (cả 2 đều được)
   - **KHÔNG** tích vào "Add a README file"
4. Nhấn **Create repository**
5. GitHub hiện trang trắng với đoạn lệnh → **copy phần URL** dạng:
   `https://github.com/TEN_BAN_CUA_BAN/baocaobackend.git`

### 4.2 Cài Git (nếu chưa có)

Mở terminal, gõ:
```bash
git --version
```

Nếu thấy `git version x.x.x` → đã có, bỏ qua bước này.
Nếu báo lỗi → tải Git tại **https://git-scm.com/download/win** → cài đặt → restart VS Code.

### 4.3 Cấu hình Git lần đầu (chỉ cần làm 1 lần)

```bash
git config --global user.email "email_github_cua_ban@gmail.com"
git config --global user.name "Ten cua ban"
```

### 4.4 Khởi tạo git và push code

Trong terminal VS Code (đang ở thư mục `baocaobackend`):

```bash
git init
git add .
git commit -m "Initial commit - TruyenHayPhaiDoc backend"
git remote add origin https://github.com/TEN_BAN_CUA_BAN/baocaobackend.git
git branch -M main
git push -u origin main
```

> Thay `TEN_BAN_CUA_BAN` bằng username GitHub thật của bạn.

Lần đầu push sẽ hỏi đăng nhập GitHub:
- **Username**: username GitHub
- **Password**: Không dùng password GitHub mà dùng **Personal Access Token**

### 4.5 Tạo Personal Access Token (nếu bị hỏi password)

1. Vào GitHub → avatar góc trên phải → **Settings**
2. Kéo xuống cuối → **Developer settings** (góc trái)
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token** → **Generate new token (classic)**
5. Điền **Note**: `deploy`, tick vào **repo** → **Generate token**
6. **Copy token ngay** (chỉ hiện 1 lần) → dùng làm password khi push

### 4.6 Kiểm tra push thành công

Vào `https://github.com/TEN_BAN_CUA_BAN/baocaobackend` — thấy code xuất hiện là xong.

---

## BƯỚC 5 — Deploy lên Render

### 5.1 Đăng ký Render

1. Vào **https://render.com**
2. Nhấn **Get started for free**
3. Chọn **Sign in with GitHub** → Authorize Render
4. Vào được Dashboard

### 5.2 Tạo Web Service

1. Nhấn **New +** (góc trên phải, màu tím)
2. Chọn **Web Service**
3. Phần **Connect a repository**:
   - Nếu thấy repo `baocaobackend` trong danh sách → nhấn **Connect**
   - Nếu không thấy → nhấn **Configure account** → cho phép Render truy cập repo → quay lại

### 5.3 Cấu hình service

Điền các thông tin sau:

| Trường | Giá trị |
|--------|---------|
| **Name** | `truyen-hay-phai-doc` |
| **Region** | Singapore (SEA) |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** |

### 5.4 Thêm biến môi trường

Kéo xuống phần **Environment Variables** → nhấn **Add Environment Variable** từng cái:

| Key | Value |
|-----|-------|
| `DB_HOST` | (Host từ Aiven — vd: `mysql-xxx.aivencloud.com`) |
| `DB_USER` | (User từ Aiven — vd: `avnadmin`) |
| `DB_PASSWORD` | (Password từ Aiven) |
| `DB_NAME` | `truyen_db` |
| `DB_PORT` | (Port từ Aiven — vd: `12345`) |
| `DB_SSL` | `true` |
| `NODE_ENV` | `production` |

### 5.5 Tạo và đợi deploy

1. Nhấn **Create Web Service** (nút tím dưới cùng)
2. Render bắt đầu build — xem log realtime bên phải
3. Đợi ~2-5 phút, thấy dòng:
   ```
   ✅ Kết nối MySQL thành công!
   🚀 Server: http://0.0.0.0:5000
   ```
   là deploy thành công!

---

## BƯỚC 6 — Lấy URL và chia sẻ

1. Góc trên trái trang Render hiển thị URL:
   ```
   https://truyen-hay-phai-doc.onrender.com
   ```
2. Nhấn vào link đó → thấy `{"success":true,"message":"✅ Backend TruyenHayPhaiDoc v3.0 đang chạy!"}` là OK

### Các URL quan trọng

| Mục đích | URL |
|----------|-----|
| Kiểm tra server | `https://truyen-hay-phai-doc.onrender.com/` |
| Swagger API Docs | `https://truyen-hay-phai-doc.onrender.com/api-docs` |
| Đăng ký | `POST .../api/auth/register` |
| Đăng nhập | `POST .../api/auth/login` |

**Chia sẻ link `/api-docs` cho ai cũng test được ngay trong trình duyệt!**

---

## XỬ LÝ LỖI THƯỜNG GẶP

### Lỗi: "Build failed" trên Render
→ Xem log lỗi → thường do thiếu package → chạy `npm install ten-package --save` → push lại

### Lỗi: "Cannot connect to database"
→ Kiểm tra lại các biến `DB_HOST`, `DB_PORT`, `DB_SSL=true` trong Environment Variables trên Render

### Lỗi: "Port already in use" ở local
→ Bình thường khi chạy local, không ảnh hưởng deploy

### Server trên Render bị sleep, vào chậm
→ Free tier sleep sau 15 phút không có request → lần đầu vào mất ~30 giây wake up → bình thường

---

## LƯU Ý QUAN TRỌNG VỀ ẢNH

Render **không lưu ảnh lâu dài** — ảnh upload lên sẽ mất khi server restart.

Nếu cần ảnh bền vĩnh, nói với Claude Code:
> "Tích hợp Cloudinary cho phần upload ảnh trong dự án này"
