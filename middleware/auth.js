/* FILE: assets/js/auth.js */
/* ★ FIX / MỚI:
 *  1. showProfile: thêm phone, fullname, birthday vào form chỉnh sửa
 *  2. _saveProfile: gửi phone, fullname, birthday lên API
 *  3. Auth.save: lưu thêm phone, fullname, birthday vào localStorage
 */
const _AUTH_API = 'http://localhost:5000/api';

function removeVietnameseTones(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim();
}

const Auth = {
    save: function(userData) {
        const existing = this.get() || {};
        localStorage.setItem('currentUser', JSON.stringify({
            id:       userData.id,
            username: userData.username,
            email:    userData.email,
            role:     userData.role     || 'user',
            token:    userData.token,
            avatar:   userData.avatar   || existing.avatar   || null,
            phone:    userData.phone    || existing.phone    || null,
            fullname: userData.fullname || existing.fullname || null,
            birthday: userData.birthday || existing.birthday || null,
        }));
    },
    get: function() {
        try { return JSON.parse(localStorage.getItem('currentUser')) || null; } catch { return null; }
    },
    logout: function() { localStorage.removeItem('currentUser'); window.location.href = 'login.html'; },
    saveHistory: function(comicId, chapter) {
        try {
            let hist = JSON.parse(localStorage.getItem('readHistoryObj') || '[]');
            hist = hist.filter(h => h.id != comicId);
            hist.unshift({ id: comicId, chapter: chapter });
            localStorage.setItem('readHistoryObj', JSON.stringify(hist.slice(0, 20)));
        } catch(e) {}
        const user = this.get();
        if (user && user.token) {
            fetch(_AUTH_API + '/auth/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + user.token },
                body: JSON.stringify({ comicId: comicId, chapter: chapter })
            }).catch(() => {});
        }
    },

    updateHeader: function() {
        const user = this.get();
        const btn  = document.getElementById('userNavBtn');
        if (!btn) return;
        if (user) {
            const isAdmin = user.role === 'admin';
            const avatarHtml = user.avatar
                ? `<img src="${user.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid var(--primary-red);" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div style="display:none;width:32px;height:32px;border-radius:50%;background:var(--primary-red);color:white;font-weight:bold;font-size:14px;align-items:center;justify-content:center;">${user.username.charAt(0).toUpperCase()}</div>`
                : `<div style="width:32px;height:32px;border-radius:50%;background:var(--primary-red);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:14px;">${user.username.charAt(0).toUpperCase()}</div>`;
            btn.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;cursor:pointer;" onclick="toggleUserMenu()">${avatarHtml}</div>
                <div id="userMenu" style="display:none;position:absolute;top:50px;right:0;background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);min-width:210px;z-index:9999;overflow:hidden;border:1px solid #f0f0f0;">
                    <div style="padding:14px 16px;border-bottom:1px solid #f5f5f5;">
                        <div style="font-size:13px;color:#888;">Xin chào,</div>
                        <div style="font-weight:800;color:#333;font-size:14px;">${user.username} ${isAdmin ? '<span style="background:#e63946;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px;margin-left:4px;">ADMIN</span>' : ''}</div>
                    </div>
                    <div onclick="Auth.showProfile()" style="padding:11px 16px;cursor:pointer;font-size:14px;color:#333;font-weight:600;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f8f8f8;" onmouseover="this.style.background='#f8f8f8'" onmouseout="this.style.background=''">
                        <i class="fas fa-user-circle" style="color:#3b82f6;width:18px;text-align:center;"></i> Trang cá nhân
                    </div>
                    <div onclick="Auth.showFollows()" style="padding:11px 16px;cursor:pointer;font-size:14px;color:#333;font-weight:600;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f8f8f8;" onmouseover="this.style.background='#f8f8f8'" onmouseout="this.style.background=''">
                        <i class="fas fa-heart" style="color:#e63946;width:18px;text-align:center;"></i> Truyện theo dõi
                    </div>
                    <div onclick="Auth.showHistory()" style="padding:11px 16px;cursor:pointer;font-size:14px;color:#333;font-weight:600;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f8f8f8;" onmouseover="this.style.background='#f8f8f8'" onmouseout="this.style.background=''">
                        <i class="fas fa-history" style="color:#f59e0b;width:18px;text-align:center;"></i> Lịch sử đọc
                    </div>
                    ${isAdmin ? `<div onclick="location.href='admin.html'" style="padding:11px 16px;cursor:pointer;font-size:14px;color:#333;font-weight:600;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f8f8f8;" onmouseover="this.style.background='#f8f8f8'" onmouseout="this.style.background=''">
                        <i class="fas fa-cog" style="color:#8b5cf6;width:18px;text-align:center;"></i> Trang quản trị
                    </div>` : ''}
                    <div onclick="Auth.logout()" style="padding:11px 16px;cursor:pointer;font-size:14px;color:#e63946;font-weight:600;display:flex;align-items:center;gap:10px;" onmouseover="this.style.background='#fff0f1'" onmouseout="this.style.background=''">
                        <i class="fas fa-sign-out-alt" style="width:18px;text-align:center;"></i> Đăng xuất
                    </div>
                </div>`;
        } else {
            btn.innerHTML = `<a href="login.html" style="display:flex;align-items:center;gap:6px;color:inherit;text-decoration:none;font-size:14px;font-weight:600;"><i class="fas fa-user-circle" style="font-size:22px;"></i> <span class="hide-mobile">Đăng nhập</span></a>`;
        }
    },

    /* ★ TRANG CÁ NHÂN - đầy đủ phone, fullname, birthday, avatar */
    showProfile: async function() {
        const user = this.get();
        if (!user) { location.href = 'login.html'; return; }

        // Fetch thông tin mới nhất từ server
        let profile = { ...user };
        try {
            const r = await fetch(_AUTH_API + '/auth/me', { headers: { 'Authorization': 'Bearer ' + user.token } });
            const d = await r.json();
            if (d.success && d.data) { profile = { ...user, ...d.data }; this.save(profile); }
        } catch {}

        let modal = document.getElementById('__profileModal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = '__profileModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';

        const initials = (profile.username||'U').charAt(0).toUpperCase();
        const avatarSrc = profile.avatar || '';
        const avatarHtml = avatarSrc
            ? `<img src="${avatarSrc}" id="__profAvatarImg" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`
            : `<span id="__profAvatarLetter">${initials}</span>`;

        modal.innerHTML = `
        <div style="background:#fff;border-radius:18px;width:520px;max-width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.25);">
            <div style="background:linear-gradient(135deg,#e63946,#c1121f);padding:28px 24px 22px;border-radius:18px 18px 0 0;position:sticky;top:0;z-index:2;">
                <button onclick="document.getElementById('__profileModal').remove()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.2);border:none;color:#fff;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;">×</button>
                <div style="display:flex;align-items:center;gap:18px;">
                    <div id="__profAvatarCircle" onclick="document.getElementById('__profAvatarFile').click()" title="Click để đổi ảnh"
                        style="width:76px;height:76px;border-radius:50%;background:rgba(255,255,255,0.25);border:3px solid rgba(255,255,255,0.6);overflow:hidden;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#fff;position:relative;">
                        ${avatarHtml}
                        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.32);display:flex;align-items:center;justify-content:center;opacity:0;transition:.2s;border-radius:50%;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0"><i class="fas fa-camera" style="color:#fff;font-size:20px;"></i></div>
                    </div>
                    <input type="file" id="__profAvatarFile" accept="image/*" style="display:none" onchange="Auth._handleAvatarUpload(this)">
                    <div>
                        <div style="font-size:19px;font-weight:900;color:#fff;">${profile.fullname || profile.username}</div>
                        <div style="font-size:13px;color:rgba(255,255,255,0.82);margin-top:2px;">@${profile.username}</div>
                        <span style="display:inline-block;margin-top:6px;background:rgba(255,255,255,0.2);padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700;color:#fff;">${profile.role==='admin'?'👑 Admin':'📖 Độc giả'}</span>
                    </div>
                </div>
            </div>

            <div style="padding:22px 24px;">
                <!-- Avatar - upload file + URL -->
                <div style="margin-bottom:16px;">
                    <label style="font-size:11px;font-weight:800;color:#e63946;text-transform:uppercase;display:block;margin-bottom:8px;"><i class="fas fa-image"></i> ẢNH ĐẠI DIỆN</label>
                    
                    <!-- Nút tải ảnh từ máy tính -->
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:10px 14px;background:#fff8f8;border:1.5px dashed #f5a0a6;border-radius:10px;">
                        <button onclick="document.getElementById('__profAvatarFile').click()"
                            style="background:#e63946;color:#fff;border:none;padding:9px 16px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:7px;white-space:nowrap;flex-shrink:0;">
                            <i class="fas fa-upload"></i> Tải ảnh từ máy
                        </button>
                        <div id="__profFileName" style="font-size:12px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">
                            Chưa chọn file (JPG, PNG, WEBP — tối đa 3MB)
                        </div>
                    </div>

                    <!-- Hoặc dán link URL -->
                    <div style="font-size:11px;color:#aaa;margin-bottom:6px;display:flex;align-items:center;gap:8px;">
                        <hr style="flex:1;border:none;border-top:1px solid #f0f0f0;">
                        <span>hoặc dán link URL</span>
                        <hr style="flex:1;border:none;border-top:1px solid #f0f0f0;">
                    </div>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="__profAvatarUrl" placeholder="https://..." value="${avatarSrc}"
                            style="flex:1;padding:10px 12px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:14px;outline:none;min-width:0;"
                            onfocus="this.style.borderColor='#e63946'" onblur="this.style.borderColor='#e0e0e0'">
                        <button onclick="Auth._applyAvatarUrl()" style="background:#e63946;color:#fff;border:none;padding:10px 14px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;">Áp dụng</button>
                    </div>
                </div>

                <hr style="border:none;border-top:1.5px solid #f0f0f0;margin:0 0 16px;">
                <div style="font-size:11px;font-weight:800;color:#e63946;text-transform:uppercase;margin-bottom:12px;"><i class="fas fa-user"></i> THÔNG TIN CÁ NHÂN</div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                    <div>
                        <label style="font-size:11px;color:#888;font-weight:700;display:block;margin-bottom:5px;text-transform:uppercase;">Tên đăng nhập</label>
                        <input type="text" value="${profile.username}" readonly
                            style="width:100%;padding:10px 12px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:14px;background:#f8f9fa;color:#aaa;cursor:not-allowed;box-sizing:border-box;">
                        <div style="font-size:10px;color:#ccc;margin-top:2px;">Không thể thay đổi</div>
                    </div>
                    <div>
                        <label style="font-size:11px;color:#888;font-weight:700;display:block;margin-bottom:5px;text-transform:uppercase;">Họ và tên</label>
                        <input type="text" id="__profFullname" placeholder="Nhập họ và tên..." value="${profile.fullname||''}"
                            style="width:100%;padding:10px 12px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;"
                            onfocus="this.style.borderColor='#e63946'" onblur="this.style.borderColor='#e0e0e0'">
                    </div>
                </div>

                <div style="margin-bottom:12px;">
                    <label style="font-size:11px;color:#888;font-weight:700;display:block;margin-bottom:5px;text-transform:uppercase;">Email</label>
                    <input type="email" id="__profEmail" placeholder="email@example.com" value="${profile.email||''}"
                        style="width:100%;padding:10px 12px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;"
                        onfocus="this.style.borderColor='#e63946'" onblur="this.style.borderColor='#e0e0e0'">
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                    <div>
                        <label style="font-size:11px;color:#888;font-weight:700;display:block;margin-bottom:5px;text-transform:uppercase;"><i class="fas fa-phone" style="color:#aaa;"></i> Số điện thoại</label>
                        <input type="tel" id="__profPhone" placeholder="0912 345 678" value="${profile.phone||''}"
                            style="width:100%;padding:10px 12px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;"
                            onfocus="this.style.borderColor='#e63946'" onblur="this.style.borderColor='#e0e0e0'">
                    </div>
                    <div>
                        <label style="font-size:11px;color:#888;font-weight:700;display:block;margin-bottom:5px;text-transform:uppercase;"><i class="fas fa-birthday-cake" style="color:#aaa;"></i> Ngày sinh</label>
                        <input type="date" id="__profBirthday" value="${profile.birthday ? profile.birthday.substring(0,10) : ''}"
                            style="width:100%;padding:10px 12px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;"
                            onfocus="this.style.borderColor='#e63946'" onblur="this.style.borderColor='#e0e0e0'">
                    </div>
                </div>

                <hr style="border:none;border-top:1.5px solid #f0f0f0;margin:0 0 16px;">
                <div style="font-size:11px;font-weight:800;color:#e63946;text-transform:uppercase;margin-bottom:12px;"><i class="fas fa-lock"></i> ĐỔI MẬT KHẨU</div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                    <div>
                        <label style="font-size:11px;color:#888;font-weight:700;display:block;margin-bottom:5px;text-transform:uppercase;">Mật khẩu mới</label>
                        <input type="password" id="__profNewPw" placeholder="Để trống nếu không đổi"
                            style="width:100%;padding:10px 12px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;"
                            onfocus="this.style.borderColor='#e63946'" onblur="this.style.borderColor='#e0e0e0'">
                    </div>
                    <div>
                        <label style="font-size:11px;color:#888;font-weight:700;display:block;margin-bottom:5px;text-transform:uppercase;">Xác nhận mật khẩu</label>
                        <input type="password" id="__profConfirmPw" placeholder="Nhập lại mật khẩu mới"
                            style="width:100%;padding:10px 12px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;"
                            onfocus="this.style.borderColor='#e63946'" onblur="this.style.borderColor='#e0e0e0'">
                    </div>
                </div>

                <div id="__profMsg" style="display:none;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;"></div>

                <button onclick="Auth._saveProfile()"
                    style="width:100%;background:linear-gradient(135deg,#e63946,#c1121f);color:#fff;border:none;padding:14px;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;"
                    onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">
                    <i class="fas fa-save"></i> Lưu thay đổi
                </button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
    },

    _handleAvatarUpload: function(input) {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) { alert('Ảnh quá lớn! Tối đa 3MB.'); return; }

        // Cập nhật tên file hiển thị
        const nameEl = document.getElementById('__profFileName');
        if (nameEl) {
            nameEl.innerHTML = `<i class="fas fa-check-circle" style="color:#22c55e;"></i> <b>${file.name}</b> (${(file.size/1024).toFixed(0)}KB)`;
            nameEl.style.color = '#22c55e';
        }

        const reader = new FileReader();
        reader.onload = e => {
            const dataUrl = e.target.result;
            // Cập nhật preview avatar ở header
            const circle = document.getElementById('__profAvatarCircle');
            if (circle) circle.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;"><div style="position:absolute;inset:0;background:rgba(0,0,0,0.32);display:flex;align-items:center;justify-content:center;opacity:0;transition:.2s;border-radius:50%;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0"><i class="fas fa-camera" style="color:#fff;font-size:20px;"></i></div>`;
            // Điền vào input URL để _saveProfile dùng
            const urlInput = document.getElementById('__profAvatarUrl');
            if (urlInput) {
                urlInput.value = dataUrl;
                // Xóa placeholder text đi cho gọn
                urlInput.style.fontSize = '11px';
                urlInput.style.color = '#888';
                urlInput.value = '(ảnh từ máy — sẽ lưu khi nhấn Lưu thay đổi)';
                urlInput.dataset.realValue = dataUrl;
            }
        };
        reader.readAsDataURL(file);
    },

    _applyAvatarUrl: function() {
        const url = document.getElementById('__profAvatarUrl')?.value.trim();
        if (!url) return;
        const user = this.get();
        const init = (user?.username||'U').charAt(0).toUpperCase();
        const circle = document.getElementById('__profAvatarCircle');
        if (circle) circle.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'"><div style="position:absolute;inset:0;background:rgba(0,0,0,0.32);display:flex;align-items:center;justify-content:center;opacity:0;transition:.2s;border-radius:50%;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0"><i class="fas fa-camera" style="color:#fff;font-size:20px;"></i></div>`;
        this._showProfMsg('✅ Ảnh đã được cập nhật!', 'success');
    },

    _showProfMsg: function(msg, type) {
        const el = document.getElementById('__profMsg');
        if (!el) return;
        el.style.display = 'block';
        el.style.background = type === 'success' ? '#f0fdf4' : '#fff0f1';
        el.style.color  = type === 'success' ? '#16a34a' : '#dc2626';
        el.style.border = `1px solid ${type==='success'?'#bbf7d0':'#fecaca'}`;
        el.innerHTML = msg;
        if (type === 'success') setTimeout(() => { el.style.display='none'; }, 3000);
    },

    _saveProfile: async function() {
        const user = this.get();
        if (!user) return;
        const newPw     = document.getElementById('__profNewPw')?.value || '';
        const confirmPw = document.getElementById('__profConfirmPw')?.value || '';
        const email     = document.getElementById('__profEmail')?.value.trim() || '';
        const fullname  = document.getElementById('__profFullname')?.value.trim() || '';
        const phone     = document.getElementById('__profPhone')?.value.trim() || '';
        const birthday  = document.getElementById('__profBirthday')?.value || '';
        // Lấy ảnh: ưu tiên file upload (dataset.realValue), sau đó URL text
        const avatarInput = document.getElementById('__profAvatarUrl');
        const avatarUrl = (avatarInput?.dataset?.realValue) || (avatarInput?.value?.trim()) || '';

        if (newPw) {
            if (newPw.length < 6) { this._showProfMsg('❌ Mật khẩu phải có ít nhất 6 ký tự!', 'error'); return; }
            if (newPw !== confirmPw) { this._showProfMsg('❌ Mật khẩu xác nhận không khớp!', 'error'); return; }
        }

        const body = {};
        if (email)    body.email    = email;
        if (fullname) body.fullname = fullname;
        if (phone)    body.phone    = phone;
        if (birthday) body.birthday = birthday;
        if (newPw)    body.password = newPw;

        try {
            const r = await fetch(_AUTH_API + '/auth/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + user.token },
                body: JSON.stringify(body)
            });
            const d = await r.json();
            if (d.success) {
                const updated = { ...user, ...d.data, avatar: avatarUrl || user.avatar };
                this.save(updated);
                this.updateHeader();
                this._showProfMsg('✅ Đã lưu thay đổi thành công!', 'success');
            } else {
                this._showProfMsg('❌ ' + (d.message || 'Lỗi cập nhật!'), 'error');
            }
        } catch {
            if (avatarUrl) { user.avatar = avatarUrl; this.save(user); this.updateHeader(); }
            this._showProfMsg('⚠️ Server offline - đã lưu cục bộ', 'error');
        }
    },

    /* ===== MODAL THEO DÕI ===== */
    showFollows: async function() {
        const user = this.get();
        if (!user) { location.href = 'login.html'; return; }
        let modal = document.getElementById('__followModal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = '__followModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
        modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:560px;max-width:100%;max-height:82vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
            <div style="padding:18px 20px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;">
                <div style="font-size:16px;font-weight:800;color:#181c32;display:flex;align-items:center;gap:8px;"><i class="fas fa-heart" style="color:#e63946;"></i> Truyện đang theo dõi</div>
                <button onclick="document.getElementById('__followModal').remove()" style="border:none;background:#f4f4f5;color:#888;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;">&times;</button>
            </div>
            <div id="__followList" style="overflow-y:auto;padding:16px;flex:1;"><div style="text-align:center;padding:30px;color:#aaa;"><i class="fas fa-spinner fa-spin fa-2x"></i></div></div>
        </div>`;
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        try {
            const r = await fetch(_AUTH_API + '/auth/follows', { headers: { 'Authorization': 'Bearer ' + user.token } });
            const d = await r.json();
            const list = document.getElementById('__followList');
            if (!d.success || !d.data?.length) {
                list.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb;"><i class="fas fa-heart-broken fa-3x" style="margin-bottom:12px;display:block;"></i>Chưa theo dõi truyện nào</div>';
                return;
            }
            list.innerHTML = d.data.map(f => `
                <div onclick="location.href='detail.html?id=${f.comic_id}'" style="display:flex;align-items:center;gap:14px;padding:12px;cursor:pointer;border-bottom:1px solid #f5f5f5;border-radius:8px;" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
                    <img src="${f.image||'https://placehold.co/46x62'}" style="width:46px;height:62px;object-fit:cover;border-radius:6px;flex-shrink:0;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;font-size:14px;color:#181c32;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.title}</div>
                        <div style="font-size:12px;color:#888;margin-top:3px;">Ch. <b>${f.latest_chapter||'?'}</b></div>
                    </div>
                    <i class="fas fa-chevron-right" style="color:#ddd;flex-shrink:0;"></i>
                </div>`).join('');
        } catch {
            document.getElementById('__followList').innerHTML = `<div style="text-align:center;color:#e63946;padding:30px;">Lỗi tải dữ liệu</div>`;
        }
    },

    /* ===== MODAL LỊCH SỬ ===== */
    showHistory: async function() {
        const user = this.get();
        if (!user) { location.href = 'login.html'; return; }
        let modal = document.getElementById('__histModal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = '__histModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
        modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:560px;max-width:100%;max-height:82vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
            <div style="padding:18px 20px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;">
                <div style="font-size:16px;font-weight:800;color:#181c32;display:flex;align-items:center;gap:8px;"><i class="fas fa-history" style="color:#f59e0b;"></i> Lịch sử đọc</div>
                <button onclick="document.getElementById('__histModal').remove()" style="border:none;background:#f4f4f5;color:#888;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;">&times;</button>
            </div>
            <div id="__histList" style="overflow-y:auto;padding:16px;flex:1;"><div style="text-align:center;padding:30px;color:#aaa;"><i class="fas fa-spinner fa-spin fa-2x"></i></div></div>
        </div>`;
        document.body.appendChild(modal);
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        try {
            const r = await fetch(_AUTH_API + '/auth/history', { headers: { 'Authorization': 'Bearer ' + user.token } });
            const d = await r.json();
            const list = document.getElementById('__histList');
            if (!d.success || !d.data?.length) {
                list.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb;"><i class="fas fa-book-open fa-3x" style="margin-bottom:12px;display:block;"></i>Chưa có lịch sử đọc</div>';
                return;
            }
            list.innerHTML = d.data.map(h => `
                <div onclick="location.href='read.html?id=${h.comic_id}&chap=${h.chapter_read}'" style="display:flex;align-items:center;gap:14px;padding:12px;cursor:pointer;border-bottom:1px solid #f5f5f5;border-radius:8px;" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
                    <img src="${h.image||'https://placehold.co/46x62'}" style="width:46px;height:62px;object-fit:cover;border-radius:6px;flex-shrink:0;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;font-size:14px;color:#181c32;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${h.title}</div>
                        <div style="font-size:12px;color:#888;margin-top:3px;">Đang đọc <b style="color:#e63946;">Ch.${h.chapter_read}</b></div>
                    </div>
                    <span style="background:#e63946;color:#fff;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;flex-shrink:0;">Đọc tiếp</span>
                </div>`).join('');
        } catch {
            document.getElementById('__histList').innerHTML = `<div style="text-align:center;color:#e63946;padding:30px;">Lỗi tải dữ liệu</div>`;
        }
    }
};

function toggleUserMenu() {
    const menu = document.getElementById('userMenu');
    if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}