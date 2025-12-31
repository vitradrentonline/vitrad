'use strict';

console.log('✅ App Started: Script Loaded Successfully');

// ============================================================
// 1. تنظیمات و توابع کمکی (Global Config & Helpers)
// ============================================================

// تشخیص آدرس سرور (لوکال یا لیارا)
const baseUrl = window.location.hostname.includes('liara.run') ? '' : 'http://localhost:3000';

const qs = (id) => document.getElementById(id);
const setTxt = (id, val) => { const el = qs(id); if (el) el.textContent = val || ''; };

// لودینگ
function __ensureLoadingOverlay() {
    let el = qs('loading-overlay') || qs('loading');
    if (!el) {
        el = document.createElement('div');
        el.id = 'loading-overlay';
        el.className = 'loading-overlay';
        el.innerHTML = '<div class="spinner"></div><p>در حال پردازش...</p>';
        document.body.appendChild(el);
    }
    return el;
}
window.showLoading = function() { const el = __ensureLoadingOverlay(); el.style.display = 'flex'; };
window.hideLoading = function() { const el = qs('loading-overlay') || qs('loading'); if (el) el.style.display = 'none'; };

// نمایش/مخفی کردن پسورد
window.togglePassword = function (id) {
    const input = qs(id);
    const icon = input?.nextElementSibling;
    if (input && icon) {
        input.type = input.type === 'password' ? 'text' : 'password';
        icon.textContent = input.type === 'password' ? '👁️' : '🙈';
    }
};

// پر کردن سلکت‌ها
function populateSelect(selectId, options) {
    const select = qs(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">انتخاب کنید</option>';
    if (Array.isArray(options)) {
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value || opt;
            option.textContent = opt.text || opt.title || opt;
            select.appendChild(option);
        });
    }
}

// داده‌های اولیه
let provinces = [], citiesByProvince = {}, tehranAreas = [], activityTypes = [], jobCategories = {};
let map, marker;

async function loadBaseData() {
    try {
        const [locRes, catRes] = await Promise.all([fetch('/locations.json'), fetch('/categories.json')]);
        if (locRes.ok) {
            const locData = await locRes.json();
            provinces = locData.provinces; citiesByProvince = locData.citiesByProvince; tehranAreas = locData.tehranAreas;
        }
        if (catRes.ok) {
            const catData = await catRes.json();
            activityTypes = catData.activityTypes; jobCategories = catData.jobCategories;
        }
    } catch (e) { console.error('Error loading base data:', e); }
}

// ============================================================
// 2. مدیریت فرم‌ها و شهرها
// ============================================================

window.handleCityChange = function () {
    const pSelect = qs('province'), cSelect = qs('city'), areaSection = qs('tehran-area-section');
    if (!pSelect || !cSelect || !areaSection) return;
    if (pSelect.value === 'tehran' && cSelect.value === 'tehran-city') {
        areaSection.style.display = 'block'; populateSelect('tehran_area', tehranAreas);
    } else { areaSection.style.display = 'none'; }
};

window.updateCities = function () {
    const pSelect = qs('province'), cSelect = qs('city');
    if (!pSelect || !cSelect) return;
    cSelect.innerHTML = '<option value="">انتخاب کنید</option>';
    if (pSelect.value && citiesByProvince[pSelect.value]) {
        citiesByProvince[pSelect.value].forEach(city => {
            const opt = document.createElement('option');
            opt.value = city.value; opt.textContent = city.text;
            cSelect.appendChild(opt);
        });
    }
    window.handleCityChange();
};

window.handleActivityChange = function() {
    const actSelect = qs('activity-type'), catSection = qs('job-category-section');
    if (actSelect && catSection) {
        const val = actSelect.value;
        if (val && jobCategories[val]) {
            populateSelect('job-category', jobCategories[val]);
            catSection.style.display = 'block';
        } else { catSection.style.display = 'none'; }
    }
    const section = qs('health-license-section');
    if (qs('activity-type') && section) {
        section.style.display = ['food', 'health'].includes(qs('activity-type').value) ? 'block' : 'none';
    }
};

window.validateFile = function (input) {
    const err = qs(`${input.id}-error`);
    if(err) err.textContent = '';
    const file = input.files[0];
    if (file && !file.type.startsWith('image/')) {
        if(err) err.textContent = 'فقط فایل تصویری مجاز است.';
        input.value = '';
    }
};

// ============================================================
// 3. احراز هویت
// ============================================================

window.nextStep = function (step) {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    const t = qs(`step${step}`); if(t) t.classList.add('active');
};
window.prevStep = (s) => window.nextStep(s);

window.validateAndNextStep = async function (step) {
    if (step !== 2) return window.nextStep(step);
    ['full_name-error', 'email-error', 'mobile-error', 'national_id-error'].forEach(id => setTxt(id, ''));
    
    const fullName = qs('full_name').value, email = qs('email').value, mobile = qs('mobile').value, nid = qs('national_id').value;
    let err = false;
    if (!fullName) { setTxt('full_name-error', 'الزامی'); err = true; }
    if (!/^09\d{9}$/.test(mobile)) { setTxt('mobile-error', 'نامعتبر'); err = true; }
    if (!/^\d{10}$/.test(nid)) { setTxt('national_id-error', 'نامعتبر'); err = true; }
    
    if (err) return;
    showLoading();
    try {
        const res = await fetch(`${baseUrl}/api/check-duplicates`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, mobile, national_id: nid })
        });
        const d = await res.json();
        if (d.duplicates?.email) setTxt('email-error', 'تکراری');
        else if (d.duplicates?.mobile) setTxt('mobile-error', 'تکراری');
        else if (d.duplicates?.national_id) setTxt('national_id-error', 'تکراری');
        else window.nextStep(2);
    } catch(e) { alert('خطای سرور'); } finally { hideLoading(); }
};

window.submitRegistration = async function () {
    const p1 = qs('password').value, p2 = qs('confirm_password').value;
    if (p1 !== p2 || p1.length < 4) return alert('رمز عبور نامعتبر است');
    
    showLoading();
    const fd = new FormData();
    ['full_name', 'email', 'mobile', 'national_id', 'password', 'province', 'city', 'referral_code'].forEach(k => {
        const el = qs(k); if(el) fd.append(k, el.value);
    });
    if(qs('tehran_area')) fd.append('tehran_area', qs('tehran_area').value);

    try {
        const res = await fetch(`${baseUrl}/api/register-user`, { method: 'POST', body: fd });
        const d = await res.json();
        if (d.success) {
            localStorage.setItem('email', qs('email').value);
            window.location.href = 'verify-otp.html';
        } else alert(d.message);
    } catch(e) { alert('Error'); } finally { hideLoading(); }
};

window.loginUser = async function () {
    showLoading();
    try {
        const res = await fetch(`${baseUrl}/api/login`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ identifier: qs('identifier').value, password: qs('password').value })
        });
        const d = await res.json();
        if (d.success) {
            localStorage.setItem('user', JSON.stringify(d.user));
            localStorage.setItem('shops', JSON.stringify(d.shops));
            localStorage.setItem('lastPassword', qs('password').value);
            window.location.href = 'user-panel.html';
        } else alert(d.message);
    } catch(e) { alert('Error'); } finally { hideLoading(); }
};

window.verifyOTP = async function () {
    const type = new URLSearchParams(window.location.search).get('type') || 'register';
    showLoading();
    try {
        const res = await fetch(`${baseUrl}/api/verify-otp`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email: localStorage.getItem('email'), otp: qs('otp').value, type })
        });
        const d = await res.json();
        if (d.success) {
            if(type === 'reset') { localStorage.setItem('resetToken', d.resetToken); window.location.href = 'reset-password.html'; }
            else window.location.href = 'login.html';
        } else alert(d.message);
    } catch(e) { alert('Error'); } finally { hideLoading(); }
};

// ============================================================
// 4. مدیریت فروشگاه (ایجاد، ویرایش، تایید)
// ============================================================

window.initMap = function() {
    if (qs('map') && !map) {
        map = L.map('map').setView([35.6892, 51.3890], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        marker = L.marker([35.6892, 51.3890], { draggable: true }).addTo(map);
        const up = (ll) => { marker.setLatLng(ll); qs('latitude').value = ll.lat; qs('longitude').value = ll.lng; };
        marker.on('dragend', (e) => up(e.target.getLatLng()));
        map.on('click', (e) => up(e.latlng));
    }
};

window.validateShopStep1 = function() {
    if (!qs('shop_name').value || !qs('activity-type').value) return alert('ناقص');
    window.nextStep(2); setTimeout(() => map?.invalidateSize(), 100);
};

window.validateShopStep2 = function() {
    if (!qs('province').value || !qs('address').value) return alert('ناقص');
    window.nextStep(3);
};

window.submitCreateShop = async function () {
    if (!qs('nationalCardImage').files[0] || !qs('selfieImage').files[0]) return alert('مدارک الزامی');
    showLoading();
    const user = JSON.parse(localStorage.getItem('user'));
    const fd = new FormData();
    fd.append('user_id', user._id);
    ['shop_name', 'shop_description', 'work_experience', 'activity_type', 'job_category', 
     'shop_phone', 'shop_email', 'province', 'city', 'address', 'tehran_area', 'latitude', 'longitude'].forEach(k => {
         const el = qs(k); if(el) fd.append(k, el.value);
    });
    ['nationalCardImage', 'selfieImage', 'businessLicenseImage', 'healthLicenseImage'].forEach(k => {
        const f = qs(k)?.files[0]; if(f) fd.append(k, f);
    });

    try {
        const res = await fetch(`${baseUrl}/api/initiate-shop-creation`, { method: 'POST', body: fd });
        const d = await res.json();
        if (d.success) {
            localStorage.setItem('shop_id_pending', d.shop_id);
            window.location.href = 'verify-shop-otp.html';
        } else alert(d.message);
    } catch(e) { alert('Error'); } finally { hideLoading(); }
};

window.verifyShopOTP = async function() {
    showLoading();
    try {
        const res = await fetch(`${baseUrl}/api/verify-shop-otp`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ shop_id: localStorage.getItem('shop_id_pending'), otp: qs('otp').value })
        });
        const d = await res.json();
        if (d.success) {
            alert('فروشگاه ثبت شد!');
            // رفرش کردن اطلاعات کاربر
            const u = JSON.parse(localStorage.getItem('user'));
            const lRes = await fetch(`${baseUrl}/api/login`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ identifier: u.email, password: localStorage.getItem('lastPassword') })
            });
            const lData = await lRes.json();
            if(lData.success) {
                localStorage.setItem('user', JSON.stringify(lData.user));
                localStorage.setItem('shops', JSON.stringify(lData.shops));
            }
            window.location.href = 'user-panel.html?my=true';
        } else alert(d.message);
    } catch(e) { alert('Error'); } finally { hideLoading(); }
};

// تابع جدید: لود اطلاعات برای ویرایش
window.loadShopProfileForEdit = async function(shopId) {
    showLoading();
    try {
        const res = await fetch(`${baseUrl}/api/shops/${shopId}/details`);
        const d = await res.json();
        if(d.success && d.data) {
            const s = d.data;
            if(qs('shop-score-display')) qs('shop-score-display').textContent = `امتیاز: ${s.rating}`;
            if(qs('logo-preview') && s.logoUrl) qs('logo-preview').src = s.logoUrl;
            
            setVal('edit-description', s.description);
            setVal('edit-phone', s.phone);
            setVal('edit-experience', s.experience);
            setVal('edit-address', s.address);
            setVal('edit-lat', s.lat);
            setVal('edit-lng', s.lng);
            
            if(s.socials) {
                setVal('edit-whatsapp', s.socials.whatsapp);
                setVal('edit-telegram', s.socials.telegram);
                setVal('edit-instagram', s.socials.instagram);
                setVal('edit-eitaa', s.socials.eitaa);
                setVal('edit-rubika', s.socials.rubika);
                setVal('edit-bale', s.socials.bale);
            }
            if(qs('edit-calls-enabled')) qs('edit-calls-enabled').checked = s.calls_enabled;
            if(qs('edit-call-windows') && s.call_windows) qs('edit-call-windows').value = JSON.stringify(s.call_windows);
        }
    } catch(e) { console.error(e); } finally { hideLoading(); }
};
function setVal(id, v) { const el = qs(id); if(el) el.value = v || ''; }

window.updateShopInfo = async function() {
    const shopId = new URLSearchParams(window.location.search).get('shop_id');
    const body = {
        shop_description: qs('edit-description').value,
        shop_phone: qs('edit-phone').value,
        work_experience: qs('edit-experience').value,
        address: qs('edit-address').value,
        whatsapp: qs('edit-whatsapp').value,
        telegram: qs('edit-telegram').value,
        instagram: qs('edit-instagram').value,
        eitaa: qs('edit-eitaa').value,
        rubika: qs('edit-rubika').value,
        bale: qs('edit-bale').value,
        calls_enabled: qs('edit-calls-enabled').checked
    };
    try {
        const w = qs('edit-call-windows').value;
        if(w) body.call_windows_json = w;
    } catch(e){}

    showLoading();
    try {
        await fetch(`${baseUrl}/api/update-shop/${shopId}`, {
            method: 'PUT', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        alert('ذخیره شد');
    } catch(e) { alert('Error'); } finally { hideLoading(); }
};

window.uploadBanner = async function() {
    const shopId = new URLSearchParams(window.location.search).get('shop_id');
    const file = qs('banner-upload').files[0];
    if(!file) return;
    showLoading();
    const fd = new FormData(); fd.append('banner', file);
    try {
        await fetch(`${baseUrl}/api/upload-banner/${shopId}`, { method: 'POST', body: fd });
        alert('بنر آپدیت شد'); window.location.reload();
    } catch(e) { alert('Error'); } finally { hideLoading(); }
};

window.saveLogo = async function() { // برای دکمه ذخیره لوگو
    const shopId = new URLSearchParams(window.location.search).get('shop_id');
    const file = qs('logo-input').files[0];
    if(!file) return;
    showLoading();
    const fd = new FormData(); fd.append('shopLogo', file);
    try {
        const res = await fetch(`${baseUrl}/api/shop/${shopId}/logo`, { method: 'POST', body: fd });
        const d = await res.json();
        if(d.success) { qs('logo-preview').src = d.newImageUrl; alert('لوگو آپدیت شد'); }
    } catch(e) { alert('Error'); } finally { hideLoading(); }
};
if(qs('save-logo-btn')) qs('save-logo-btn').onclick = window.saveLogo;
if(qs('logo-input')) qs('logo-input').onchange = (e) => { if(e.target.files[0]) qs('logo-preview').src = URL.createObjectURL(e.target.files[0]); };


// ============================================================
// 5. مدیریت محصولات (CRUD)
// ============================================================

async function loadProducts(shopId) {
    const grid = qs('products-grid');
    if (!grid) return;
    grid.innerHTML = '<p>در حال بارگذاری...</p>';
    try {
        const res = await fetch(`${baseUrl}/api/get-products/${shopId}`);
        const products = await res.json();
        grid.innerHTML = '';
        if (!products.length) return grid.innerHTML = '<p>محصولی یافت نشد.</p>';

        products.forEach(p => {
            const div = document.createElement('div');
            div.className = 'product-card-edit';
            div.dataset.id = p._id; 
            div.innerHTML = `
                <img src="${p.image}" class="product-img-preview" style="width:50px;height:50px;object-fit:cover;">
                <div class="product-info-wrapper">
                    <h4>${p.name}</h4>
                    <p style="font-size:12px;color:#666;">${p.description || ''}</p>
                </div>
                <div class="product-actions">
                    <button class="btn-sm" onclick="deleteProduct('${p._id}')">🗑️</button>
                    <button class="btn-sm" onclick="showEditProduct('${p._id}','${p.name}')">✏️</button>
                </div>
            `;
            grid.appendChild(div);
        });
        
        // قابلیت دراگ اند دراپ (اگر کتابخانه Sortable باشد)
        if(typeof Sortable !== 'undefined') {
            new Sortable(grid, {
                animation: 150,
                onEnd: () => {
                    const orderedIds = Array.from(grid.children).map(c => c.dataset.id);
                    fetch(`${baseUrl}/api/products/reorder`, {
                        method: 'PUT', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ orderedIds })
                    });
                }
            });
        }
    } catch(e) { grid.innerHTML = 'خطا در بارگذاری'; }
}

window.addProduct = async function() {
    const name = qs('product-name').value;
    const file = qs('product-image').files[0];
    if (!name || !file) return alert('نام و عکس الزامی');
    
    const shopId = new URLSearchParams(window.location.search).get('shop_id');
    showLoading();
    const fd = new FormData();
    fd.append('name', name);
    fd.append('description', qs('product-desc').value);
    fd.append('instagram_link', qs('product-instagram-link').value);
    fd.append('image', file);
    
    try {
        await fetch(`${baseUrl}/api/add-product/${shopId}`, { method: 'POST', body: fd });
        qs('product-name').value = ''; qs('product-image').value = '';
        loadProducts(shopId);
    } catch(e) { alert('Error'); } finally { hideLoading(); }
};

window.deleteProduct = async function(id) {
    if(!confirm('حذف شود؟')) return;
    showLoading();
    try {
        await fetch(`${baseUrl}/api/product/${id}`, { method: 'DELETE' });
        loadProducts(new URLSearchParams(window.location.search).get('shop_id'));
    } finally { hideLoading(); }
};

window.showEditProduct = async function(id, name) {
    const n = prompt('نام جدید:', name);
    if(n) {
        showLoading();
        try {
            await fetch(`${baseUrl}/api/product/${id}`, {
                method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name: n })
            });
            loadProducts(new URLSearchParams(window.location.search).get('shop_id'));
        } finally { hideLoading(); }
    }
};

// ============================================================
// 6. بخش‌های عمومی (نمایش فروشگاه‌ها)
// ============================================================

window.loadPublicShops = async function() {
    const grid = qs('shops-grid');
    if(!grid) return;
    showLoading();
    try {
        const res = await fetch(`${baseUrl}/api/public-shops`);
        const shops = await res.json();
        grid.innerHTML = '';
        if(!shops.length) return grid.innerHTML = '<p>موردی یافت نشد</p>';
        shops.forEach(s => {
            const div = document.createElement('div');
            div.className = 'shop-card';
            div.onclick = () => window.location.href = `shop-details.html?shop_id=${s._id}`;
            div.innerHTML = `
                <img src="${s.banner || '/images/default-banner.png'}" style="width:100%;height:150px;object-fit:cover;">
                <div style="padding:10px"><h3>${s.shop_name}</h3><p>${s.city}</p></div>
            `;
            grid.appendChild(div);
        });
    } catch(e) {} finally { hideLoading(); }
};

window.viewMyShops = function() {
    const grid = qs('shops-grid');
    if(!grid) return;
    const shops = JSON.parse(localStorage.getItem('shops')) || [];
    grid.innerHTML = '';
    
    // تغییر تایتل صفحه
    const header = qs('shops-view-header');
    if(header) header.innerHTML = '<h2>فروشگاه‌های من</h2><a href="create-shop.html" class="btn primary">ایجاد فروشگاه جدید +</a>';

    if(shops.length === 0) {
        grid.innerHTML = '<p>شما هنوز فروشگاهی ندارید.</p>';
        return;
    }
    
    shops.forEach(s => {
        const div = document.createElement('div');
        div.className = 'shop-card';
        div.onclick = () => window.location.href = `shop-edit.html?shop_id=${s._id}`;
        div.innerHTML = `
            <img src="${s.banner || '/images/default-banner.png'}" style="width:100%;height:150px;object-fit:cover;">
            <div style="padding:10px">
                <h3>${s.shop_name} (مدیریت)</h3>
                <p>وضعیت: ${s.status === 'active' ? '🟢 فعال' : '🟡 در انتظار'}</p>
            </div>
        `;
        grid.appendChild(div);
    });
};

window.logout = function() {
    localStorage.clear();
    window.location.href = 'index.html';
};
if(qs('logout-btn')) qs('logout-btn').onclick = window.logout;
if(qs('logout-btn-header')) qs('logout-btn-header').onclick = window.logout;


// ============================================================
// 7. راه‌اندازی (Initialization)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadBaseData();

    // مدیریت پروفایل کاربر در هدر
    const user = JSON.parse(localStorage.getItem('user'));
    if(user) {
        const img = qs('user-profile-picture') || qs('profile-picture-btn');
        if(img) {
            img.src = user.profile_picture_url || '/images/default-avatar.png';
            if(qs('login-register-btn')) qs('login-register-btn').style.display = 'none';
            if(qs('profile-menu-container')) qs('profile-menu-container').style.display = 'flex';
            if(qs('my-shops-menu-item')) qs('my-shops-menu-item').style.display = 'block';
            
            // باز شدن منو
            img.onclick = (e) => { 
                e.stopPropagation(); 
                const m = qs('profile-dropdown') || qs('profile-dropdown-menu'); 
                if(m) m.classList.toggle('show'); 
            };
            window.onclick = () => { 
                const m = qs('profile-dropdown') || qs('profile-dropdown-menu'); 
                if(m) m.classList.remove('show'); 
            };
        }
    }

    // روتینگ ساده بر اساس صفحه
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    if (path.includes('register.html') || path.includes('create-shop.html')) {
        populateSelect('province', provinces);
        if(qs('activity-type')) populateSelect('activity-type', activityTypes);
    }
    
    if (path.includes('shop-edit.html')) {
        const sid = params.get('shop_id');
        if(sid) {
            loadProducts(sid);
            window.loadShopProfileForEdit(sid); // ✅ این خط قبلا نبود
        }
    }
    
    if (path.includes('user-panel.html')) {
        if(params.get('my') === 'true') {
            window.viewMyShops(); // ✅ نمایش شاپ‌های خودم
        } else {
            window.loadPublicShops(); // نمایش همه
        }
    }

    if (path.includes('index.html') || path === '/') {
        window.loadPublicShops();
    }
});