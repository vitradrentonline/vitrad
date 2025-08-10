// script.js
window.onload = function () {
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

    // آرایه‌های مورد نیاز
    const provinces = [
        { value: 'tehran', text: 'تهران' },
        { value: 'alborz', text: 'البرز' },
        { value: 'ardabil', text: 'اردبیل' },
        { value: 'bushehr', text: 'بوشهر' },
        { value: 'chaharmahal', text: 'چهارمحال و بختیاری' },
        { value: 'east_azerbaijan', text: 'آذربایجان شرقی' },
        { value: 'esfahan', text: 'اصفهان' },
        { value: 'fars', text: 'فارس' },
        { value: 'gilan', text: 'گیلان' },
        { value: 'golestan', text: 'گلستان' },
        { value: 'hamadan', text: 'همدان' },
        { value: 'hormozgan', text: 'هرمزگان' },
        { value: 'ilam', text: 'ایلام' },
        { value: 'kerman', text: 'کرمان' },
        { value: 'kermanshah', text: 'کرمانشاه' },
        { value: 'khorasan_north', text: 'خراسان شمالی' },
        { value: 'khorasan_razavi', text: 'خراسان رضوی' },
        { value: 'khorasan_south', text: 'خراسان جنوبی' },
        { value: 'khuzestan', text: 'خوزستان' },
        { value: 'kohgiluyeh', text: 'کهگیلویه و بویراحمد' },
        { value: 'kurdistan', text: 'کردستان' },
        { value: 'lorestan', text: 'لرستان' },
        { value: 'markazi', text: 'مرکزی' },
        { value: 'mazandaran', text: 'مازندران' },
        { value: 'qazvin', text: 'قزوین' },
        { value: 'qom', text: 'قم' },
        { value: 'semnan', text: 'سمنان' },
        { value: 'sistan', text: 'سیستان و بلوچستان' },
        { value: 'west_azerbaijan', text: 'آذربایجان غربی' },
        { value: 'yazd', text: 'یزد' },
        { value: 'zanjan', text: 'زنجان' },
    ];

    const citiesByProvince = {
        tehran: [
            { value: 'tehran-city', text: 'تهران' },
            { value: 'rey', text: 'ری' },
            { value: 'shemiranat', text: 'شمیرانات' },
            { value: 'islamshahr', text: 'اسلامشهر' },
        ],
        esfahan: [
            { value: 'esfahan-city', text: 'اصفهان' },
            { value: 'kashan', text: 'کاشان' },
            { value: 'najafabad', text: 'نجف‌آباد' },
        ],
        // اضافه کن شهرهای بقیه استان‌ها
    };

    const tehranAreas = [
        { value: 'area1', text: 'منطقه 1' },
        { value: 'area2', text: 'منطقه 2' },
        { value: 'area3', text: 'منطقه 3' },
        // لیست کامل مناطق تهران
    ];

    const storeTypes = [
        { value: 'physical', text: 'فیزیکی' },
        { value: 'online', text: 'آنلاین' },
        { value: 'other', text: 'سایر' },
    ];

    const activityTypes = [
        { value: 'food', text: 'غذایی' },
        { value: 'clothing', text: 'پوشاک' },
        { value: 'electronics', text: 'الکترونیک' },
        { value: 'other', text: 'سایر' },
    ];

    const subActivitiesByType = {
        clothing: [
            { value: 'scarf', text: 'روسری' },
            { value: 'pants', text: 'شلوار' },
            { value: 'shirt', text: 'پیراهن' },
        ],
        electronics: [
            { value: 'phone', text: 'موبایل' },
            { value: 'laptop', text: 'لپ‌تاپ' },
        ],
        food: [
            { value: 'fruits', text: 'میوه‌ها' },
            { value: 'sweets', text: 'شیرینی‌جات' },
        ],
        other: [
            { value: 'misc', text: 'متفرقه' },
        ]
    };

    // تابع populateSelect با چک وجود عنصر
    function populateSelect(id, options) {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '<option value="">انتخاب کنید</option>';
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.text;
                select.appendChild(option);
            });
        } else {
            console.log(`عنصر با ID ${id} یافت نشد - رد کردن populate`);
        }
    }

    // پر کردن dropdownها با شرط
    populateSelect('province', provinces);
    populateSelect('store-type', storeTypes);
    populateSelect('activity-type', activityTypes);
    populateSelect('tehran-area', tehranAreas);

    // تابع updateCities با چک
    window.updateCities = function () {
        const provinceSelect = document.getElementById('province');
        const citySelect = document.getElementById('city');
        if (!provinceSelect || !citySelect) {
            console.error('عناصر province یا city یافت نشد');
            return;
        }
        const province = provinceSelect.value;
        citySelect.innerHTML = '<option value="">انتخاب کنید</option>';
        if (citiesByProvince[province]) {
            citiesByProvince[province].forEach(city => {
                const option = document.createElement('option');
                option.value = city.value;
                option.textContent = city.text;
                citySelect.appendChild(option);
            });
        }
    };

    // تابع showTehranArea با چک
    window.showTehranArea = function () {
        const citySelect = document.getElementById('city');
        const tehranField = document.getElementById('tehran-area-field');
        if (!citySelect || !tehranField) {
            console.error('عناصر city یا tehran-area-field یافت نشد');
            return;
        }
        const city = citySelect.value;
        tehranField.style.display = city === 'tehran-city' ? 'block' : 'none';
    };

    // تابع toggleOnlineFields با چک
    window.toggleOnlineFields = function () {
        const storeTypeSelect = document.getElementById('store-type');
        const onlineFields = document.getElementById('online-store-fields');
        if (!storeTypeSelect || !onlineFields) {
            console.error('عناصر store-type یا online-store-fields یافت نشد');
            return;
        }
        const storeType = storeTypeSelect.value;
        onlineFields.style.display = (storeType === 'online' || storeType === 'other') ? 'block' : 'none';
    };

    // تابع toggleHealthLicense با چک
    window.toggleHealthLicense = function () {
        const activityTypeSelect = document.getElementById('activity-type');
        const healthField = document.getElementById('health-license-field');
        if (!activityTypeSelect || !healthField) {
            console.error('عناصر activity-type یا health-license-field یافت نشد');
            return;
        }
        const activityType = activityTypeSelect.value;
        healthField.style.display = activityType === 'food' ? 'block' : 'none';
    };

    // تابع toggleSubActivity با چک
    window.toggleSubActivity = function () {
        const activityTypeSelect = document.getElementById('activity-type');
        const subField = document.getElementById('sub-activity-field');
        if (!activityTypeSelect || !subField) {
            console.error('عناصر activity-type یا sub-activity-field یافت نشد');
            return;
        }
        const activityType = activityTypeSelect.value;
        subField.style.display = activityType ? 'block' : 'none';
        const subSelect = document.getElementById('sub-activity');
        subSelect.innerHTML = '<option value="">انتخاب کنید</option>';
        if (subActivitiesByType[activityType]) {
            subActivitiesByType[activityType].forEach(sub => {
                const option = document.createElement('option');
                option.value = sub.value;
                option.textContent = sub.text;
                subSelect.appendChild(option);
            });
        }
    };

    // توابع nextStep و prevStep
    window.nextStep = function (step) {
        const steps = document.querySelectorAll('.wizard-step');
        const progress = document.getElementById('progress');
        steps.forEach(s => s.classList.remove('active'));
        const nextStepElement = document.getElementById(`step${step}`);
        if (nextStepElement) {
            nextStepElement.classList.add('active');
        }
        if (progress) progress.style.width = `${step * 25}%`;
    };

    window.prevStep = function (step) {
        const steps = document.querySelectorAll('.wizard-step');
        const progress = document.getElementById('progress');
        steps.forEach(s => s.classList.remove('active'));
        const prevStepElement = document.getElementById(`step${step}`);
        if (prevStepElement) {
            prevStepElement.classList.add('active');
        }
        if (progress) progress.style.width = `${step * 25}%`;
    };

    // تابع compressImage
    async function compressImage(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject('فایل انتخاب نشده');
                return;
            }
            if (!file.type.startsWith('image/')) {
                reject('فقط تصاویر مجاز هستند.');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                reject('حجم فایل بیش از 5 مگابایت است.');
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const maxWidth = 1024;
                    const scale = maxWidth / img.width;
                    canvas.width = maxWidth;
                    canvas.height = img.height * scale;
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => {
                        resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                    }, 'image/jpeg', 0.7);
                };
                img.src = event.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // تابع validateAndNext با چک‌های بیشتر
    window.validateAndNext = function (step) {
        const currentStep = document.querySelector('.wizard-step.active');
        if (!currentStep) return false;
        const inputs = currentStep.querySelectorAll('input[required], select[required], textarea[required]');
        let valid = true;

        inputs.forEach(input => {
            // ✨ خط جدید: اگر فیلد روی صفحه قابل مشاهده نیست، آن را نادیده بگیر
            if (input.offsetParent === null) {
                return;
            }

            if (!input.value.trim()) {
                valid = false;
                input.style.borderColor = 'red';
            } else {
                input.style.borderColor = '';
            }
        });

        // چک‌های خاص برای مرحله 1
        if (currentStep.id === 'step1') {
            const nationalCodeInput = document.getElementById('national-code');
            const emailInput = document.getElementById('email');
            const mobileInput = document.getElementById('mobile');
            if (nationalCodeInput && !/^\d{10}$/.test(nationalCodeInput.value)) {
                valid = false;
                alert('کد ملی باید 10 رقم باشد.');
            }
            if (emailInput && !/\S+@\S+\.\S+/.test(emailInput.value)) {
                valid = false;
                alert('ایمیل نامعتبر است.');
            }
            if (mobileInput && !/^09\d{9}$/.test(mobileInput.value)) {
                valid = false;
                alert('موبایل باید با 09 شروع شود و 11 رقم باشد.');
            }
        }

        // چک رمز برای مرحله 4 یا اگر در مرحله 3 باشه (برای مشتری مرحله 3 رمز هست)
        const isShopOwnerForm = !!document.getElementById('store-type');
        const passwordStepId = isShopOwnerForm ? 'step4' : 'step3'; // مرحله رمز عبور برای مغازه‌دار step4 و برای مشتری step3 است

        // فقط اگر در مرحله صحیح رمز عبور برای فرم فعلی بودیم، آن را چک می‌کنیم
        if (currentStep.id === passwordStepId) {
            const passwordInput = document.getElementById('password');
            const confirmPasswordInput = document.getElementById('confirm-password');
            if (passwordInput && confirmPasswordInput) {
                const password = passwordInput.value;
                const confirmPassword = confirmPasswordInput.value;

                if (password.length < 8) {
                    valid = false;
                    alert('رمز عبور باید حداقل 8 کاراکتر باشد.');
                } else if (password !== confirmPassword) {
                    valid = false;
                    alert('رمز عبور و تأیید آن مطابقت ندارند.');
                }
            }
        }

        // چک فایل‌ها برای مرحله 3 مغازه‌دار
        if (currentStep.id === 'step3') {
            const fileInputs = currentStep.querySelectorAll('input[type="file"][required]');
            fileInputs.forEach(fileInput => {
                if (!fileInput.files.length) {
                    valid = false;
                    fileInput.style.borderColor = 'red';
                    alert('فایل الزامی آپلود نشده: ' + fileInput.id);
                } else {
                    fileInput.style.borderColor = '';
                }
            });
        }

        if (valid) {
            nextStep(step);
        } else {
            alert('لطفاً تمام فیلدهای الزامی را پر کنید و چک کنید.');
        }
        return valid;
    };

    // تابع validateAndSubmit
    window.validateAndSubmit = function () {
        const isValid = validateAndNext(4); // اعتبارسنجی رو انجام بده و نتیجه رو برگردون
        if (isValid) {
            submitForm(); // اگر همه چیز درست بود، فرم رو ارسال کن
        }
    };

    // تابع submitForm
    window.submitForm = async function () {
        const loading = document.getElementById('loading');
        loading.style.display = 'flex';

        const formData = new FormData();
        formData.append('role', document.getElementById('store-type') ? 'shop_owner' : 'customer');
        formData.append('fullName', document.getElementById('full-name').value);
        formData.append('email', document.getElementById('email').value);
        formData.append('mobile', document.getElementById('mobile').value);
        formData.append('province', document.getElementById('province').value);
        formData.append('city', document.getElementById('city').value);

        const tehranAreaField = document.getElementById('tehran-area-field');
        if (tehranAreaField && tehranAreaField.style.display !== 'none') {
            formData.append('tehranArea', document.getElementById('tehran-area').value);
        }
        formData.append('referralCode', document.getElementById('referral-code')?.value || '');
        formData.append('password', document.getElementById('password').value);

        const storeType = document.getElementById('store-type');
        if (storeType) {
            formData.append('storeType', storeType.value);
            formData.append('activityType', document.getElementById('activity-type').value);
            formData.append('subActivity', document.getElementById('sub-activity')?.value || '');
            formData.append('shopName', document.getElementById('shop-name').value);
            formData.append('nationalCode', document.getElementById('national-code').value);

            const onlineFields = document.getElementById('online-store-fields');
            if (onlineFields && onlineFields.style.display !== 'none') {
                formData.append('businessName', document.getElementById('business-name').value);
                formData.append('description', document.getElementById('description').value);
            }

            try {
                const nationalCardFile = document.getElementById('national-card').files[0];
                if (nationalCardFile) {
                    const compressedNational = await compressImage(nationalCardFile);
                    formData.append('nationalCard', compressedNational);
                }

                const selfieFile = document.getElementById('selfie').files[0];
                if (selfieFile) {
                    const compressedSelfie = await compressImage(selfieFile);
                    formData.append('selfie', compressedSelfie);
                }

                const businessLicenseFile = document.getElementById('business-license').files[0];
                if (businessLicenseFile) {
                    const compressedBusiness = await compressImage(businessLicenseFile);
                    formData.append('businessLicense', compressedBusiness);
                }

                const healthLicenseField = document.getElementById('health-license-field');
                if (healthLicenseField && healthLicenseField.style.display !== 'none') {
                    const healthFile = document.getElementById('health-license').files[0];
                    if (healthFile) {
                        const compressedHealth = await compressImage(healthFile);
                        formData.append('healthLicense', compressedHealth);
                    }
                }
            } catch (error) {
                alert(error);
                loading.style.display = 'none';
                return;
            }
        }

        try {
            const response = await fetch(`${baseUrl}/api/register`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                localStorage.setItem('emailForVerify', document.getElementById('email').value);
                window.location.href = 'verify-otp.html';
            } else {
                alert('خطا در ثبت: ' + data.message);
            }
        } catch (error) {
            console.error('خطا:', error);
            alert('خطا در ارسال فرم.');
        } finally {
            loading.style.display = 'none';
        }
    };

    // توابع برای verify-otp.html
    window.verifyOTP = async function () {
        const loading = document.getElementById('loading');
        loading.style.display = 'flex';
        const errorMessage = document.getElementById('error-message');
        errorMessage.style.display = 'none';

        const otp = document.getElementById('otp').value;
        const email = localStorage.getItem('emailForVerify');
        const isReset = localStorage.getItem('resetMode') === 'true';

        if (!otp || otp.length !== 6) {
            errorMessage.textContent = 'کد OTP باید 6 رقم باشد.';
            errorMessage.style.display = 'block';
            loading.style.display = 'none';
            return;
        }

        try {
            const endpoint = isReset ? '/api/verify-reset-otp' : '/api/verify-otp';
            const response = await fetch(`${baseUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp })
            });
            const data = await response.json();
            if (data.success) {
                localStorage.removeItem('emailForVerify');
                if (isReset) {
                    localStorage.removeItem('resetMode');
                    localStorage.setItem('resetToken', data.resetToken); // توکن برای تغییر رمز
                    window.location.href = 'reset-password.html'; // صفحه جدید برای وارد کردن رمز جدید
                } else {
                    alert('ثبت‌نام موفق! به پنل خوش آمدید.');
                    window.location.href = 'login.html';
                }
            } else {
                errorMessage.textContent = 'کد نامعتبر یا منقضی شده.';
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            console.error('خطا:', error);
            errorMessage.textContent = 'خطا در تأیید.';
            errorMessage.style.display = 'block';
        } finally {
            loading.style.display = 'none';
        }
    };

    window.resendOTP = async function () {
        const loading = document.getElementById('loading');
        loading.style.display = 'flex';
        const errorMessage = document.getElementById('error-message');
        errorMessage.style.display = 'none';

        const email = localStorage.getItem('emailForVerify');
        const isReset = localStorage.getItem('resetMode') === 'true';

        try {
            const endpoint = isReset ? '/api/resend-reset-otp' : '/api/resend-otp';
            const response = await fetch(`${baseUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await response.json();
            if (data.success) {
                alert('کد OTP جدید ارسال شد.');
            } else {
                errorMessage.textContent = 'خطا در ارسال دوباره: ' + data.message;
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            console.error('خطا:', error);
            errorMessage.textContent = 'خطا در ارسال دوباره.';
            errorMessage.style.display = 'block';
        } finally {
            loading.style.display = 'none';
        }
    };

    // تابع برای ورود کاربر (بدون نقش، تشخیص بر اساس شناسه)
    window.loginUser = async function () {
        const loading = document.getElementById('loading');
        loading.style.display = 'flex';

        const identifier = document.getElementById('identifier').value;
        const password = document.getElementById('password').value;

        if (!identifier || !password) {
            alert('لطفاً تمام فیلدها را پر کنید.');
            loading.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`${baseUrl}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password })
            });
            const data = await response.json();
            if (data.success) {
                if (data.role === 'shop_owner') {
                    // برای مغازه‌دار، 2FA فعال کن
                    localStorage.setItem('tempToken', data.tempToken); // توکن موقت برای 2FA
                    window.location.href = 'verify-2fa.html'; // صفحه جدید برای وارد کردن OTP 2FA
                } else if (data.role === 'customer') {
                    // برای مشتری، سشن ذخیره کن (کوکی یا localStorage)
                    localStorage.setItem('customerSession', data.sessionToken); // توکن سشن
                    localStorage.setItem('deviceInfo', navigator.userAgent); // اطلاعات دستگاه ساده
                    alert('ورود موفق!');
                    window.location.href = 'customer-panel.html';
                }
            } else {
                alert('خطا در ورود: ' + data.message);
            }
        } catch (error) {
            console.error('خطا:', error);
            alert('خطا در ورود.');
        } finally {
            loading.style.display = 'none';
        }
    };

    // چک سشن مشتری در لود صفحات (مثلاً در onload)
    if (localStorage.getItem('customerSession') && localStorage.getItem('deviceInfo') === navigator.userAgent) {
        // اگر سشن وجود داره و دستگاه همان، مستقیم به پنل برو یا لاگین اتوماتیک
        // مثلاً در index.html یا صفحات دیگر چک کن و هدایت کن
    }

    // تابع برای خروج (در پنل مشتری)
    window.logout = function () {
        localStorage.removeItem('customerSession');
        localStorage.removeItem('deviceInfo');
        window.location.href = 'login.html';
    };

    // تابع برای نمایش فرم فراموشی رمز
    window.showForgotPassword = function () {
        document.querySelector('.form-card').style.display = 'none';
        document.getElementById('forgot-password').style.display = 'block';
    };

    // تابع برای پنهان کردن فرم فراموشی رمز
    window.hideForgotPassword = function () {
        document.getElementById('forgot-password').style.display = 'none';
        document.querySelector('.form-card').style.display = 'block';
    };

    // تابع برای درخواست بازنشانی رمز
    window.requestPasswordReset = async function () {
        const loading = document.getElementById('loading');
        loading.style.display = 'flex';

        const identifier = document.getElementById('forgot-identifier').value;
        const email = document.getElementById('forgot-email').value;

        if (!identifier || !email) {
            alert('لطفاً تمام فیلدها را پر کنید.');
            loading.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`${baseUrl}/api/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, email })
            });
            const data = await response.json();
            if (data.success) {
                localStorage.setItem('emailForVerify', email);
                localStorage.setItem('resetMode', 'true'); // برای تمایز از ثبت‌نام
                window.location.href = 'verify-otp.html';
            } else {
                alert('خطا در درخواست: ' + data.message);
            }
        } catch (error) {
            console.error('خطا:', error);
            alert('خطا در درخواست بازنشانی.');
        } finally {
            loading.style.display = 'none';
        }
    };

    // برای verify-2fa.html (صفحه برای 2FA)
    window.verify2FA = async function () {
        const loading = document.getElementById('loading');
        loading.style.display = 'flex';
        const errorMessage = document.getElementById('error-message');
        errorMessage.style.display = 'none';

        const otp = document.getElementById('otp').value;
        const tempToken = localStorage.getItem('tempToken');

        if (!otp || otp.length !== 6) {
            errorMessage.textContent = 'کد OTP باید 6 رقم باشد.';
            errorMessage.style.display = 'block';
            loading.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`${baseUrl}/api/verify-2fa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempToken, otp })
            });
            const data = await response.json();
            if (data.success) {
                localStorage.removeItem('tempToken');
                alert('ورود موفق!');
                window.location.href = 'shop-owner-panel.html';
            } else {
                errorMessage.textContent = 'کد نامعتبر یا منقضی شده.';
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            console.error('خطا:', error);
            errorMessage.textContent = 'خطا در تأیید.';
            errorMessage.style.display = 'block';
        } finally {
            loading.style.display = 'none';
        }
    };

    window.resend2FA = async function () {
        const loading = document.getElementById('loading');
        loading.style.display = 'flex';
        const errorMessage = document.getElementById('error-message');
        errorMessage.style.display = 'none';

        const tempToken = localStorage.getItem('tempToken');

        try {
            const response = await fetch(`${baseUrl}/api/resend-2fa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempToken })
            });
            const data = await response.json();
            if (data.success) {
                alert('کد جدید ارسال شد.');
            } else {
                errorMessage.textContent = 'خطا در ارسال دوباره: ' + data.message;
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            console.error('خطا:', error);
            errorMessage.textContent = 'خطا در ارسال دوباره.';
            errorMessage.style.display = 'block';
        } finally {
            loading.style.display = 'none';
        }
    };

    // تابع resetPassword
    window.resetPassword = async function () {
        const loading = document.getElementById('loading');
        loading.style.display = 'flex';

        const newPassword = document.getElementById('new-password').value;
        const confirmNewPassword = document.getElementById('confirm-new-password').value;
        const resetToken = localStorage.getItem('resetToken');

        if (!newPassword || !confirmNewPassword || newPassword !== confirmNewPassword) {
            alert('رمزها مطابقت ندارند یا خالی هستند.');
            loading.style.display = 'none';
            return;
        }

        if (newPassword.length < 8) {
            alert('رمز عبور باید حداقل 8 کاراکتر باشد.');
            loading.style.display = 'none';
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
                alert('رمز عبور با موفقیت تغییر یافت!');
                window.location.href = 'login.html';
            } else {
                alert('خطا در تغییر رمز: ' + data.message);
            }
        } catch (error) {
            console.error('خطا:', error);
            alert('خطا در تغییر رمز.');
        } finally {
            loading.style.display = 'none';
        }
    };

    // فراخوانی اولیه برای توابع دینامیک با شرط
    if (document.getElementById('province')) {
        updateCities();
        showTehranArea();
    }
    if (document.getElementById('store-type')) toggleOnlineFields();
    if (document.getElementById('activity-type')) {
        toggleHealthLicense();
        toggleSubActivity();
    }

    // لود اولیه wizard
    if (document.querySelector('.wizard-step')) {
        const step1 = document.getElementById('step1');
        if (step1) step1.classList.add('active');
        const progress = document.getElementById('progress');
        if (progress) progress.style.width = '25%';
    }
};