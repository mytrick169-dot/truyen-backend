# TruyenHayPhaiDoc — Backend

API server cho web đọc truyện. Xây dựng bằng Node.js + Express + MySQL.

## Yêu cầu

- Node.js >= 18
- MySQL (XAMPP hoặc cài riêng)

## Cài đặt & chạy

```bash
# 1. Clone repo
git clone https://github.com/mytrick169-dot/truyen-backend.git
cd truyen-backend

# 2. Cài dependencies
npm install

# 3. Tạo file .env từ mẫu
copy .env.example .env
# Mở .env và điền thông tin database của bạn

# 4. Tạo database trong MySQL
mysql -u root -p -e "CREATE DATABASE truyen_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 5. Tạo bảng (migrate)
node Migrate.js

# 6. Khởi động server
npm start
```

Server chạy tại: http://localhost:5000

Swagger UI (test API): http://localhost:5000/api-docs

## Cấu hình .env

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=truyen_db
DB_PORT=3306
DB_SSL=false
PORT=5000
```
