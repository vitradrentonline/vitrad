console.log('اسکریپت لود شد');

// تنظیم Base URL
const baseUrl = window.location.hostname.includes('liara.run') ? '' : 'http://localhost:3000';

// تابع togglePassword
window.togglePassword = function (id) {
    const input = document.getElementById(id);
    const icon = input.nextElementSibling;
    if (input && icon && icon.classList.contains('password-toggle')) {
        if (input.type === 'password') {
            input.type = 'text';
            icon.textContent = '🙈';
        } else {
            input.type = 'password';
            icon.textContent = '👁️';
        }
    } else {
        console.error('عنصر ورودی یا آیکن یافت نشد:', id);
    }
};

let provinces = [];
let citiesByProvince = {};
let tehranAreas = [];

async function loadLocations() {
    try {
        const response = await fetch('locations.json');
        if (!response.ok) {
            throw new Error('فایل موقعیت‌ها یافت نشد.');
        }
        const data = await response.json();
        provinces = data.provinces;
        citiesByProvince = data.citiesByProvince;
        tehranAreas = data.tehranAreas;
        console.log('✅ موقعیت‌ها (استان، شهر، منطقه) با موفقیت از فایل JSON بارگذاری شد.');
    } catch (error) {
        console.error('خطا در بارگذاری موقعیت‌ها:', error);
    }
}

let activityTypes = [];
let jobCategories = {};

async function loadCategories() {
    try {
        const response = await fetch('categories.json');
        if (!response.ok) {
            throw new Error('فایل دسته‌بندی‌ها یافت نشد.');
        }
        const data = await response.json();
        activityTypes = data.activityTypes;
        jobCategories = data.jobCategories;
        console.log('✅ دسته‌بندی‌ها با موفقیت از فایل JSON بارگذاری شد.');
    } catch (error) {
        console.error('خطا در بارگذاری دسته‌بندی‌ها:', error);
    }
}

// متغیر سراسری برای نقشه
let map;
let marker;

// تابع populateSelect برای پر کردن سلکت‌ها
function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">انتخاب کنید</option>';
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        select.appendChild(option);
    });
}

// ✅ تابع جدید برای مدیریت تغییر شهر
window.handleCityChange = function () {
    const provinceSelect = document.getElementById('province');
    const citySelect = document.getElementById('city');
    const tehranAreaSection = document.getElementById('tehran-area-section');
    if (!provinceSelect || !citySelect || !tehranAreaSection) return;

    // شرط جدید: فقط اگر استان و شهر هر دو تهران باشند
    if (provinceSelect.value === 'tehran' && citySelect.value === 'tehran-city') {
        tehranAreaSection.style.display = 'block';
        populateSelect('tehran_area', tehranAreas); // مناطق تهران را پر می‌کند
    } else {
        tehranAreaSection.style.display = 'none';
    }
};

// ✅ تابع updateCities را به شکل زیر اصلاح کن
window.updateCities = function () {
    const provinceSelect = document.getElementById('province');
    const citySelect = document.getElementById('city');
    if (!provinceSelect || !citySelect) return;

    const selectedProvince = provinceSelect.value;
    citySelect.innerHTML = '<option value="">انتخاب کنید</option>';
    if (selectedProvince && citiesByProvince[selectedProvince]) {
        citiesByProvince[selectedProvince].forEach(city => {
            const option = document.createElement('option');
            option.value = city.value;
            option.textContent = city.text;
            citySelect.appendChild(option);
        });
    }

    handleCityChange(); 
};

// تابع toggleOnlineFields (اگر هنوز نیاز باشه، برای نوع فروشگاه آنلاین)
window.toggleOnlineFields = function () {
    const storeType = document.getElementById('store-type');
    const onlineFields = document.getElementById('online-fields');
    if (storeType && onlineFields) {
        onlineFields.style.display = storeType.value === 'online' ? 'block' : 'none';
    }
};

// تابع toggleHealthLicense (برای فعالیت‌هایی که نیاز به مجوز بهداشت دارن)
window.toggleHealthLicense = function () {
    const activityType = document.getElementById('activity-type');
    const healthLicenseSection = document.getElementById('health-license-section');
    if (activityType && healthLicenseSection) {
        // فرض کن فعالیت‌هایی مثل 'food' نیاز به مجوز بهداشت دارن
        const needsHealth = ['food', 'health'].includes(activityType.value);
        healthLicenseSection.style.display = needsHealth ? 'block' : 'none';
    }
};

// تابع toggleSubActivity (برای زیرمجموعه فعالیت)
window.toggleSubActivity = function () {
    const activityType = document.getElementById('activity-type');
    const subActivitySection = document.getElementById('sub-activity-section');
    if (activityType && subActivitySection) {
        subActivitySection.style.display = activityType.value ? 'block' : 'none';
        // پر کردن زیرمجموعه‌ها بر اساس activityType
    }
};

// تابع جدید برای اعتبارسنجی مرحله اول و رفتن به مرحله بعد
window.validateAndNextStep = async function (step) {
    if (step !== 2) {
        return nextStep(step); // اگر برای مراحل دیگر بود، همان تابع قبلی اجرا شود
    }

    // پاک کردن خطاهای قبلی
    document.getElementById('full_name-error').textContent = ''; // خط جدید
    document.getElementById('email-error').textContent = '';
    document.getElementById('mobile-error').textContent = '';
    document.getElementById('national_id-error').textContent = '';

    // گرفتن مقادیر از فرم
    const fullName = document.getElementById('full_name').value; // خط جدید
    const email = document.getElementById('email').value;
    const mobile = document.getElementById('mobile').value;
    const national_id = document.getElementById('national_id').value;
    let hasError = false;

    // ۱. اعتبارسنجی فرمت در سمت کاربر (Client-Side)
    // بررسی فرمت ایمیل
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        document.getElementById('email-error').textContent = 'فرمت ایمیل صحیح نیست.';
        hasError = true;
    }

    if (!fullName.trim()) {
        document.getElementById('full_name-error').textContent = 'وارد کردن نام کامل الزامی است.';
        hasError = true;
    }

    // بررسی فرمت موبایل
    if (!/^09\d{9}$/.test(mobile)) {
        document.getElementById('mobile-error').textContent = 'شماره موبایل باید ۱۱ رقمی و با ۰۹ شروع شود.';
        hasError = true;
    }

    // بررسی فرمت کد ملی
    if (!/^\d{10}$/.test(national_id)) {
        document.getElementById('national_id-error').textContent = 'کد ملی باید ۱۰ رقمی باشد.';
        hasError = true;
    }

    if (hasError) {
        return; // اگر خطای فرمت وجود داشت، ادامه نده
    }
    
    // نمایش لودینگ
    document.getElementById('loading').style.display = 'flex';
    try {
        const response = await fetch('/api/check-duplicates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, mobile, national_id })
        });
        const result = await response.json();
        if (result.duplicates) {
            if (result.duplicates.email) {
                document.getElementById('email-error').textContent = 'این ایمیل قبلاً ثبت شده است.';
                hasError = true;
            }
            if (result.duplicates.mobile) {
                document.getElementById('mobile-error').textContent = 'این شماره موبایل قبلاً ثبت شده است.';
                hasError = true;
            }
            if (result.duplicates.national_id) {
                document.getElementById('national_id-error').textContent = 'این کد ملی قبلاً ثبت شده است.';
                hasError = true;
            }
        }
    } catch (error) {
        console.error('Error checking duplicates:', error);
        alert('خطایی در ارتباط با سرور رخ داد.');
        hasError = true;
    } finally {
        document.getElementById('loading').style.display = 'none';
    }

    if (!hasError) {
        nextStep(2);
    }
}

// ✅ تابع جدید برای بارگذاری مغازه‌ها در index.html
// in script.js
async function loadPublicShops() {
    const shopsGrid = document.getElementById('shops-grid');
    if (!shopsGrid) return;
    showLoading();
    try {
        const response = await fetch(`${baseUrl}/api/public-shops`);
        const shops = await response.json();
        
        shopsGrid.innerHTML = '';

        if (!Array.isArray(shops)) {
            console.error("پاسخ دریافتی از سرور برای مغازه‌ها یک آرایه نیست!", shops);
            shopsGrid.innerHTML = '<p>خطایی در دریافت اطلاعات از سرور رخ داده است.</p>';
            return;
        }
        if (shops.length === 0) {
            shopsGrid.innerHTML = '<p>در حال حاضر هیچ مغازه‌ای برای نمایش وجود ندارد.</p>';
            return;
        }

        shops.forEach(shop => {
            const card = document.createElement('div');
            // از یک کلاس جدید برای استایل‌دهی استفاده می‌کنیم
            card.className = 'shop-card-horizontal'; 
            
            // --- بخش جدید: ساخت HTML برای محصولات برتر ---
            let topProductsHTML = '';
            if (shop.products && shop.products.length > 0) {
                shop.products.forEach(product => {
                    // هر محصول یک لینک به صفحه جزئیات خودش خواهد بود
                    topProductsHTML += `
                        <a href="product-details.html?product_id=${product._id}" class="product-preview">
                            <img src="${product.image}" alt="${product.name}">
                        </a>
                    `;
                });
            } else {
                topProductsHTML = '<p class="no-products-msg">محصولی برای نمایش وجود ندارد</p>';
            }

            // --- ساختار HTML نهایی کارت ---
            card.innerHTML = `
                <div class="card-top-section">
                    <img src="${shop.logo || 'images/default-logo.png'}" alt="لوگوی ${shop.shop_name}" class="shop-logo">
                    <div class="shop-info">
                        <h3 class="shop-name">${shop.shop_name}</h3>
                        <div class="shop-meta">
                            <span>${shop.city_name || 'شهر نامشخص'}</span>
                            <span class="separator">|</span>
                            <span>${shop.owner_full_name || 'نام مالک'}</span>
                        </div>
                    </div>
                </div>
                <div class="card-bottom-section">
                    <div class="top-products-grid">
                        ${topProductsHTML}
                    </div>
                </div>
            `;
            shopsGrid.appendChild(card);
        });
    } catch (error) {
        console.error('خطا در بارگذاری مغازه‌های عمومی:', error);
    } finally {
        hideLoading();
    }
}

// تابع اصلی برای جابجایی بین مراحل (این تابع را هم در script.js قرار بده)
window.nextStep = function (stepNumber) {
    document.querySelectorAll('.wizard-step').forEach(step => {
        step.classList.remove('active');
    });
    document.getElementById(`step${stepNumber}`).classList.add('active');
}

window.prevStep = function (stepNumber) {
    document.querySelectorAll('.wizard-step').forEach(step => {
        step.classList.remove('active');
    });
    document.getElementById(`step${stepNumber}`).classList.add('active');
}

window.validateFile = function (input) {
    const errorElement = document.getElementById(`${input.id}-error`);
    errorElement.textContent = ''; // پاک کردن خطای قبلی
    
    const file = input.files[0];
    if (file) {
        const fileType = file.type; // مثلا 'image/jpeg' یا 'image/png'
        if (!fileType.startsWith('image/')) {
            errorElement.textContent = 'لطفاً فقط فایل تصویر (مانند PNG, JPG) انتخاب کنید.';
            input.value = ''; // پاک کردن فایل نامعتبر
        }
    }
}

// تابع submitRegistration (برای ثبت کاربر جدید)
window.submitRegistration = async function () {
    showLoading();

    const formData = new FormData();
    formData.append('full_name', document.getElementById('full_name').value);
    formData.append('email', document.getElementById('email').value);
    formData.append('mobile', document.getElementById('mobile').value);
    formData.append('national_id', document.getElementById('national_id').value);
    formData.append('password', document.getElementById('password').value);
    formData.append('province', document.getElementById('province').value);
    formData.append('city', document.getElementById('city').value);
    formData.append('tehran_area', document.getElementById('tehran_area') ? document.getElementById('tehran_area').value : '');
    formData.append('referral_code', document.getElementById('referral_code').value);

    // validation client-side
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm_password').value;
    const passwordRegex = /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/;
    if (!passwordRegex.test(password)) {
        alert('رمز عبور فقط می‌تواند شامل حروف انگلیسی، اعداد و علائم مجاز باشد.');
        hideLoading();
        return;
    }

    if (password !== confirm || password.length < 8) {
        alert('رمزها مطابقت ندارند یا طول آن کمتر از ۸ کاراکتر است.');
        hideLoading();
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/api/register-user`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.success) {
            localStorage.setItem('user_id', data.user_id);
            localStorage.setItem('email', document.getElementById('email').value); // برای OTP
            window.location.href = 'verify-otp.html';
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert('خطا در ثبت');
    } finally {
        hideLoading();
    }
};

// ✅ این تابع جدید را برای اعتبارسنجی مرحله اول ایجاد مغازه اضافه کنید
window.validateShopStep1 = function() {
    const shopName = document.getElementById('shop_name').value;
    const activityType = document.getElementById('activity-type').value;
    const shopPhone = document.getElementById('shop_phone').value;

    if (!shopName || !activityType || !shopPhone) {
        alert('لطفاً تمام فیلدهای ستاره‌دار را پر کنید.');
        return;
    }
    nextStep(2); // به مرحله بعد که حاوی نقشه است می‌رویم
    setTimeout(function() {
        if (!map) { // اگر نقشه هنوز ساخته نشده، آن را بساز
            initMap();
        } else { // اگر از قبل ساخته شده، فقط اندازه‌اش را اصلاح کن
            map.invalidateSize();
        }
    }, 100); // تأخیر ۱۰۰ میلی‌ثانیه‌ای برای اطمینان از نمایش کامل بخش نقشه
};


// ✅ این تابع جدید را برای مدیریت تغییر نوع فعالیت اضافه کنید
window.handleActivityChange = function() {
    const activitySelect = document.getElementById('activity-type');
    const jobCategorySection = document.getElementById('job-category-section');
    const healthLicenseSection = document.getElementById('health-license-section');

    const selectedActivity = activitySelect.value;

    // نمایش یا عدم نمایش دسته بندی شغلی
    if (selectedActivity && jobCategories[selectedActivity]) {
        populateSelect('job-category', jobCategories[selectedActivity]);
        jobCategorySection.style.display = 'block';
    } else {
        jobCategorySection.style.display = 'none';
    }

    // نمایش یا عدم نمایش مجوز بهداشت
    if (selectedActivity === 'food') {
        healthLicenseSection.style.display = 'block';
    } else {
        healthLicenseSection.style.display = 'none';
    }
};

// ✅ تابع submitCreateShop را به طور کامل با این نسخه جایگزین کنید
window.submitCreateShop = async function () {
    showLoading();

    // اعتبارسنجی فایل‌ها قبل از ارسال
    if (!document.getElementById('nationalCardImage').files[0] ||
        !document.getElementById('selfieImage').files[0] ||
        !document.getElementById('businessLicenseImage').files[0]) {
        alert('لطفاً مدارک الزامی (کارت ملی، سلفی و جواز کسب) را آپلود کنید.');
        hideLoading();
        return;
    }

    const formData = new FormData();
    // اطلاعات کاربر و مرحله ۱
    const user = JSON.parse(localStorage.getItem('user'));
    formData.append('user_id', user._id);
    formData.append('shop_name', document.getElementById('shop_name').value);
    formData.append('shop_description', document.getElementById('shop_description').value);
    formData.append('activity_type', document.getElementById('activity-type').value);
    formData.append('job_category', document.getElementById('job-category').value);
    formData.append('shop_phone', document.getElementById('shop_phone').value);
    formData.append('shop_email', document.getElementById('shop_email').value);
    
    // اطلاعات مرحله ۲ (آدرس و نقشه)
    formData.append('province', document.getElementById('province').value);
    formData.append('city', document.getElementById('city').value);
    formData.append('address', document.getElementById('address').value);
    formData.append('tehran_area', document.getElementById('tehran_area') ? document.getElementById('tehran_area').value : '');
    formData.append('latitude', document.getElementById('latitude').value);
    formData.append('longitude', document.getElementById('longitude').value);
    
    // اطلاعات مرحله ۳ (فایل‌ها)
    formData.append('nationalCardImage', document.getElementById('nationalCardImage').files[0]);
    formData.append('selfieImage', document.getElementById('selfieImage').files[0]);
    formData.append('businessLicenseImage', document.getElementById('businessLicenseImage').files[0]);
    if (document.getElementById('healthLicenseImage').files.length > 0) {
        formData.append('healthLicenseImage', document.getElementById('healthLicenseImage').files[0]);
    }

    try {
        // ✅ به API جدید برای شروع فرآیند درخواست می‌دهد
        const response = await fetch(`${baseUrl}/api/initiate-shop-creation`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.success) {
            // اطلاعات موقت را برای صفحه بعد ذخیره می‌کنیم
            localStorage.setItem('shop_id_pending', data.shop_id);
            alert('کسب‌وکار شما پیش‌ثبت شد. یک کد تایید به ایمیل شما ارسال گردید. لطفاً برای نهایی کردن ثبت، آن را وارد کنید.');
            window.location.href = 'verify-shop-otp.html';
        } else {
            alert('خطا: ' + data.message);
        }
    } catch (error) {
        console.error('خطا در ایجاد مغازه:', error);
        alert('خطایی در ارتباط با سرور رخ داد.');
    } finally {
        hideLoading();
    }
};

// ✅ نسخه اصلاح‌شده verifyShopOTP
window.verifyShopOTP = async function() {
    showLoading();
    const otp = document.getElementById('otp').value;
    const shop_id = localStorage.getItem('shop_id_pending');

    try {
        const response = await fetch(`${baseUrl}/api/verify-shop-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop_id, otp })
        });
        const data = await response.json();
        if (data.success) {
            alert(`ثبت کسب‌وکار شما با موفقیت نهایی شد! کد کسب‌وکار شما: ${data.shop_code}`);
            localStorage.removeItem('shop_id_pending');

            // 🟢 اطلاعات کاربر و مغازه‌ها رو دوباره از API login بگیر
            const currentUser = JSON.parse(localStorage.getItem('user'));
            if (currentUser) {
                const loginResponse = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        identifier: currentUser.user_identifier,
                        password: localStorage.getItem('lastPassword')
                    })
                });
                const loginData = await loginResponse.json();
                if (loginData.success) {
                    localStorage.setItem('user', JSON.stringify(loginData.user));
                    localStorage.setItem('shops', JSON.stringify(loginData.shops));
                    console.log('✅ نقش کاربر از سرور بروزرسانی شد:', loginData.user.role);
                }
            }

            // برو به پنل
            window.location.href = 'user-panel.html';
        } else {
            alert('خطا: ' + data.message);
        }
    } catch (error) {
        console.error('خطا در تایید OTP مغازه:', error);
        alert('خطایی در ارتباط با سرور رخ داد.');
    } finally {
        hideLoading();
    }
};

// ✅ کد اصلاح‌شده برای تابع نقشه
window.initMap = function() {
    if (document.getElementById('map') && !map) {
        map = L.map('map').setView([35.6892, 51.3890], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        marker = L.marker([35.6892, 51.3890], { draggable: true }).addTo(map);
        
        // ذخیره مختصات اولیه
        document.getElementById('latitude').value = 35.6892;
        document.getElementById('longitude').value = 51.3890;

        // تابع برای آپدیت مختصات
        function updateMarkerPosition(latlng) {
            marker.setLatLng(latlng);
            document.getElementById('latitude').value = latlng.lat;
            document.getElementById('longitude').value = latlng.lng;
        }

        // آپدیت مختصات با هر بار جابجایی نشانگر
        marker.on('dragend', function(event) {
            updateMarkerPosition(marker.getLatLng());
        });

        // ✅ تغییر جدید: آپدیت مختصات با کلیک روی نقشه
        map.on('click', function(event) {
            updateMarkerPosition(event.latlng);
        });
    }
};

// ✅ تابع جدید برای گرفتن موقعیت فعلی کاربر
window.getUserLocation = function() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            // جابجایی نقشه و نشانگر به موقعیت کاربر
            map.setView([lat, lon], 16);
            marker.setLatLng([lat, lon]);
            
            // ذخیره مختصات
            document.getElementById('latitude').value = lat;
            document.getElementById('longitude').value = lon;

        }, function() {
            alert('دسترسی به موقعیت مکانی امکان‌پذیر نیست.');
        });
    } else {
        alert('مرورگر شما از قابلیت موقعیت‌یابی پشتیبانی نمی‌کند.');
    }
};

// تابع login
// ✅ نام تابع به loginUser تغییر یافت تا با HTML هماهنگ شود
window.loginUser = async function () {
    showLoading();

    const identifier = document.getElementById('identifier').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
        });
        const data = await response.json();
        if (data.success) {
            // ۱. کل آبجکت کاربر را به صورت رشته JSON ذخیره کن
            localStorage.setItem('user', JSON.stringify(data.user));

            // ۲. لیست مغازه‌های کاربر را هم به صورت رشته JSON ذخیره کن
            localStorage.setItem('shops', JSON.stringify(data.shops));

            // 🔹 خط جدید: ذخیره آخرین پسورد برای بروزرسانی بعدی
            localStorage.setItem('lastPassword', password);

            // ۴. کاربر را به پنل هدایت کن
            window.location.href = 'user-panel.html';
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Error logging in:', error);
        alert('خطا در ورود به سیستم');
    } finally {
        hideLoading();
    }
};



// تابع forgotPassword
// ✅ نام تابع به requestPasswordReset تغییر یافت
window.requestPasswordReset = async function () {
    showLoading();

    const identifier = document.getElementById('forgot-identifier').value;
    const email = document.getElementById('forgot-email').value;

    try {
        const response = await fetch('/api/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, email })
        });
        const data = await response.json();
        if (data.success) {
            localStorage.setItem('email', email); // ایمیل را برای صفحه تایید OTP ذخیره می‌کنیم
            alert('کد بازیابی به ایمیل شما ارسال شد.');
            window.location.href = 'verify-otp.html?type=reset'; // به صفحه تایید کد هدایت می‌شود
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Error requesting password reset:', error);
        alert('خطا در ارسال درخواست');
    } finally {
        hideLoading();
    }
};

// ✅ تابع نمایش فرم فراموشی رمز عبور
window.showForgotPassword = function() {
    document.querySelector('.form-card').style.display = 'none'; // مخفی کردن فرم اصلی
    document.getElementById('forgot-password').style.display = 'block';
}

// ✅ تابع مخفی کردن فرم فراموشی رمز عبور
window.hideForgotPassword = function() {
    document.getElementById('forgot-password').style.display = 'none';
    document.querySelector('.form-card').style.display = 'block'; // نمایش مجدد فرم اصلی
}

// تابع verifyOTP (برای verify-otp.html)
window.verifyOTP = async function () {
    showLoading();

    const otp = document.getElementById('otp').value;
    const email = localStorage.getItem('email');
    const type = new URLSearchParams(window.location.search).get('type') || 'register';

    try {
        const response = await fetch(`${baseUrl}/api/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, type })
        });
        const data = await response.json();
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
    } catch (error) {
        alert('خطا در تایید');
    } finally {
        hideLoading();
    }
};

// تابع resendOTP
window.resendOTP = async function () {
    showLoading();

    const email = localStorage.getItem('email');
    const type = new URLSearchParams(window.location.search).get('type') || 'register';

    try {
        const endpoint = type === 'reset' ? '/api/resend-reset-otp' : '/api/resend-otp'; // اگر resend برای register داشته باشی
        const response = await fetch(`${baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (data.success) {
            alert('کد جدید ارسال شد');
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert('خطا در ارسال دوباره');
    } finally {
        hideLoading();
    }
};

// تابع resetPassword
window.resetPassword = async function () {
    showLoading();

    const newPassword = document.getElementById('new-password').value;
    const confirmNewPassword = document.getElementById('confirm-new-password').value;
    const resetToken = localStorage.getItem('resetToken');

    if (newPassword !== confirmNewPassword || newPassword.length < 8) {
        alert('رمزها مطابقت ندارند یا کوتاه');
        hideLoading();
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/api/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resetToken, newPassword })
        });
        const data = await response.json();
        if (data.success) {
            localStorage.removeItem('resetToken');
            alert('رمز تغییر یافت');
            window.location.href = 'login.html';
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert('خطا در تغییر رمز');
    } finally {
        hideLoading();
    }
};

// این رویداد زمانی اجرا می‌شود که تمام محتوای صفحه بارگذاری شده باشد
// در انتهای فایل script.js، این بخش را پیدا کرده و به طور کامل با کد زیر جایگزین کنید

document.addEventListener('DOMContentLoaded', async () => {
    await loadCategories();
    await loadLocations();
    initHeaderSearch();
    initCitySelector();
    populateCategoriesMenu_FixedScroll(); // ✅ سپس منوی هدر با آن اطلاعات پر می‌شود
    const path = window.location.pathname;
    
    if (path.endsWith('index.html') || path === '/') {
        loadPublicShops();
    }
    // ✅ شرط جدید برای صفحه اصلی
    if (path.endsWith('index.html') || path === '/') {
        loadPublicShops();
    }

    // صفحه ثبت‌نام کاربر
    if (path.includes('register.html')) {
        populateSelect('province', provinces);
        updateCities();
    }

    // صفحه ایجاد مغازه
    if (path.includes('create-shop.html')) {
        populateSelect('province', provinces);
        populateSelect('activity-type', activityTypes);
        handleActivityChange();
    }

    // پنل کاربری (نمایش مغازه‌های عمومی)
    if (path.includes('user-panel.html')) {
        const user = JSON.parse(localStorage.getItem('user'));
        if (!user) {
            alert('نشست شما منقضی شده است. لطفاً دوباره وارد شوید.');
            window.location.href = 'login.html';
            return;
        }

        const shopsMenu = document.getElementById('shops-menu');
        if (shopsMenu && (user.role === 'seller' || user.role === 'both')) {
            shopsMenu.style.display = 'block';
        }

        const referralSection = document.getElementById('referral-section');
        if (referralSection && user.referral_code && (user.role === 'seller' || user.role === 'both')) {
            // فقط اگر کاربر فروشنده باشد، کد معرف را نمایش بده
            referralSection.style.display = 'flex';
            const referralCodeDisplay = document.getElementById('referral-code-display');
            if (referralCodeDisplay) {
                referralCodeDisplay.textContent = user.referral_code;
            }
        }
    
        loadShops(); // برای نمایش همه مغازه‌ها یا مغازه‌های کاربر
    }

    // صفحه جزئیات مغازه
    if (path.includes('shop-details.html')) {
        loadShopDetails();
    }
    
    // صفحه ویرایش مغازه
    if (path.includes('shop-edit.html')) {
        const shop_id = new URLSearchParams(window.location.search).get('shop_id');
        if (shop_id) {
            loadShopProfileForEdit(); // پر کردن فیلدهای اطلاعات
            loadProducts(shop_id); // بارگذاری لیست محصولات
        } else {
            alert('خطا: شناسه مغازه برای ویرایش یافت نشد.');
            window.location.href = 'user-panel.html';
        }
    }

    // صفحه ویرایش پروفایل کاربر
    if (path.includes('update-profile.html')) {
        if (typeof loadCurrentProfile === 'function') {
            loadCurrentProfile();
        }
    }

    // شنونده سراسری برای باز کردن مودال تصویر
    document.body.addEventListener('click', function(event) {
        const target = event.target;

        if (target.tagName === 'IMG' && (target.closest('.shop-card') || target.closest('.product-card') || target.closest('.product-card-edit') || target.closest('.shop-info'))) {
            event.preventDefault();
            event.stopPropagation();
            openImageModal(target);
        }

        if (target.id === 'image-modal' || target.classList.contains('close-modal-btn')) {
            closeImageModal();
        }
    });
});

// بهبود لاگ‌اوت
window.logout = function() {
    localStorage.clear(); // پاک کردن user_id و غیره
    alert('شما با موفقیت خارج شدید.');
    window.location.href = 'index.html'; // بازگشت به صفحه اصلی
};

// فراخوانی اولیه
if (document.getElementById('province')) {
    populateSelect('province', provinces);
    updateCities();
}
if (document.getElementById('store-type')) toggleOnlineFields();
if (document.getElementById('activity-type')) {
    toggleHealthLicense();
    toggleSubActivity();
}

// wizard اولیه
if (document.querySelector('.wizard-step')) {
    const step1 = document.getElementById('step1');
    if (step1) step1.classList.add('active');
    const progress = document.getElementById('progress');
    if (progress) progress.style.width = '25%';
}

// فانکشن‌های جدید برای نوار منو (در انتهای فایل اضافه کن)
const menuBtn = document.getElementById('menu-btn');
if (menuBtn) {
    menuBtn.addEventListener('click', openSidebar);
}
function openSidebar() {
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

window.closeSidebar = function() {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
}

// اتصال امن رویدادها به دکمه‌های هدر
const menuBtnElement = document.getElementById('menu-btn');
const overlayElement = document.getElementById('overlay');

if (menuBtnElement) {
    menuBtnElement.addEventListener('click', openSidebar);
}
if (overlayElement) {
    overlayElement.addEventListener('click', closeSidebar);
}

function copyReferralCode() {
    const code = document.getElementById('referral-code-display').textContent;
    navigator.clipboard.writeText(code).then(() => {
        alert('کد معرف کپی شد!');
    }, () => {
        alert('خطا در کپی کردن کد.');
    });
}

// === Unified, defensive loading overlay helpers ===
function __ensureLoadingOverlay() {
  let el = document.getElementById('loading-overlay') || document.getElementById('loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.display = 'none';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.background = 'rgba(0,0,0,0.35)';
    el.style.zIndex = '9999';
    el.innerHTML = '<div class="spinner" style="width:48px;height:48px;border:4px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div>';
    document.body.appendChild(el);
    const style = document.createElement('style');
    style.textContent = '@keyframes spin {from{transform:rotate(0)} to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }
  return el;
}
function showLoading() {
  const el = __ensureLoadingOverlay();
  el.style.display = 'flex';
}
function hideLoading() {
  const el = document.getElementById('loading-overlay') || document.getElementById('loading');
  if (el) el.style.display = 'none';
}
// === /Unified loading helpers ===

// فانکشن برای سرچ (در انتهای فایل)
const searchBtn = document.getElementById('search-btn');
if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const input = document.getElementById('search-input');
            input.style.display = input.style.display === 'none' ? 'block' : 'none';
            if (input.style.display === 'block') input.focus();
    });
}

// ✅ کد اصلاح‌شده برای جستجو
const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', debounce(searchShops, 300)); // فقط اگر اینپوت وجود داشت، شنونده اضافه شود
}

function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
}

async function searchShops() {
    const query = document.getElementById('search-input').value;
    if (!query) return loadAllShops();
    
    try {
        const response = await fetch(`${baseUrl}/api/search-shops?query=${encodeURIComponent(query)}`);
        const shops = await response.json();
        displayShops(shops);
    } catch (error) {
        console.error('خطا در جستجو:', error);
    }
}

// فانکشن برای فیلتر (در انتهای فایل)
const filterBtn = document.getElementById('filter-btn');
if (filterBtn) {
    filterBtn.addEventListener('click', openFilterModal);
}
// script.js

// این تابع را پیدا کرده و جایگزین کن
function openFilterModal() { 
    populateFilterModal(); // این خط جدید است
    const m = document.getElementById('filter-modal'); 
    if (m) m.style.display = 'block'; 
}

// تابع بستن پنجره فیلتر (modal)
window.closeFilterModal = function() { const m = document.getElementById('filter-modal'); if (m) m.style.display = 'none'; }

// تابع اعمال فیلترها (اصلاح‌شده با اعتبارسنجی)
window.applyFilters = async function () {
    const activity = document.getElementById('filter-activity').value;
    const subActivity = document.getElementById('filter-sub-activity').value;
    const province = document.getElementById('filter-province').value;
    const city = document.getElementById('filter-city').value;
    const sort = document.getElementById('sort-by').value;

    // اعتبارسنجی هم اصلاح شد
    if (!activity && !subActivity && !province && !city && !sort) {
        alert('لطفاً حداقل یک فیلتر را برای اعمال انتخاب کنید.');
        return;
    }

    showLoading();

    try {
        // پارامتر storeType هم از اینجا حذف شد
        const params = new URLSearchParams({ activity, subActivity, province, city, sort });
        const response = await fetch(`${baseUrl}/api/filter-shops?${params}`);
        const shops = await response.json();
        
        displayShops(shops); // نمایش مغازه‌های فیلتر شده
        closeFilterModal();  // بستن پنجره پس از اعمال فیلتر

    } catch (error) {
        console.error('خطا در فیلتر:', error);
        alert('خطایی در هنگام اعمال فیلترها رخ داد.');
    } finally {
        hideLoading();
    }
}

async function loadAllShops() {
    showLoading();
    try {
        const response = await fetch(`${baseUrl}/api/get-all-shops`);
        if (!response.ok) throw new Error('خطا در دریافت اطلاعات');
        const shops = await response.json();
        
        const shopsGrid = document.getElementById('shops-grid');
        if (!shopsGrid) return;
        shopsGrid.innerHTML = '';

        if (!shops || shops.length === 0) {
            shopsGrid.innerHTML = '<p>هیچ مغازه‌ای برای نمایش یافت نشد.</p>';
            return;
        }

        shops.forEach(shop => {
            const shopCard = document.createElement('div');
            shopCard.className = 'shop-card';
            
            // ✅ منطق کلیدی: کلیک در اینجا همیشه به صفحه جزئیات عمومی می‌رود
            shopCard.onclick = () => {
                window.location.href = `shop-details.html?shop_id=${shop._id}`;
            };

            const bannerHTML = shop.banner ? `<img src="${shop.banner}" alt="${shop.shop_name}">` : '';

            shopCard.innerHTML = `
                ${bannerHTML}
                <h3>${shop.shop_name}</h3>
                <p>${shop.city || 'شهر نامشخص'}</p>
            `;
            shopsGrid.appendChild(shopCard);
        });

    } catch (error) {
        console.error('خطا در بارگذاری مغازه‌ها:', error);
        alert('خطایی در بارگذاری مغازه‌ها رخ داد.');
    } finally {
        hideLoading();
    }
}

// تابع برای رندر کردن کارت‌های مغازه در صفحه
function renderShops(shops) {
    const shopsGrid = document.getElementById('shops-grid');
    shopsGrid.innerHTML = ''; 

    if (!shops || shops.length === 0) {
        shopsGrid.innerHTML = '<p>هیچ مغازه‌ای برای نمایش یافت نشد.</p>';
        return;
    }

    shops.forEach(shop => {
        const shopCard = document.createElement('div');
        shopCard.className = 'shop-card';
        shopCard.onclick = () => {
            window.location.href = `shop-details.html?shop_id=${shop._id}`;
        };

        // --- شروع تغییر کلیدی ---
        // اگر بنر وجود داشت، تگ تصویر آن را بساز
        const bannerHTML = shop.banner 
            ? `<img src="${shop.banner}" alt="${shop.shop_name}">`
            : ''; // در غیر این صورت، هیچی
        // --- پایان تغییر کلیدی ---

        shopCard.innerHTML = `
            ${bannerHTML}
            <h3>${shop.shop_name}</h3>
            <p>${shop.city || 'شهر نامشخص'}</p>
        `;
        shopsGrid.appendChild(shopCard);
    });
}

function displayShops(shops) {
    const grid = document.getElementById('shops-grid');
    grid.innerHTML = ''; // پاک کردن نتایج قبلی

    if (!shops || shops.length === 0) {
        // تغییر اینجا: اضافه کردن یک div با کلاس برای استایل دهی
        grid.innerHTML = `
            <div class="no-results-message">
                <p>هیچ مغازه‌ای با این مشخصات یافت نشد.</p>
            </div>
        `;
        return;
    }

    shops.forEach(shop => {
        const card = document.createElement('div');
        card.className = 'shop-card';
        const bannerHTML = shop.banner ? `<img src="${shop.banner}" alt="بنر مغازه">` : '';

        card.innerHTML = `
            ${bannerHTML}
            <h3>${shop.shop_name}</h3>
            <p>${shop.shop_description || ''}</p>
        `;
        card.onclick = () => window.location.href = `shop-details.html?shop_id=${shop._id}`;
        grid.appendChild(card);
    });
}

// فانکشن برای updateCities در فیلتر (شبیه updateCities قبلی، اما برای filter-city)
function updateCitiesForFilter() {
    const province = document.getElementById('filter-province').value;
    const cities = citiesByProvince[province] || [];
    populateSelect('filter-city', cities);
}

// ✅ کد اصلاح‌شده و امن برای تابع updateProfile
window.updateProfile = async function() {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'flex';

    // خواندن مقادیر از فیلدهایی که در HTML وجود دارند
    const emailInput = document.getElementById('email');
    const mobileInput = document.getElementById('mobile');
    const newPasswordInput = document.getElementById('new-password');
    // آیدی صحیح برای تایید رمز خوانده می‌شود
    const confirmPasswordInput = document.getElementById('confirm-new-password');

    // بررسی اینکه آیا تمام فیلدها پیدا شده‌اند
    if (!emailInput || !mobileInput || !newPasswordInput || !confirmPasswordInput) {
        alert('خطا: یکی از فیلدهای ضروری در صفحه وجود ندارد.');
        if (loading) hideLoading();
        return;
    }

    const email = emailInput.value;
    const mobile = mobileInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // اعتبارسنجی رمز عبور
    if (newPassword && newPassword.length > 0) { // فقط اگر رمز جدیدی وارد شده بود
        if (newPassword.length < 8) {
            alert('رمز عبور جدید باید حداقل ۸ کاراکتر باشد.');
            if (loading) hideLoading();
            return;
        }
        if (newPassword !== confirmPassword) {
            alert('رمزهای عبور جدید با یکدیگر مطابقت ندارند.');
            if (loading) hideLoading();
            return;
        }
    }

    // آماده‌سازی اطلاعات برای ارسال به سرور
    const updateData = {
        user_id: localStorage.getItem('user_id'),
        email: email,
        mobile: mobile
    };

    // فقط در صورتی که رمز جدید وارد شده، آن را به درخواست اضافه کن
    if (newPassword) {
        updateData.new_password = newPassword;
    }

    try {
        const response = await fetch(`${baseUrl}/api/update-profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });

        const data = await response.json();

        if (data.success) {
            alert('پروفایل شما با موفقیت بروزرسانی شد.');
            window.location.href = 'user-panel.html';
        } else {
            alert('خطا در بروزرسانی: ' + data.message);
        }
    } catch (error) {
        console.error('خطا در ارتباط با سرور:', error);
        alert('یک خطای پیش‌بینی نشده در ارتباط با سرور رخ داد.');
    } finally {
        if (loading) hideLoading();
    }
};

// فانکشن لود لیست مغازه‌ها
// in script.js
async function loadShops() {
    const urlParams = new URLSearchParams(window.location.search);
    const isMyShops = urlParams.get('my') === 'true';
    const shopsGrid = document.getElementById('shops-grid');
    if (!shopsGrid) return;

    shopsGrid.innerHTML = '';
    showLoading();

    const headerContent = document.getElementById('header-dynamic-content');
    const mainLogo = document.getElementById('main-logo');

    if (headerContent && mainLogo) {
        if (isMyShops) {
            mainLogo.style.display = 'none';
            headerContent.style.display = 'flex';
            headerContent.innerHTML = `<h4>لیست مغازه‌های من</h4><button onclick="window.location.href='user-panel.html'">بازگشت</button>`;
        } else {
            mainLogo.style.display = 'block';
            headerContent.style.display = 'none';
        }
    }

    try {
        const user = JSON.parse(localStorage.getItem('user'));
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        let endpoint = isMyShops 
            ? `${baseUrl}/api/get-shops?user_id=${user._id}`
            : `${baseUrl}/api/sorted-shops?userId=${user._id}&province=${user.province || ''}&city=${user.city || ''}&tehran_area=${user.tehran_area || ''}`;
        
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('پاسخ سرور نامعتبر');
        
        const shops = await response.json();

        if (shops.length === 0) {
            shopsGrid.innerHTML = isMyShops 
                ? "<p>شما هنوز مغازه‌ای ثبت نکرده‌اید.</p>"
                : "<p>در حال حاضر هیچ مغازه‌ای برای نمایش وجود ندارد.</p>";
            return;
        }

        shops.forEach(shop => {
            const card = document.createElement('div');
            card.className = 'shop-card';
            const destination = isMyShops ? 'shop-edit.html' : 'shop-details.html';
            card.onclick = () => window.location.href = `${destination}?shop_id=${shop._id}`;

            const bannerHTML = shop.banner ? `<img src="${shop.banner}" alt="بنر ${shop.shop_name}">` : '<div class="shop-card-no-banner"></div>';

            let ratingHTML = '<p class="shop-card-rating">امتیازی ثبت نشده</p>';
            if (shop.rating_average && shop.rating_count > 0) {
                ratingHTML = `
                    <p class="shop-card-rating">
                        ⭐ ${shop.rating_average} <span>(${shop.rating_count} نظر)</span>
                    </p>
                `;
            }
            
            // ✅ بهینه‌سازی: حذف activityTranslations و خواندن مستقیم از داده‌ها
            const activityObject = activityTypes.find(at => at.value === shop.activity_type);
            const activityText = activityObject ? activityObject.text : 'نامشخص';

            card.innerHTML = `
                <div class="shop-card-image">${bannerHTML}</div>
                <div class.shop-card-content">
                    <h3>${shop.shop_name}</h3>
                    <p class="shop-card-activity">${activityText}</p>
                    ${ratingHTML}
                </div>
            `;
            shopsGrid.appendChild(card);
        });
    } catch (error) {
        console.error('خطا در بارگذاری مغازه‌ها:', error);
        alert('خطا در بارگذاری لیست مغازه‌ها');
    } finally {
        hideLoading();
    }
}


// فانکشن‌های منو
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    sidebar.style.display = sidebar.style.display === 'none' ? 'block' : 'none';
};

// ✅ نسخه نهایی و اصلاح شده تابع آپلود بنر
async function uploadBanner() {
    const shop_id = new URLSearchParams(window.location.search).get('shop_id');
    const bannerInput = document.getElementById('banner-upload');
    
    if (!bannerInput || !bannerInput.files[0]) {
        return alert('لطفاً ابتدا یک فایل برای بنر انتخاب کنید.');
    }

    try {
        showLoading();
        const formData = new FormData();
        formData.append('banner', bannerInput.files[0]);

        const res = await fetch(`${baseUrl}/api/upload-banner/${shop_id}`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('خطا در آپلود بنر');

        const data = await res.json();
        alert('بنر با موفقیت آپلود شد');
        
        // به‌روزرسانی فوری بنر در صفحه ویرایش
        const bannerSection = document.getElementById('banner-management-section');
        if (!bannerSection) return;

        // ابتدا بررسی می‌کنیم آیا تصویری از قبل وجود دارد یا نه
        let bannerImg = bannerSection.querySelector('.shop-banner-img');
        
        if (bannerImg) {
            // اگر وجود داشت، فقط آدرس آن را آپدیت می‌کنیم
            bannerImg.src = data.bannerUrl + '?t=' + new Date().getTime(); // اضافه کردن پارامتر برای جلوگیری از کش شدن عکس
        } else {
            // اگر وجود نداشت، یک تگ تصویر جدید می‌سازیم و به ابتدای بخش اضافه می‌کنیم
            bannerImg = document.createElement('img');
            bannerImg.src = data.bannerUrl;
            bannerImg.alt = "بنر مغازه";
            bannerImg.className = 'shop-banner-img'; // از استایل موجود استفاده می‌کند
            
            // تصویر را بعد از عنوان h3 اضافه می‌کنیم
            bannerSection.querySelector('h3').after(bannerImg);
        }

    } catch (err) {
        console.error(err);
        alert('خطا در آپلود بنر');
    } finally {
        hideLoading();
    }
}

// اضافه محصول
async function addProduct() {
    const name = document.getElementById('product-name').value;
    const desc = document.getElementById('product-desc').value;
    const file = document.getElementById('product-image').files[0];
    const instagram_link = document.getElementById('product-instagram-link').value;
    if (!name || !desc || !file) return alert('همه فیلدها رو پر کنید');
    showLoading(); 
    try {
        const shop_id = new URLSearchParams(window.location.search).get('shop_id');
        const formData = new FormData();
        formData.append('name', name);
        formData.append('description', desc);
        formData.append('instagram_link', instagram_link);
        formData.append('image', file);
        
        await fetch(`${baseUrl}/api/add-product/${shop_id}`, { method: 'POST', body: formData });
        alert('محصول اضافه شد');
        loadProducts(shop_id);

        // ✅ خطوط جدید برای خالی کردن فیلدها
        document.getElementById('product-name').value = '';
        document.getElementById('product-desc').value = '';
        document.getElementById('product-instagram-link').value = '';
        document.getElementById('product-image').value = ''; // این خط فایل انتخاب شده را پاک می‌کند

    } catch (error) {
        console.error('خطا:', error);
        alert('خطای پیش‌بینی نشده در افزودن محصول.');
    } finally {
        hideLoading();
    }
}

// تابع برای ذخیره ترتیب محصولات (Priority)
async function saveProductPriority(shop_id, productOrder) {
  try {
    showLoading();
    const response = await fetch(`${baseUrl}/api/products/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_id, productOrder })
    });
    if (!response.ok) throw new Error('خطا در ذخیره ترتیب محصولات');
    alert('ترتیب محصولات با موفقیت ذخیره شد');
  } catch (err) {
    console.error(err);
    alert('خطا در ذخیره ترتیب محصولات');
  } finally {
    hideLoading();
  }
}


/**
 * محصولات یک مغازه را بارگذاری کرده و قابلیت‌های مدیریت (حذف، ویرایش و درگ اند دراپ) را فعال می‌کند.
 * @param {string} shop_id - شناسه‌ی مغازه.
 */
async function loadProducts(shop_id) {
    const grid = document.getElementById('products-grid');
    if (!grid) {
        console.error('المان products-grid در صفحه یافت نشد.');
        return;
    }
    
    // ۱. نمایش پیام موقت و سپس پاک کردن محتوای قبلی برای جلوگیری از تکرار آیتم‌ها
    grid.innerHTML = '<p>در حال بارگذاری محصولات...</p>';

    try {
        const response = await fetch(`${baseUrl}/api/get-products/${shop_id}`);
        const products = await response.json();
        
        grid.innerHTML = ''; // پاک کردن نهایی قبل از نمایش

        if (!products || products.length === 0) {
            grid.innerHTML = '<p>هنوز محصولی برای این مغازه ثبت نشده است.</p>';
            return;
        }

        // ۲. ساخت کارت برای هر محصول
        products.forEach(product => {
            const name = product.name || 'بدون نام';
            const description = product.description || '';
            const instagram = product.instagram_link || '';

            const card = document.createElement('div');
            card.className = 'product-card-edit';
            card.dataset.productId = product._id; // آیدی برای درگ اند دراپ و حذف/ویرایش
            
            card.innerHTML = `
                <img src="${product.image}" alt="${name}" class="product-img-preview">
                <div class="product-info-wrapper">
                    <h4>${name}</h4>
                    <p>${description}</p>
                    ${instagram ? `<a href="${instagram.startsWith('http') ? instagram : 'https://www.instagram.com/' + instagram}" target="_blank" class="product-instagram-link" title="مشاهده در اینستاگرام"><i class="fab fa-instagram"></i></a>` : ''}
                </div>
                <div class="product-actions">
                    <button class="btn-edit" onclick="showEditForm('${product._id}', '${name}', '${description}', '${instagram}')">ویرایش</button>
                    <button class="btn-delete" onclick="deleteProduct('${product._id}')">حذف</button>
                </div>
            `;
            grid.appendChild(card);
        });

        // ۳. فعال‌سازی قابلیت Drag and Drop بعد از نمایش همه محصولات
        new Sortable(grid, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function () {
                const orderedIds = Array.from(grid.children).map(child => child.dataset.productId);
                saveOrder(shop_id, orderedIds);
            }
        });

    } catch (error) {
        console.error('خطا در بارگذاری محصولات:', error);
        grid.innerHTML = '<p>متاسفانه در بارگذاری محصولات مشکلی پیش آمد.</p>';
    }
}

// تابع جدید برای حذف محصول
async function deleteProduct(productId) {
    if (!confirm('آیا از حذف این محصول مطمئن هستید؟')) return;

    showLoading();
    try {
        const response = await fetch(`${baseUrl}/api/product/${productId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            alert(data.message);
            // بارگذاری مجدد محصولات برای نمایش تغییرات
            loadProducts(new URLSearchParams(window.location.search).get('shop_id'));
        } else {
            alert('خطا: ' + data.message);
        }
    } catch (error) {
        alert('خطای پیش‌بینی نشده در حذف محصول.');
    } finally {
        hideLoading();
    }
}

// تابع جدید برای نمایش فرم ویرایش (با استفاده از prompt برای سادگی)
async function showEditForm(productId, currentName, currentDesc, currentInsta) {
    const name = prompt("نام جدید محصول را وارد کنید:", currentName);
    const description = prompt("توضیحات جدید محصول را وارد کنید:", currentDesc);
    const instagram_link = prompt("لینک جدید اینستاگرام را وارد کنید:", currentInsta);

    // اگر کاربر cancel را بزند، ادامه نمی‌دهیم
    if (name === null || description === null || instagram_link === null) return;

    showLoading();
    try {
        const response = await fetch(`${baseUrl}/api/product/${productId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, instagram_link })
        });
        const data = await response.json();
        if (data.success) {
            alert(data.message);
            loadProducts(new URLSearchParams(window.location.search).get('shop_id'));
        } else {
            alert('خطا: ' + data.message);
        }
    } catch (error) {
        alert('خطای پیش‌بینی نشده در ویرایش محصول.');
    } finally {
        hideLoading();
    }
}

// این تابع را به script.js اضافه کن
async function saveOrder(shop_id, orderedIds) {
    showLoading();
    try {
        await fetch(`${baseUrl}/api/products/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderedIds: orderedIds })
        });
        // نیازی به alert نیست چون تغییر آنی است
    } catch (error) {
        alert('خطا در ذخیره ترتیب جدید.');
    } finally {
        hideLoading();
    }
}

// ✅ نسخه نهایی و یکپارچه برای بروزرسانی اطلاعات مغازه
async function updateShopInfo() {
    const shop_id = new URLSearchParams(window.location.search).get('shop_id');
    
    // ======== بخش جدید: خواندن همه مقادیر از فرم ========
    const updatePayload = {
        description: document.getElementById('edit-description').value,
        phone: document.getElementById('edit-phone').value,
        whatsapp: document.getElementById('edit-whatsapp').value,
        telegram: document.getElementById('edit-telegram').value,
        instagram: document.getElementById('edit-instagram').value,
        eitaa: document.getElementById('edit-eitaa').value,
        rubika: document.getElementById('edit-rubika').value,
        bale: document.getElementById('edit-bale').value
    };
    // ================================================

    showLoading();
    try {
        const response = await fetch(`${baseUrl}/api/update-shop/${shop_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload) // ارسال آبجکت کامل
        });
        const data = await response.json();
        if (data.success) {
            alert('اطلاعات با موفقیت بروزرسانی شد.');
        } else {
             alert('خطا: ' + data.message);
        }
    } catch (error) {
        console.error('خطا:', error);
        alert('خطای پیش‌بینی نشده در ذخیره اطلاعات.');
    } finally {
        hideLoading();
    }
}

async function loadPublicProducts(shop_id) {
    const grid = document.getElementById('public-products-grid');
    if (!grid) return;
    try {
        const response = await fetch(`${baseUrl}/api/get-products/${shop_id}`);
        const products = await response.json();
        grid.innerHTML = '';
        if (products.length > 0) {
            products.forEach(product => {
                const card = document.createElement('div');
                card.className = 'product-card'; // از استایل کارت محصول عمومی استفاده می‌شود
                const instagram = product.instagram_link;
                const instagramHTML = instagram
                    ? `<a href="${instagram.startsWith('http') ? instagram : 'https://www.instagram.com/' + instagram}" target="_blank" class="product-instagram-link" title="مشاهده در اینستاگرام"><i class="fab fa-instagram"></i></a>`
                    : '';
                card.innerHTML = `
                    <img src="${product.image}" alt="${product.name}">
                    <h4>${product.name}</h4>
                    <p>${product.description}</p>
                    ${instagramHTML} 
                `;
                grid.appendChild(card);
            });
        } else {
            grid.innerHTML = '<p>این کسب‌وکار هنوز محصولی ثبت نکرده است.</p>';
        }
    } catch (error) {
        console.error('خطا در بارگذاری عمومی محصولات:', error);
    }
}

/**
 * جزئیات کامل یک مغازه را از سرور بارگذاری کرده و در صفحه نمایش می‌دهد.
 * همچنین بخش امتیازدهی را برای کاربران لاگین کرده فعال می‌کند.
 */
/**
 * جزئیات کامل یک مغازه را از سرور بارگذاری کرده و در صفحه نمایش می‌دهد.
 * راه‌های ارتباطی و امکان امتیازدهی را فقط برای کاربران لاگین کرده نمایش می‌دهد.
 */
async function loadShopDetails() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    const shopInfo = document.getElementById('shop-info');
    const shop_id = new URLSearchParams(window.location.search).get('shop_id');

    if (!shop_id || shop_id === 'null') {
        alert('شناسه مغازه یافت نشد. لطفاً از لیست انتخاب کنید.');
        history.back();
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/api/get-shop-details/${shop_id}`);
        if (!response.ok) throw new Error('پاسخ سرور نامعتبر بود');
        
        const shop = await response.json();
        if (!shop || !shop._id) {
            shopInfo.innerHTML = '<p>متاسفانه مغازه‌ای با این شناسه یافت نشد.</p>';
            return;
        }

        // بخش ۱: نمایش اطلاعات اصلی مغازه
        const bannerHTML = shop.banner 
            ? `<img src="${shop.banner}" alt="بنر مغازه" class="shop-banner-img">` 
            : '';


        shopInfo.innerHTML = `
            <div class="shop-details-header" style="background-image: url('${shop.banner || 'images/default-banner.png'}')">
            </div>
            <div class="shop-details-content">
                <h2>${shop.shop_name}</h2>
                <div id="average-rating-display" class="rating-display">
                    </div>
                <p class="shop-description">${shop.shop_description || 'توضیحات ثبت نشده'}</p>
                
                <div id="social-links-container" class="social-links">
                    </div>
                
                <div class="stars-wrapper" id="stars-wrapper" style="display:none;">
                    <p>امتیاز شما:</p>
                    <div class="stars">
                        <span onclick="submitRating(5)">★</span>
                        <span onclick="submitRating(4)">★</span>
                        <span onclick="submitRating(3)">★</span>
                        <span onclick="submitRating(2)">★</span>
                        <span onclick="submitRating(1)">★</span>
                    </div>
                </div>
                
                <hr>
                <h3>محصولات این کسب‌وکار:</h3>
                <div class="products-grid" id="public-products-grid"></div>
            </div>
        `;

        // بررسی وضعیت ورود کاربر
        const user = JSON.parse(localStorage.getItem('user'));

        // بخش ۲: ساخت لینک‌های ارتباطی (فقط برای کاربران لاگین کرده)
        const socialContainer = document.getElementById('social-links-container');
        if (user && socialContainer) {
            let hasSocialLinks = false;
            let socialHTML = '';
            if (shop.whatsapp) { socialHTML += `<a href="https://wa.me/${shop.whatsapp}" target="_blank" title="واتس‌اپ"><i class="fab fa-whatsapp"></i></a>`; hasSocialLinks = true; }
            if (shop.telegram) { socialHTML += `<a href="https://t.me/${shop.telegram}" target="_blank" title="تلگرام"><i class="fab fa-telegram-plane"></i></a>`; hasSocialLinks = true; }
            if (shop.instagram) { socialHTML += `<a href="https://instagram.com/${shop.instagram.replace(/^@/, '')}" target="_blank" title="اینستاگرام"><i class="fab fa-instagram"></i></a>`; hasSocialLinks = true; }
            
            if(hasSocialLinks) {
                socialContainer.innerHTML = socialHTML;
                socialContainer.style.display = 'block';
            }
        }

        // بخش ۳: نمایش امتیاز و فعال‌سازی امکان رای دادن
        const avgRatingDisplay = document.getElementById('average-rating-display');
        if (avgRatingDisplay && shop.rating_average && shop.rating_count) {
            avgRatingDisplay.textContent = `میانگین امتیاز: ${shop.rating_average} از 5 (${shop.rating_count} رأی)`;
        }
        
        const starsWrapper = document.getElementById('stars-wrapper');
        if (user && starsWrapper) { // اگر کاربر لاگین کرده بود
            starsWrapper.style.display = 'block';
        }
        
        // بخش ۴: بارگذاری محصولات عمومی
        loadPublicProducts(shop_id);

    } catch (error) {
        console.error('خطا در بارگذاری جزئیات مغازه:', error);
        shopInfo.innerHTML = '<p>متاسفانه در دریافت اطلاعات مشکلی پیش آمد.</p>';
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

// تابع برای باز و بسته کردن آکاردیون
function toggleAccordion(headerElement) {
    headerElement.classList.toggle('active');
    const content = headerElement.nextElementSibling;
    if (content.style.display === "none") {
        content.style.display = "block";
    } else {
        content.style.display = "none";
    }
}

/**
 * اطلاعات پروفایل یک مغازه را برای نمایش در فرم‌های صفحه ویرایش بارگذاری می‌کند.
 * همچنین امتیاز محاسبه شده مغازه را نمایش می‌دهد.
 */
async function loadShopProfileForEdit() {
    const shop_id = new URLSearchParams(window.location.search).get('shop_id');
    if (!shop_id) {
        alert('شناسه مغازه یافت نشد.');
        window.location.href = 'user-panel.html'; // بازگشت به پنل کاربری
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/api/get-shop-details/${shop_id}`);
        const shop = await response.json();

        // پر کردن فیلدهای اطلاعات اصلی
        document.getElementById('edit-description').value = shop.shop_description || '';
        document.getElementById('edit-phone').value = shop.shop_phone || '';
        
        // پر کردن فیلدهای راه‌های ارتباطی
        document.getElementById('edit-whatsapp').value = shop.whatsapp || '';
        document.getElementById('edit-telegram').value = shop.telegram || '';
        document.getElementById('edit-instagram').value = shop.instagram || '';
        document.getElementById('edit-eitaa').value = shop.eitaa || '';
        document.getElementById('edit-rubika').value = shop.rubika || '';
        document.getElementById('edit-bale').value = shop.bale || '';
        
        // نمایش امتیاز مغازه در هدر صفحه
        const scoreDisplay = document.getElementById('shop-score-display');
        if (scoreDisplay && typeof shop.score !== 'undefined') {
            scoreDisplay.textContent = `⭐ ${shop.score}`;
        }

    } catch (error) {
        console.error('خطا در بارگذاری اطلاعات مغازه برای ویرایش:', error);
        alert('خطا در دریافت اطلاعات مغازه.');
    }
}

// تابع برای نمایش مغازه‌های کاربر (همان viewMyShops)
window.viewMyShops = function() {
    // ✅ بخش مدیریت هدر با این کد جایگزین شود
    const headerContent = document.getElementById('header-dynamic-content');
    const mainLogo = document.getElementById('main-logo');
    mainLogo.style.display = 'none';
    headerContent.style.display = 'flex';
    headerContent.innerHTML = `
        <h4>لیست مغازه‌های من</h4>
        <button onclick="window.location.href='user-panel.html'">بازگشت</button>
    `;

    const myShops = JSON.parse(localStorage.getItem('shops'));
    const shopsGrid = document.getElementById('shops-grid');
    shopsGrid.innerHTML = ''; 
    if (myShops && myShops.length > 0) {
        myShops.forEach(shop => {
            const shopCard = document.createElement('div');
            shopCard.className = 'shop-card';
            shopCard.onclick = () => {
                window.location.href = `shop-edit.html?shop_id=${shop._id}`;
            };
            shopCard.innerHTML = `
                <img src="${shop.banner || 'images/default-banner.png'}" alt="${shop.shop_name}">
                <h3>${shop.shop_name}</h3>
                <p>${shop.city || 'شهر نامشخص'}</p>
            `;
            shopsGrid.appendChild(shopCard);
        });
    } else {
        shopsGrid.innerHTML = '<p>شما هنوز هیچ مغازه‌ای ثبت نکرده‌اید.</p>';
    }
    closeSidebar();
}

// ======== توابع جدید برای مودال تصویر (با قابلیت زوم و پن) ========

// متغیرهای سراسری برای مدیریت حالت زوم و جابجایی
let scale = 1;
let isDragging = false;
let startPos = { x: 0, y: 0 };
let currentPos = { x: 0, y: 0 };

/**
 * مودال تصویر را با تصویر کلیک‌شده باز می‌کند و قابلیت‌های زوم را فعال می‌کند.
 * @param {HTMLElement} imgElement - تگ <img> که روی آن کلیک شده است.
 */
function openImageModal(imgElement) {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');

    if (modal && modalImg) {
        modal.style.display = "block";
        modalImg.src = imgElement.src;

        // ریست کردن حالت‌های قبلی
        resetZoom();

        // اضافه کردن شنونده‌ها برای زوم و جابجایی
        modalImg.addEventListener('wheel', handleZoom);
        modalImg.addEventListener('mousedown', startPan);
        window.addEventListener('mousemove', panImage); // روی کل پنجره گوش میدیم
        window.addEventListener('mouseup', endPan);
    }
}

/**
 * مودال تصویر را می‌بندد و شنونده‌ها را غیرفعال می‌کند.
 */
function closeImageModal() {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');
    if (modal && modalImg) {
        modal.style.display = "none";

        // حذف شنونده‌ها برای جلوگیری از مصرف بیهوده حافظه
        modalImg.removeEventListener('wheel', handleZoom);
        modalImg.removeEventListener('mousedown', startPan);
        window.removeEventListener('mousemove', panImage);
        window.removeEventListener('mouseup', endPan);
    }
}

// تابع برای ریست کردن زوم و موقعیت عکس
function resetZoom() {
    const modalImg = document.getElementById('modal-image');
    scale = 1;
    isDragging = false;
    currentPos = { x: 0, y: 0 };
    if (modalImg) {
        modalImg.style.transform = `translate(-50%, -50%) scale(1)`;
        modalImg.classList.remove('dragging');
    }
}

// تابع مدیریت زوم با اسکرول ماوس
function handleZoom(event) {
    event.preventDefault(); // جلوگیری از اسکرول شدن کل صفحه
    const modalImg = event.target;
    
    // جهت اسکرول را تشخیص می‌دهد
    const zoomIntensity = 0.1;
    scale += event.deltaY > 0 ? -zoomIntensity : zoomIntensity;

    // محدود کردن حداقل و حداکثر زوم
    scale = Math.max(1, Math.min(scale, 5));

    // اگر به زوم اولیه برگشتیم، موقعیت را هم ریست کن
    if (scale === 1) {
        currentPos = { x: 0, y: 0 };
    }

    applyTransform(modalImg);
}

// توابع مربوط به جابجایی (Pan)
function startPan(event) {
    if (scale > 1) { // فقط وقتی زوم شده، قابلیت جابجایی فعال باشد
        event.preventDefault();
        isDragging = true;
        startPos.x = event.clientX - currentPos.x;
        startPos.y = event.clientY - currentPos.y;
        event.target.classList.add('dragging');
    }
}

function panImage(event) {
    if (isDragging) {
        event.preventDefault();
        currentPos.x = event.clientX - startPos.x;
        currentPos.y = event.clientY - startPos.y;
        applyTransform(event.target.id === 'modal-image' ? event.target : document.getElementById('modal-image'));
    }
}

function endPan(event) {
    if (isDragging) {
        isDragging = false;
        const modalImg = document.getElementById('modal-image');
        if(modalImg) modalImg.classList.remove('dragging');
    }
}

// تابع برای اعمال نهایی تغییرات (زوم و جابجایی) به استایل عکس
function applyTransform(element) {
    if (element) {
        // ترکیب موقعیت اولیه (translate -50%, -50%) با جابجایی و زوم
        element.style.transform = `translate(calc(-50% + ${currentPos.x}px), calc(-50% + ${currentPos.y}px)) scale(${scale})`;
    }
}

// این تابع جدید را به انتهای script.js اضافه کنید
async function submitRating(rating) {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
        alert('برای امتیاز دادن باید وارد حساب کاربری خود شوید.');
        return;
    }

    const shop_id = new URLSearchParams(window.location.search).get('shop_id');
    showLoading();
    try {
        const response = await fetch(`${baseUrl}/api/rate-shop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shop_id: shop_id,
                user_id: user._id,
                rating: rating
            })
        });

        const data = await response.json();
        if (data.success) {
            alert(data.message);
            // برای نمایش فوری تغییرات، صفحه را رفرش می‌کنیم
            window.location.reload();
        } else {
            alert('خطا: ' + data.message);
        }

    } catch (error) {
        console.error('خطا در ارسال امتیاز:', error);
        alert('خطای پیش‌بینی نشده در ثبت امتیاز.');
    } finally {
        hideLoading();
    }
}

// script.js

// این توابع جدید را به انتهای فایل اضافه کن

/**
 * محتوای اولیه مودال فیلتر (لیست استان‌ها و فعالیت‌ها) را پر می‌کند.
 */
function populateFilterModal() {
    // اگر قبلا پر شده بود، دوباره این کار را نکن
    if (document.getElementById('filter-province').options.length > 1) {
        return;
    }
    populateSelect('filter-province', provinces);
    populateSelect('filter-activity', activityTypes);
}

/**
 * لیست شهرهای مودال فیلتر را بر اساس استان انتخاب شده آپدیت می‌کند.
 */
function updateCitiesForFilter() {
    const provinceSelect = document.getElementById('filter-province');
    const selectedProvince = provinceSelect.value;
    const cities = citiesByProvince[selectedProvince] || [];
    populateSelect('filter-city', cities);
}

/**
 * لیست زیرمجموعه فعالیت‌ها را در مودال فیلتر آپدیت می‌کند.
 */
function updateSubActivitiesForFilter() {
    const activitySelect = document.getElementById('filter-activity');
    const subActivitySection = document.getElementById('filter-sub-activity-section');
    const selectedActivity = activitySelect.value;

    if (selectedActivity && jobCategories[selectedActivity]) {
        populateSelect('filter-sub-activity', jobCategories[selectedActivity]);
        subActivitySection.style.display = 'block';
    } else {
        subActivitySection.style.display = 'none';
    }
}

window.clearFilters = function() {
    // ۱. تمام فیلدهای select را به حالت اولیه برمی‌گردانیم
    document.getElementById('filter-activity').selectedIndex = 0;
    document.getElementById('filter-sub-activity').selectedIndex = 0;
    document.getElementById('filter-province').selectedIndex = 0;
    document.getElementById('filter-city').innerHTML = '<option value="">انتخاب کنید</option>';
    document.getElementById('sort-by').selectedIndex = 0;
    
    // ۲. بخش زیرمجموعه فعالیت را دوباره مخفی می‌کنیم
    document.getElementById('filter-sub-activity-section').style.display = 'none';

    // ۳. لیست کامل و پیش‌فرض مغازه‌ها را دوباره بارگذاری می‌کنیم
    loadShops();

    // ۴. پنجره فیلتر را می‌بندیم
    closeFilterModal();
};

window.validateShopStep2 = function() {
    // ۱. مقادیر فیلدهای آدرس را می‌خوانیم
    const province = document.getElementById('province').value;
    const city = document.getElementById('city').value;
    const address = document.getElementById('address').value;

    // ۲. بررسی می‌کنیم که هیچکدام خالی نباشند
    if (!province || !city || !address.trim()) {
        alert('لطفاً تمام فیلدهای مربوط به آدرس (استان، شهر و آدرس پستی) را تکمیل کنید.');
        return; // اگر فیلدی خالی بود، از ادامه تابع جلوگیری می‌کنیم
    }

    // ۳. اگر همه فیلدها پر بودند، به مرحله بعد می‌رویم
    nextStep(3);
};

// --- ۱. جستجوی زنده ---
function initHeaderSearch() {
    const searchInput = document.getElementById('header-search-input');
    if (!searchInput) return;

    // جستجو همزمان با تایپ کردن (با کمی تاخیر)
    searchInput.addEventListener('input', debounce(async () => {
        const query = searchInput.value;
        if (query.length > 2) { // فقط برای جستجوهای بیشتر از ۲ حرف
            await searchAndDisplayShops(query);
        } else if (query.length === 0) {
            loadPublicShops(); // اگر جستجو پاک شد، همه را نشان بده
        }
    }, 500)); // 500 میلی‌ثانیه تاخیر

    // جستجوی نهایی با زدن کلید Enter
    searchInput.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
            await searchAndDisplayShops(searchInput.value);
        }
    });
}

// تابع جدید برای جستجو و نمایش نتایج
async function searchAndDisplayShops(query) {
    const shopsGrid = document.getElementById('shops-grid');
    if (!shopsGrid) return;
    showLoading();
    try {
        // این API endpoint باید در سرور شما وجود داشته باشد
        const response = await fetch(`${baseUrl}/api/search-shops?query=${encodeURIComponent(query)}`);
        const shops = await response.json();
        displayShops(shops); // از تابع displayShops برای نمایش استفاده می‌کنیم
    } catch (error) {
        console.error('خطا در جستجو:', error);
    } finally {
        hideLoading();
    }
}

// --- ۲. انتخاب شهر ---
function initCitySelector() {
    const cityBtn = document.getElementById('city-selector-btn');
    const cityModal = document.getElementById('city-modal');
    const closeModalBtn = document.getElementById('close-city-modal');

    if (!cityBtn || !cityModal || !closeModalBtn) return;

    // باز کردن مودال
    cityBtn.onclick = () => {
        cityModal.style.display = 'flex';
        populateProvincesInModal();
    };

    // بستن مودال
    closeModalBtn.onclick = () => cityModal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == cityModal) {
            cityModal.style.display = 'none';
        }
    };
}

function populateProvincesInModal() {
    const provinceList = document.getElementById('province-list-modal');
    provinceList.innerHTML = '';
    provinces.forEach(province => {
        const li = document.createElement('li');
        li.textContent = province.text;
        li.onclick = () => {
            // هایلایت کردن استان انتخاب شده
            document.querySelectorAll('#province-list-modal li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            populateCitiesInModal(province.value);
        };
        provinceList.appendChild(li);
    });
}

function populateCitiesInModal(provinceKey) {
    const cityList = document.getElementById('city-list-modal');
    cityList.innerHTML = '';
    const cities = citiesByProvince[provinceKey] || [];
    cities.forEach(city => {
        const li = document.createElement('li');
        li.textContent = city.text;
        li.onclick = async () => {
            // به‌روزرسانی نام شهر در هدر
            document.getElementById('selected-city-name').textContent = city.text;
            // بستن مودال
            document.getElementById('city-modal').style.display = 'none';
            // بارگذاری مغازه‌های شهر انتخاب شده
            await loadShopsByCity(city.value);
        };
        cityList.appendChild(li);
    });
}

// تابع جدید برای فیلتر کردن مغازه‌ها بر اساس شهر
async function loadShopsByCity(cityValue) {
    const shopsGrid = document.getElementById('shops-grid');
    if (!shopsGrid) return;
    showLoading();
    try {
        // این API endpoint باید در سرور شما وجود داشته باشد
        const response = await fetch(`${baseUrl}/api/shops-by-city?city=${cityValue}`);
        const shops = await response.json();
        displayShops(shops);
    } catch (error) {
        console.error('خطا در بارگذاری مغازه‌های شهر:', error);
    } finally {
        hideLoading();
    }
}


// --- ۳. منوی دسته‌بندی با اسکرول ---
// نام تابع را برای خوانایی بهتر تغییر می‌دهیم
function populateCategoriesMenu_FixedScroll() {
    const mainListContainer = document.getElementById('main-categories-list');
    if (!mainListContainer) return;

    const iconMap = {
        'آرایشی-بهداشتی-و-شوینده': 'fas fa-pump-soap',
        'خودرو-و-قطعات': 'fas fa-car',
        'کالای-دیجیتال': 'fas fa-laptop',
        'مد-و-پوشاک': 'fas fa-tshirt',
        'مواد-غذایی': 'fas fa-utensils',
        'گل-و-گیاه': 'fas fa-leaf'
        // ... سایر دسته‌ها
    };

    let mainListHTML = '';
    activityTypes.forEach(activity => {
        const iconClass = iconMap[activity.value] || 'fas fa-store';
        mainListHTML += `<li data-key="${activity.value}"><i class="${iconClass}"></i><span>${activity.text}</span></li>`;
    });
    mainListContainer.innerHTML = mainListHTML;

    const mainCategoryItems = mainListContainer.querySelectorAll('li');
    mainCategoryItems.forEach(item => {
        item.addEventListener('mouseover', () => {
            mainCategoryItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const categoryKey = item.getAttribute('data-key');
            displaySubCategories_FixedScroll(categoryKey); // فراخوانی تابع جدید
        });
    });

    if (mainCategoryItems.length > 0) {
        mainCategoryItems[0].classList.add('active');
        const defaultKey = mainCategoryItems[0].getAttribute('data-key');
        displaySubCategories_FixedScroll(defaultKey);
    }
}

// تابع جدید برای نمایش زیردسته‌ها
function displaySubCategories_FixedScroll(categoryKey) {
    const subCategoryContainer = document.getElementById('sub-categories-display');
    if (!subCategoryContainer) return;

    const mainCategory = activityTypes.find(activity => activity.value === categoryKey);
    const mainCategoryName = mainCategory ? mainCategory.text : '';
    const subCategories = jobCategories[categoryKey] || [];
    
    let contentHTML = `<h3>همه دسته‌های ${mainCategoryName}</h3><div class="sub-categories-grid">`;
    if (subCategories.length > 0) {
        subCategories.forEach(sub => { contentHTML += `<a href="#">${sub.text}</a>`; });
    } else {
        contentHTML += '<p>زیرمجموعه‌ای یافت نشد.</p>';
    }
    contentHTML += '</div>';
    subCategoryContainer.innerHTML = contentHTML;
}

// تابع کمکی Debounce برای جلوگیری از اجرای مکرر جستجو
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}