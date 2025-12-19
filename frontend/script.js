'use strict';

console.log('✅ App Started: Script Loaded Successfully');

// ============================================================
// 1. تنظیمات و توابع کمکی (Global Config & Helpers)
// ============================================================

// آدرس پایه سرور (تشخیص خودکار محیط لوکال یا سرور)
const baseUrl = window.location.hostname.includes('liara.run') ? '' : 'http://localhost:3000';

// تابع انتخاب عنصر (فقط یک بار تعریف می‌شود)
const qs = (id) => document.getElementById(id);

// تابع تنظیم متن برای جلوگیری از ارور نال بودن
const setTxt = (id, val) => {
    const el = qs(id);
    if (el) el.textContent = val || '';
};

// نمایش و مخفی کردن لودینگ (ایجاد خودکار در صورت نبودن)
function __ensureLoadingOverlay() {
    let el = qs('loading-overlay') || qs('loading');
    if (!el) {
        el = document.createElement('div');
        el.id = 'loading-overlay';
        el.className = 'loading-overlay'; // استایل در CSS تعریف شده
        el.innerHTML = '<div class="spinner"></div>'; // استایل اسپینر در CSS
        document.body.appendChild(el);
    }
    return el;
}
window.showLoading = function() { const el = __ensureLoadingOverlay(); el.style.display = 'flex'; };
window.hideLoading = function() { const el = qs('loading-overlay') || qs('loading'); if (el) el.style.display = 'none'; };

// نمایش/مخفی کردن رمز عبور
window.togglePassword = function (id) {
    const input = qs(id);
    const icon = input?.nextElementSibling;
    if (input && icon) {
        if (input.type === 'password') {
            input.type = 'text';
            icon.textContent = '🙈';
        } else {
            input.type = 'password';
            icon.textContent = '👁️';
        }
    }
};

// پر کردن تگ Select
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

// متغیرهای سراسری دیتا
let provinces = [];
let citiesByProvince = {};
let tehranAreas = [];
let activityTypes = [];
let jobCategories = {};
let map, marker;

// بارگذاری داده‌های اولیه JSON
async function loadBaseData() {
    try {
        const [locRes, catRes] = await Promise.all([
            fetch('locations.json'),
            fetch('categories.json')
        ]);
        
        if (locRes.ok) {
            const locData = await locRes.json();
            provinces = locData.provinces;
            citiesByProvince = locData.citiesByProvince;
            tehranAreas = locData.tehranAreas;
        }
        
        if (catRes.ok) {
            const catData = await catRes.json();
            activityTypes = catData.activityTypes;
            jobCategories = catData.jobCategories;
        }
        console.log('✅ Base data loaded.');
    } catch (e) {
        console.error('Error loading base data:', e);
    }
}

// ============================================================
// 2. مدیریت فرم‌ها و شهرها (Form Logic)
// ============================================================

window.handleCityChange = function () {
    const pSelect = qs('province');
    const cSelect = qs('city');
    const areaSection = qs('tehran-area-section');
    if (!pSelect || !cSelect || !areaSection) return;

    if (pSelect.value === 'tehran' && cSelect.value === 'tehran-city') {
        areaSection.style.display = 'block';
        populateSelect('tehran_area', tehranAreas);
    } else {
        areaSection.style.display = 'none';
    }
};

window.updateCities = function () {
    const pSelect = qs('province');
    const cSelect = qs('city');
    if (!pSelect || !cSelect) return;

    const selectedP = pSelect.value;
    cSelect.innerHTML = '<option value="">انتخاب کنید</option>';
    if (selectedP && citiesByProvince[selectedP]) {
        citiesByProvince[selectedP].forEach(city => {
            const opt = document.createElement('option');
            opt.value = city.value;
            opt.textContent = city.text;
            cSelect.appendChild(opt);
        });
    }
    window.handleCityChange();
};

window.toggleHealthLicense = function () {
    const actType = qs('activity-type');
    const section = qs('health-license-section');
    if (actType && section) {
        section.style.display = ['food', 'health'].includes(actType.value) ? 'block' : 'none';
    }
};

window.handleActivityChange = function() {
    const actSelect = qs('activity-type');
    const catSection = qs('job-category-section');
    
    if (actSelect && catSection) {
        const val = actSelect.value;
        if (val && jobCategories[val]) {
            populateSelect('job-category', jobCategories[val]);
            catSection.style.display = 'block';
        } else {
            catSection.style.display = 'none';
        }
    }
    window.toggleHealthLicense();
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
// 3. احراز هویت (Auth: Login, Register, OTP)
// ============================================================

window.nextStep = function (stepNumber) {
    document.querySelectorAll('.wizard-step').forEach(step => step.classList.remove('active'));
    const target = qs(`step${stepNumber}`);
    if(target) target.classList.add('active');
    
    const progress = qs('progress');
    if(progress) {
        progress.style.width = stepNumber === 1 ? '25%' : stepNumber === 2 ? '50%' : '100%';
    }
};

window.prevStep = function (stepNumber) {
    window.nextStep(stepNumber);
};

// اعتبارسنجی فرم ثبت نام
window.validateAndNextStep = async function (step) {
    if (step !== 2) return window.nextStep(step);

    ['full_name-error', 'email-error', 'mobile-error', 'national_id-error'].forEach(id => setTxt(id, ''));

    const fullName = qs('full_name').value;
    const email = qs('email').value;
    const mobile = qs('mobile').value;
    const nationalId = qs('national_id').value;
    let hasError = false;

    if (!fullName.trim()) { setTxt('full_name-error', 'نام الزامی است'); hasError = true; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setTxt('email-error', 'ایمیل نامعتبر'); hasError = true; }
    if (!/^09\d{9}$/.test(mobile)) { setTxt('mobile-error', 'موبایل نامعتبر'); hasError = true; }
    if (!/^\d{10}$/.test(nationalId)) { setTxt('national_id-error', 'کدملی نامعتبر'); hasError = true; }

    if (hasError) return;

    showLoading();
    try {
        const res = await fetch(`${baseUrl}/api/check-duplicates`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, mobile, national_id: nationalId })
        });
        const data = await res.json();
        
        if (data.duplicates?.email) { setTxt('email-error', 'ایمیل تکراری'); hasError = true; }
        if (data.duplicates?.mobile) { setTxt('mobile-error', 'موبایل تکراری'); hasError = true; }
        if (data.duplicates?.national_id) { setTxt('national_id-error', 'کدملی تکراری'); hasError = true; }

        if (!hasError) window.nextStep(2);
    } catch(e) { 
        alert('خطای ارتباط با سرور'); 
    } finally { 
        hideLoading(); 
    }
};

window.submitRegistration = async function () {
    const pass = qs('password').value;
    const conf = qs('confirm_password').value;
    if (pass !== conf || pass.length < 8) return alert('رمزها یکسان نیستند یا کوتاهند');

    showLoading();
    const fd = new FormData();
    ['full_name', 'email', 'mobile', 'national_id', 'password', 'province', 'city', 'referral_code'].forEach(id => {
        const el = qs(id); if(el) fd.append(id, el.value);
    });
    if(qs('tehran_area')) fd.append('tehran_area', qs('tehran_area').value);

    try {
        const res = await fetch(`${baseUrl}/api/register-user`, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('user_id', data.user_id);
            localStorage.setItem('email', qs('email').value);
            window.location.href = 'verify-otp.html';
        } else {
            alert(data.message);
        }
    } catch(e) { alert('خطا در ثبت نام'); } 
    finally { hideLoading(); }
};

window.loginUser = async function () {
    showLoading();
    try {
        const res = await fetch(`${baseUrl}/api/login`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ identifier: qs('identifier').value, password: qs('password').value })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('shops', JSON.stringify(data.shops));
            localStorage.setItem('lastPassword', qs('password').value);
            window.location.href = 'user-panel.html';
        } else {
            alert(data.message);
        }
    } catch(e) { alert('خطا در ورود'); } 
    finally { hideLoading(); }
};

window.verifyOTP = async function () {
    showLoading();
    const type = new URLSearchParams(window.location.search).get('type') || 'register';
    try {
        const res = await fetch(`${baseUrl}/api/verify-otp`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email: localStorage.getItem('email'), otp: qs('otp').value, type })
        });
        const data = await res.json();
        if (data.success) {
            if (type === 'reset') {
                localStorage.setItem('resetToken', data.resetToken);
                window.location.href = 'reset-password.html';
            } else {
                window.location.href = 'login.html';
            }
        } else {
            alert(data.message);
        }
    } catch(e) { alert('خطا در تایید'); } 
    finally { hideLoading(); }
};

// ============================================================
// 4. مدیریت ایجاد و ویرایش فروشگاه (Shop Management)
// ============================================================

window.validateShopStep1 = function() {
    if (!qs('shop_name').value || !qs('activity-type').value || !qs('shop_phone').value) {
        return alert('لطفاً فیلدهای ستاره‌دار را پر کنید.');
    }
    window.nextStep(2);
    setTimeout(() => { if (!map) window.initMap(); else map.invalidateSize(); }, 100);
};

window.validateShopStep2 = function() {
    if (!qs('province').value || !qs('city').value || !qs('address').value.trim()) {
        return alert('آدرس را کامل وارد کنید.');
    }
    window.nextStep(3);
};

window.initMap = function() {
    if (qs('map') && !map) {
        map = L.map('map').setView([35.6892, 51.3890], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
        marker = L.marker([35.6892, 51.3890], { draggable: true }).addTo(map);
        
        // مقداردهی اولیه
        qs('latitude').value = 35.6892;
        qs('longitude').value = 51.3890;

        const updatePos = (latlng) => {
            marker.setLatLng(latlng);
            qs('latitude').value = latlng.lat;
            qs('longitude').value = latlng.lng;
        };
        marker.on('dragend', (e) => updatePos(e.target.getLatLng()));
        map.on('click', (e) => updatePos(e.latlng));
    }
};

window.submitCreateShop = async function () {
    if (!qs('nationalCardImage').files[0] || !qs('selfieImage').files[0]) return alert('مدارک هویتی الزامی است.');
    
    showLoading();
    const user = JSON.parse(localStorage.getItem('user'));
    const fd = new FormData();
    fd.append('user_id', user._id);
    
    // جمع‌آوری فیلدها
    const fields = ['shop_name', 'shop_description', 'work_experience', 'activity_type', 'job_category', 
     'shop_phone', 'shop_email', 'province', 'city', 'address', 'tehran_area', 'latitude', 'longitude'];
    
    fields.forEach(id => { const el = qs(id); if(el) fd.append(id, el.value); });

    ['nationalCardImage', 'selfieImage', 'businessLicenseImage', 'healthLicenseImage'].forEach(id => {
        const file = qs(id)?.files[0]; if(file) fd.append(id, file);
    });

    try {
        const res = await fetch(`${baseUrl}/api/initiate-shop-creation`, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('shop_id_pending', data.shop_id);
            window.location.href = 'verify-shop-otp.html';
        } else {
            alert(data.message);
        }
    } catch(e) { alert('خطا در ثبت فروشگاه'); } 
    finally { hideLoading(); }
};

window.verifyShopOTP = async function() {
    showLoading();
    try {
        const res = await fetch(`${baseUrl}/api/verify-shop-otp`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ shop_id: localStorage.getItem('shop_id_pending'), otp: qs('otp').value })
        });
        const data = await res.json();
        if (data.success) {
            alert('تبریک! فروشگاه شما فعال شد.');
            // بروزرسانی اطلاعات کاربر
            const currentUser = JSON.parse(localStorage.getItem('user'));
            if(currentUser) {
                const loginRes = await fetch(`${baseUrl}/api/login`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ identifier: currentUser.user_identifier, password: localStorage.getItem('lastPassword') })
                });
                const loginData = await loginRes.json();
                if(loginData.success) {
                    localStorage.setItem('user', JSON.stringify(loginData.user));
                    localStorage.setItem('shops', JSON.stringify(loginData.shops));
                }
            }
            window.location.href = 'user-panel.html';
        } else { alert(data.message); }
    } catch(e) { alert('خطا در تایید'); }
    finally { hideLoading(); }
};

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
                <img src="${p.image}" class="product-img-preview">
                <div class="product-info-wrapper">
                    <h4>${p.name}</h4>
                    <p>${p.description || ''}</p>
                </div>
                <div class="product-actions">
                    <button class="btn btn-secondary btn-sm" onclick="showEditProduct('${p._id}', '${p.name}', '${p.description}', '${p.instagram_link}')">ویرایش</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p._id}')">حذف</button>
                </div>
            `;
            grid.appendChild(div);
        });

        if(typeof Sortable !== 'undefined') {
            new Sortable(grid, {
                animation: 150, ghostClass: 'sortable-ghost',
                onEnd: () => {
                    const orderedIds = Array.from(grid.children).map(c => c.dataset.id);
                    fetch(`${baseUrl}/api/products/reorder`, {
                        method: 'PUT', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ orderedIds })
                    }).catch(console.error);
                }
            });
        }
    } catch(e) { grid.innerHTML = 'خطا در بارگذاری'; }
}

window.addProduct = async function() {
    const name = qs('product-name').value;
    const file = qs('product-image').files[0];
    if (!name || !file) return alert('نام و عکس الزامی است');

    showLoading();
    const fd = new FormData();
    fd.append('name', name);
    fd.append('description', qs('product-desc').value);
    fd.append('instagram_link', qs('product-instagram-link').value);
    fd.append('image', file);
    
    const shopId = new URLSearchParams(window.location.search).get('shop_id');
    try {
        await fetch(`${baseUrl}/api/add-product/${shopId}`, { method: 'POST', body: fd });
        alert('محصول افزوده شد');
        qs('product-name').value = ''; qs('product-desc').value = ''; qs('product-image').value = '';
        loadProducts(shopId);
    } catch(e) { alert('خطا'); }
    finally { hideLoading(); }
};

window.deleteProduct = async function(id) {
    if(!confirm('مطمئنید؟')) return;
    showLoading();
    try {
        await fetch(`${baseUrl}/api/product/${id}`, { method: 'DELETE' });
        loadProducts(new URLSearchParams(window.location.search).get('shop_id'));
    } catch(e) { alert('خطا'); } 
    finally { hideLoading(); }
};

window.showEditProduct = async function(id, name, desc, insta) {
    const n = prompt('نام جدید:', name);
    if(n === null) return;
    showLoading();
    try {
        await fetch(`${baseUrl}/api/product/${id}`, {
            method: 'PUT', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name: n, description: prompt('توضیحات:', desc), instagram_link: prompt('لینک اینستاگرام:', insta) })
        });
        loadProducts(new URLSearchParams(window.location.search).get('shop_id'));
    } finally { hideLoading(); }
};

window.updateShopInfo = async function() {
    const shopId = new URLSearchParams(window.location.search).get('shop_id');
    const body = {
        description: qs('edit-description').value,
        phone: qs('edit-phone').value,
        work_experience: qs('edit-experience').value,
        address: qs('edit-address').value,
        whatsapp: qs('edit-whatsapp').value,
        telegram: qs('edit-telegram').value,
        instagram: qs('edit-instagram').value,
        calls_enabled: qs('edit-calls-enabled')?.checked
    };
    showLoading();
    try {
        await fetch(`${baseUrl}/api/update-shop/${shopId}`, {
            method: 'PUT', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        alert('ذخیره شد');
    } catch(e) { alert('خطا'); }
    finally { hideLoading(); }
};

window.uploadBanner = async function() {
    const shopId = new URLSearchParams(window.location.search).get('shop_id');
    const file = qs('banner-upload').files[0];
    if(!file) return;
    
    showLoading();
    const fd = new FormData(); fd.append('banner', file);
    try {
        const res = await fetch(`${baseUrl}/api/upload-banner/${shopId}`, { method: 'POST', body: fd });
        const data = await res.json();
        alert('بنر آپدیت شد');
        window.location.reload();
    } catch(e) { alert('خطا'); }
    finally { hideLoading(); }
};

// ============================================================
// 6. بخش‌های عمومی و UI (Public Views)
// ============================================================

// صفحه جزئیات محصول (Product Details)
async function initProductDetailsPage() {
    const pid = new URLSearchParams(window.location.search).get('product_id');
    if (!pid) return window.location.href = 'index.html';

    showLoading();
    try {
        const res = await fetch(`${baseUrl}/api/product-details/${pid}`);
        const json = await res.json();
        if(!json.success) throw new Error();

        const p = json.data;
        const shop = p.shop_info;

        setTxt('pd-title', p.name);
        setTxt('pd-desc', p.description || 'توضیحات ندارد.');
        if(p.image) qs('pd-image').src = p.image;

        if (shop) {
            const sLink = qs('shop-link');
            if(sLink) { sLink.textContent = shop.name; sLink.href = `shop-details.html?shop_id=${shop.id}`; }
            if(qs('shop-logo') && shop.logo) qs('shop-logo').src = shop.logo;
            setTxt('shop-location', shop.city || 'ایران');
        }

        const priceBox = qs('price-container');
        if(priceBox) {
            if(p.price) {
                priceBox.innerHTML = `<div class="price-current">${parseInt(p.price).toLocaleString('fa-IR')} <span class="currency">تومان</span></div>`;
            } else {
                priceBox.innerHTML = '<div class="price-current">قیمت: تماس بگیرید</div>';
            }
        }
    } catch(e) { console.error(e); }
    finally { hideLoading(); }
}

// بارگذاری لیست فروشگاه‌ها (عمومی)
async function loadPublicShops() {
    const grid = qs('shops-grid');
    if(!grid) return;
    showLoading();
    try {
        const res = await fetch(`${baseUrl}/api/public-shops`);
        const shops = await res.json();
        grid.innerHTML = '';
        
        if(!shops.length) return grid.innerHTML = '<p>فروشگاهی یافت نشد.</p>';

        shops.forEach(s => {
            const card = document.createElement('div');
            card.className = 'shop-card'; 
            card.onclick = () => window.location.href = `shop-details.html?shop_id=${s._id}`;
            
            const bannerHTML = s.banner ? `<img src="${s.banner}" alt="بنر">` : '<div class="shop-card-no-banner"></div>';
            
            card.innerHTML = `
                <div class="shop-card-image">${bannerHTML}</div>
                <div class="shop-card-content">
                    <h3>${s.shop_name}</h3>
                    <p class="shop-card-activity">${s.city || 'تهران'}</p>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch(e) { console.error(e); }
    finally { hideLoading(); }
}

// نمایش لیست فروشگاه‌های کاربر (پنل)
window.viewMyShops = function() {
    const myShops = JSON.parse(localStorage.getItem('shops'));
    const grid = qs('shops-grid');
    if(!grid) return;
    grid.innerHTML = ''; 
    if (myShops && myShops.length > 0) {
        myShops.forEach(shop => {
            const div = document.createElement('div');
            div.className = 'shop-card';
            div.onclick = () => window.location.href = `shop-edit.html?shop_id=${shop._id}`;
            div.innerHTML = `
                <img src="${shop.banner || 'images/default-banner.png'}" style="height:120px;width:100%;object-fit:cover;">
                <div style="padding:10px">
                    <h3>${shop.shop_name}</h3>
                    <p>${shop.city || 'نامشخص'}</p>
                </div>
            `;
            grid.appendChild(div);
        });
    } else {
        grid.innerHTML = '<p>مغازه‌ای ثبت نکرده‌اید.</p>';
    }
};

window.logout = function() {
    localStorage.clear();
    window.location.href = 'index.html';
};

// ============================================================
// 7. راه‌اندازی اولیه (Initialization)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadBaseData();

    // مدیریت منوی پروفایل
    const profileBtn = qs('user-profile-picture');
    if(profileBtn) {
        const user = JSON.parse(localStorage.getItem('user'));
        if(user) {
            profileBtn.src = user.profile_picture_url || 'images/default-avatar.png';
            if(qs('login-register-btn')) qs('login-register-btn').style.display = 'none';
            if(qs('profile-menu-container')) qs('profile-menu-container').style.display = 'flex';
            
            profileBtn.onclick = (e) => { e.stopPropagation(); qs('profile-dropdown').classList.toggle('show'); };
            window.onclick = () => { const d = qs('profile-dropdown'); if(d) d.classList.remove('show'); };
        }
    }

    const path = window.location.pathname;

    if (path.endsWith('index.html') || path === '/') {
        loadPublicShops();
    }
    else if (path.includes('register.html')) {
        populateSelect('province', provinces);
        window.updateCities();
    }
    else if (path.includes('create-shop.html')) {
        populateSelect('province', provinces);
        populateSelect('activity-type', activityTypes);
    }
    else if (path.includes('shop-edit.html')) {
        const shopId = new URLSearchParams(window.location.search).get('shop_id');
        if(shopId) {
            loadProducts(shopId);
            // اینجا می‌توانید تابع لود اطلاعات کلی شاپ را صدا بزنید
            // loadShopProfileForEdit(shopId);
        }
    }
    else if (path.includes('product-details.html')) {
        initProductDetailsPage();
    }
    else if (path.includes('user-panel.html')) {
        // اگر لازم باشد لیست همه شاپ‌ها را لود کند
        // loadPublicShops(); 
    }
});