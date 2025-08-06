window.onload = function () {
    console.log('اسکریپت لود شد');

    // تابع برای نمایش/مخفی کردن رمز
    window.togglePassword = function (id) {
        const input = document.getElementById(id);
        const icon = input.nextElementSibling;
        if (input && icon) {
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

    // تابع برای نمایش/مخفی کردن لودینگ
    function showLoading(show) {
        const loadingPanel = document.getElementById('loading-panel');
        if (loadingPanel) {
            loadingPanel.style.display = show ? 'flex' : 'none';
        }
    }

    // تنظیم Base URL برای لوکال و Vercel
    const baseUrl = window.location.hostname.includes('vercel.app') ? '' : 'http://localhost:3000';

    // مدیریت دکمه‌های ثبت‌نام و ورود
    const registerBtn = document.getElementById('register-btn');
    const registerDropdown = document.getElementById('register-dropdown');
    const registerCustomerBtn = document.getElementById('register-customer');
    const registerShopOwnerBtn = document.getElementById('register-shop-owner');
    const loginBtn = document.getElementById('login-btn');

    if (registerBtn && registerDropdown) {
        registerBtn.addEventListener('click', function () {
            console.log('دکمه ثبت‌نام کلیک شد');
            registerDropdown.style.display = registerDropdown.style.display === 'none' ? 'block' : 'none';
        });
    }

    if (registerCustomerBtn) {
        registerCustomerBtn.addEventListener('click', function () {
            console.log('ثبت‌نام مشتری انتخاب شد');
            window.location.href = 'customer-register.html';
        });
    }

    if (registerShopOwnerBtn) {
        registerShopOwnerBtn.addEventListener('click', function () {
            console.log('ثبت‌نام مغازه‌دار انتخاب شد');
            window.location.href = 'register.html';
        });
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', function () {
            console.log('دکمه ورود کلیک شد');
            window.location.href = 'login.html';
        });
    }

    // فرم ثبت‌نام مغازه‌دار
    const authForm = document.getElementById('auth-form');
    if (authForm) {
        // تنظیم capture برای inputهای فایل
        const setCapture = (inputId, selectId) => {
            const input = document.getElementById(inputId);
            const select = document.getElementById(selectId);
            if (input && select) {
                select.addEventListener('change', () => {
                    if (select.value === 'camera') {
                        input.setAttribute('capture', inputId === 'selfie' ? 'user' : 'environment');
                    } else {
                        input.removeAttribute('capture');
                    }
                });
            }
        };
        setCapture('national-card', 'national-card-source');
        setCapture('selfie', 'selfie-source');
        setCapture('business-license', 'business-license-source');
        setCapture('health-license', 'health-license-source');

        authForm.addEventListener('submit', function (event) {
            event.preventDefault();
            console.log('ارسال فرم احراز هویت...');
            showLoading(true);
            const formData = new FormData(authForm);
            const password = formData.get('password');
            const confirmPassword = formData.get('confirm-password');
            const province = formData.get('province');
            const city = formData.get('city');
            if (password !== confirmPassword) {
                console.log('خطا: رمزها مطابقت ندارند');
                alert('رمز عبور و تأیید رمز عبور مطابقت ندارند!');
                showLoading(false);
                return;
            }
            if (!province || !city) {
                console.log('استان یا شهر غایب');
                alert('لطفاً استان و شهر را وارد کنید!');
                showLoading(false);
                return;
            }
            console.log('داده‌های فرم احراز:', Object.fromEntries(formData));

            // لیست فایل‌های احراز
            const files = [
                { name: 'national-card', file: formData.get('national-card'), required: true },
                { name: 'selfie', file: formData.get('selfie'), required: true },
                { name: 'business-license', file: formData.get('business-license'), required: true },
                { name: 'health-license', file: formData.get('health-license'), required: false }
            ].filter(f => f.file && f.file.size > 0);  // فقط فایل‌های غیرخالی

            // چک فایل‌های اجباری
            const requiredFiles = ['national-card', 'selfie', 'business-license'];
            for (const reqFile of requiredFiles) {
                if (!files.some(f => f.name === reqFile)) {
                    alert(`فایل ${reqFile} اجباری است!`);
                    showLoading(false);
                    return;
                }
            }

            // فشرده‌سازی برای هر فایل
            const compressPromises = files.map(({ name, file }) => {
                return new Promise((resolve) => {
                    if (file.size > 4 * 1024 * 1024) {
                        console.log(`حجم فایل ${name} بیش از 4MB است`);
                        alert(`حجم فایل ${name} بیش از 4MB است! لطفاً فایل کوچک‌تری انتخاب کنید.`);
                        showLoading(false);
                        resolve(null);  // ادامه با بقیه فایل‌ها
                        return;
                    }
                    console.log(`شروع فشرده‌سازی فایل ${name}`);
                    new Compressor(file, {
                        quality: 0.5,  // کیفیت کاهش‌یافته برای سرعت
                        maxWidth: 1024,  // حداکثر عرض
                        maxHeight: 1024,  // حداکثر ارتفاع
                        success(result) {
                            console.log(`فشرده‌سازی فایل ${name}成功`);
                            formData.set(name, result, result.name);
                            resolve(result);
                        },
                        error(err) {
                            console.error(`خطا در فشرده‌سازی فایل ${name}:`, err.message);
                            alert(`خطا در فشرده‌سازی فایل ${name}: ` + err.message);
                            resolve(null);  // ادامه با بقیه فایل‌ها
                        },
                    });
                });
            });

            Promise.all(compressPromises)
                .then((results) => {
                    // فقط فایل‌های فشرده‌شده موفق
                    const successfulFiles = results.filter(r => r !== null);
                    console.log('فایل‌های فشرده‌شده موفق:', successfulFiles.length);
                    if (successfulFiles.length === 0 && files.some(f => f.required)) {
                        alert('هیچ فایلی با موفقیت فشرده نشد!');
                        showLoading(false);
                        return;
                    }

                    fetch(`${baseUrl}/api/auth`, {
                        method: 'POST',
                        body: formData,
                        signal: AbortSignal.timeout(30000)  // تایم‌اوت 30 ثانیه
                    })
                        .then(response => {
                            console.log('پاسخ /api/auth:', response.status, response.statusText);
                            if (!response.ok) {
                                return response.json().then(err => {
                                    throw new Error(err.message || 'پاسخ سرور غیرمنتظره: ' + response.status);
                                });
                            }
                            return response.json();
                        })
                        .then(data => {
                            console.log('پاسخ سرور:', data);
                            alert(data.message);
                            localStorage.setItem('userId', data.userId);
                            localStorage.setItem('authEmail', formData.get('email'));
                            localStorage.setItem('role', 'shop_owner');
                            document.getElementById('auth-form').style.display = 'none';
                            const verifyForm = document.getElementById('verify-code');
                            if (verifyForm) {
                                verifyForm.style.display = 'block';
                                document.getElementById('verify-email').value = formData.get('email');
                                console.log('نمایش فرم تأیید کد');
                            } else {
                                console.log('فرم verify-code پیدا نشد');
                                alert('خطا: فرم تأیید پیدا نشد! - لطفاً HTML رو چک کنید.');
                            }
                        })
                        .catch(error => {
                            console.error('خطا در احراز:', error);
                            alert('خطایی رخ داد: ' + error.message);
                        })
                        .finally(() => {
                            showLoading(false);
                        });
                })
                .catch(error => {
                    console.error('خطا در فشرده‌سازی کلی:', error);
                    showLoading(false);
                });
        });
    }

    // پر کردن دراپ‌دان نوع فروشگاه با قابلیت سرچ
    const storeTypes = [
        'عمده فروش',
        'خرده فروش',
        'فروشگاه زنجیره‌ای',
        'سایر'
    ];

    const storeTypeInput = document.getElementById('store-type');
    const storeTypeList = document.getElementById('store-type-list');
    if (storeTypeInput && storeTypeList) {
        storeTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            storeTypeList.appendChild(option);
        });

        storeTypeInput.addEventListener('input', function () {
            const otherFields = document.getElementById('other-store-fields');
            if (this.value === 'سایر') {
                otherFields.style.display = 'block';
            } else {
                otherFields.style.display = 'none';
            }
        });
    }

    // پر کردن نوع فعالیت با قابلیت سرچ
    const activityTypes = [
        { value: 'خوراکی', label: 'خوراکی' },
        { value: 'پوشاک', label: 'پوشاک' },
        { value: 'الکترونیک', label: 'الکترونیک' },
        { value: 'سایر', label: 'سایر' }
    ];

    const businesses = {
        'خوراکی': ['سوپر مارکت', 'نانوایی', 'میوه فروشی', 'قنادی'],
        'پوشاک': ['لباس فروشی', 'کفش فروشی', 'پارچه فروشی'],
        'الکترونیک': ['موبایل فروشی', 'کامپیوتر فروشی', 'لوازم خانگی'],
        'سایر': []
    };

    const activityInput = document.getElementById('activity-type');
    const activityList = document.getElementById('activity-list');
    if (activityInput && activityList) {
        activityTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.label;
            activityList.appendChild(option);
        });
        activityInput.addEventListener('input', function () {
            const businessSelect = document.getElementById('business-type');
            businessSelect.innerHTML = '<option value="">انتخاب کنید</option>';
            const selected = this.value;
            if (businesses[selected]) {
                businesses[selected].forEach(biz => {
                    const option = document.createElement('option');
                    option.value = biz;
                    option.text = biz;
                    businessSelect.add(option);
                });
            }
            const healthField = document.getElementById('health-license-field');
            if (healthField) {
                healthField.style.display = selected === 'خوراکی' ? 'block' : 'none';
                const healthInput = document.getElementById('health-license');
                if (healthInput) {
                    healthInput.required = selected === 'خوراکی';
                }
            } else {
                console.error('فیلد health-license-field یافت نشد');
            }
        });
    }

    // فرم ثبت‌نام مشتری
    const customerRegisterForm = document.getElementById('customer-register-form');
    if (customerRegisterForm) {
        console.log('فرم ثبت‌نام مشتری پیدا شد');
        customerRegisterForm.addEventListener('submit', function (event) {
            event.preventDefault();
            console.log('کلیک روی ارسال فرم مشتری');
            showLoading(true);
            const formData = new FormData(customerRegisterForm);
            const password = formData.get('password');
            // --- این خط اصلاح شد ---
            const confirmPassword = formData.get('confirmPassword'); 
            const fullName = formData.get('fullName');
            const email = formData.get('email');
            const mobile = formData.get('mobile');
            const province = formData.get('province');
            const city = formData.get('city');

            if (!fullName || !email || !mobile || !password || !confirmPassword || !province || !city) {
                console.log('فیلدهای ناقص:', { fullName, email, mobile, password, confirmPassword, province, city });
                alert('لطفاً همه فیلدها را پر کنید!');
                showLoading(false);
                return;
            }
            if (password !== confirmPassword) {
                console.log('خطا: رمزها مطابقت ندارند');
                alert('رمز عبور و تأیید رمز عبور مطابقت ندارند!');
                showLoading(false);
                return;
            }
            console.log('داده‌های فرم مشتری:', Object.fromEntries(formData));
            fetch(`${baseUrl}/api/register-customer`, {
                method: 'POST',
                body: formData
            })
                .then(response => {
                    console.log('پاسخ /api/register-customer:', response.status, response.statusText);
                    if (!response.ok) {
                        return response.json().then(err => {
                            console.log('پیام خطای سرور:', err);
                            throw new Error(err.message || 'پاسخ سرور غیرمنتظره: ' + response.status);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('پاسخ سرور:', data);
                    alert(data.message);
                    localStorage.setItem('userId', data.userId);
                    localStorage.setItem('authEmail', formData.get('email'));
                    localStorage.setItem('role', 'customer');
                    document.getElementById('customer-register-form').style.display = 'none';
                    const verifyForm = document.getElementById('verify-code');
                    if (verifyForm) {
                        verifyForm.style.display = 'block';
                        document.getElementById('verify-email').value = formData.get('email');
                        console.log('نمایش فرم تأیید کد');
                    } else {
                        console.log('فرم verify-code پیدا نشد');
                        alert('خطا: فرم تأیید پیدا نشد!');
                    }
                })
                .catch(error => {
                    console.error('خطا در ثبت مشتری:', error);
                    alert('خطایی رخ داد: ' + error.message);
                })
                .finally(() => {
                    showLoading(false);
                });
        });
    }

    // فرم تأیید کد در احراز
    const verifyCodeForm = document.getElementById('verify-code-form');
    if (verifyCodeForm) {
        verifyCodeForm.addEventListener('submit', function (event) {
            event.preventDefault();
            console.log('ارسال فرم تأیید کد...');
            showLoading(true);
            const formData = new FormData(verifyCodeForm);
            const userId = localStorage.getItem('userId');
            const role = localStorage.getItem('role');
            if (!userId || !role) {
                console.log('userId یا role غایب:', { userId, role });
                alert('خطا: userId یا role یافت نشد!');
                showLoading(false);
                return;
            }
            formData.append('userId', userId);
            formData.append('role', role);
            console.log('داده‌های فرم تأیید:', Object.fromEntries(formData));
            fetch(`${baseUrl}/api/verify-auth`, {
                method: 'POST',
                body: formData
            })
                .then(response => {
                    console.log('پاسخ /api/verify-auth:', response.status, response.statusText);
                    if (!response.ok) {
                        return response.json().then(err => {
                            throw new Error(err.message || 'پاسخ سرور غیرمنتظره: ' + response.status);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('تأیید موفق:', data);
                    alert(data.message);
                    localStorage.setItem('userId', data.userId);
                    localStorage.setItem('role', data.role);
                    window.location.href = data.role === 'shop_owner' ? 'shop-owner-panel.html' : data.role === 'admin' ? 'admin-panel.html' : 'customer-panel.html';
                })
                .catch(error => {
                    console.error('خطا در تأیید کد:', error);
                    alert('خطایی رخ داد: ' + error.message);
                })
                .finally(() => {
                    showLoading(false);
                });
        });
    }

    // فرم ورود (مشتری، مغازه‌دار، یا ادمین)
    const loginForm = document.getElementById('login-form-content');
    if (loginForm) {
        console.log('فرم ورود پیدا شد');
        loginForm.addEventListener('submit', function (event) {
            event.preventDefault();
            console.log('کلیک روی ورود');
            showLoading(true);
            const formData = new FormData(loginForm);
            const userId = formData.get('userId');
            const password = formData.get('password');
            const role = formData.get('role');
            if (!userId || !password || !role) {
                console.log('فیلدهای ناقص:', { userId, password, role });
                alert('لطفاً همه فیلدها را پر کنید!');
                showLoading(false);
                return;
            }
            console.log('داده‌های فرم ورود:', Object.fromEntries(formData));
            fetch(`${baseUrl}/api/pre-login`, {
                method: 'POST',
                body: formData
            })
                .then(response => {
                    console.log('پاسخ /api/pre-login:', response.status, response.statusText);
                    if (!response.ok) {
                        return response.json().then(err => {
                            console.log('پیام خطای سرور:', err);
                            throw new Error(err.message || 'پاسخ سرور غیرمنتظره: ' + response.status);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('پاسخ ورود:', data);
                    alert(data.message);
                    localStorage.setItem('userId', data.userId);
                    localStorage.setItem('authEmail', data.email);
                    localStorage.setItem('role', data.role);
                    const loginFormContainer = document.getElementById('login-form-container');
                    const verifyForm = document.getElementById('verify-code');
                    if (loginFormContainer && verifyForm) {
                        loginFormContainer.style.display = 'none';
                        verifyForm.style.display = 'block';
                        document.getElementById('verify-email').value = data.email || '';
                        console.log('نمایش فرم تأیید کد ورود');
                    } else {
                        console.log('فرم verify-code یا login-form-container پیدا نشد');
                        alert('خطا: فرم تأیید یا ورود پیدا نشد!');
                    }
                })
                .catch(error => {
                    console.error('خطا در ورود:', error);
                    alert('خطایی رخ داد: ' + error.message);
                })
                .finally(() => {
                    showLoading(false);
                });
        });
    }

    // دکمه دریافت کد در فرم تأیید (ورود)
    const getCodeBtn = document.getElementById('get-code');
    if (getCodeBtn) {
        getCodeBtn.addEventListener('click', function () {
            showLoading(true);
            const email = document.getElementById('verify-email').value;
            if (email) {
                fetch(`${baseUrl}/api/send-code`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                })
                    .then(response => {
                        console.log('پاسخ /api/send-code:', response.status, response.statusText);
                        if (!response.ok) {
                            return response.json().then(err => { throw new Error(err.message || 'پاسخ سرور غیرمنتظره: ' + response.status); });
                        }
                        return response.json();
                    })
                    .then(data => {
                        console.log('ارسال کد موفق');
                        alert(data.message);
                    })
                    .catch(error => {
                        console.error('خطا در ارسال کد:', error);
                        alert('خطایی رخ داد: ' + error.message);
                    })
                    .finally(() => {
                        showLoading(false);
                    });
            } else {
                alert('لطفاً ایمیل را وارد کنید.');
                showLoading(false);
            }
        });
    }

    // فرم بازیابی رمز
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', function (event) {
            event.preventDefault();
            document.getElementById('login-form-container').style.display = 'none';
            document.getElementById('verify-code').style.display = 'none';
            document.getElementById('reset-password').style.display = 'block';
        });
    }

    const getResetCodeBtn = document.getElementById('get-reset-code');
    if (getResetCodeBtn) {
        getResetCodeBtn.addEventListener('click', function () {
            showLoading(true);
            const email = document.getElementById('reset-email').value;
            const role = document.getElementById('reset-role').value;
            if (email && role) {
                fetch(`${baseUrl}/api/send-code`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                })
                    .then(response => {
                        console.log('پاسخ /api/send-code:', response.status, response.statusText);
                        if (!response.ok) {
                            return response.json().then(err => { throw new Error(err.message || 'پاسخ سرور غیرمنتظره: ' + response.status); });
                        }
                        return response.json();
                    })
                    .then(data => {
                        console.log('ارسال کد موفق');
                        alert(data.message);
                    })
                    .catch(error => {
                        console.error('خطا در ارسال کد:', error);
                        alert('خطایی رخ داد: ' + error.message);
                    })
                    .finally(() => {
                        showLoading(false);
                    });
            } else {
                alert('لطفاً ایمیل و نقش را وارد کنید.');
                showLoading(false);
            }
        });
    }

    const resetPasswordForm = document.getElementById('reset-password-form');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', function (event) {
            event.preventDefault();
            console.log('ارسال فرم بازیابی رمز...');
            showLoading(true);
            const formData = new FormData(resetPasswordForm);
            const newPassword = formData.get('new-password');
            const confirmNewPassword = formData.get('confirm-new-password');
            const userId = formData.get('userId');
            const role = formData.get('role');
            console.log('داده‌های فرم بازیابی:', Object.fromEntries(formData));
            if (newPassword !== confirmNewPassword) {
                console.log('خطا: رمزها مطابقت ندارند');
                alert('رمز عبور جدید و تأیید رمز مطابقت ندارند!');
                showLoading(false);
                return;
            }
            if (!userId || !role) {
                console.log('خطا: userId یا role غایب:', { userId, role });
                alert('لطفاً شناسه کاربر (کد ملی یا موبایل) و نقش را وارد کنید!');
                showLoading(false);
                return;
            }
            fetch(`${baseUrl}/api/reset-password`, {
                method: 'POST',
                body: formData
            })
                .then(response => {
                    console.log('پاسخ /api/reset-password:', response.status, response.statusText);
                    if (!response.ok) {
                        return response.json().then(err => {
                            console.log('پیام خطای سرور:', err);
                            throw new Error(err.message || `پاسخ سرور غیرمنتظره: ${response.status}`);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('بازیابی رمز موفق');
                    alert(data.message);
                    document.getElementById('reset-password').style.display = 'none';
                    document.getElementById('login-form-container').style.display = 'block';
                })
                .catch(error => {
                    console.error('خطا در بازیابی رمز:', error);
                    alert('خطایی در بازیابی رمز رخ داد: ' + error.message);
                })
                .finally(() => {
                    showLoading(false);
                });
        });
    }

    // پنل کاربر بعد از ورود
    const userPanel = document.getElementById('user-panel');
    if (userPanel) {
        const userId = localStorage.getItem('userId');
        const role = localStorage.getItem('role');
        if (userId && role) {
            showLoading(true);
            fetch(`${baseUrl}/api/user-profile?userId=${userId}`)
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(err => { throw new Error(err.message || 'پاسخ سرور غیرمنتظره'); });
                    }
                    return response.json();
                })
                .then(user => {
                    console.log('داده‌های کاربر:', user);
                    const userGreeting = document.getElementById('user-greeting');
                    if (userGreeting) {
                        userGreeting.textContent = `خوش آمدید، ${user.fullName || 'کاربر'}`;
                    } else {
                        console.warn('عنصر user-greeting یافت نشد');
                    }
                    userPanel.style.display = 'block';

                    if (role === 'shop_owner') {
                        const shopOwnerPanel = document.getElementById('shop-owner-panel');
                        if (shopOwnerPanel) {
                            shopOwnerPanel.style.display = 'block';
                            const profileShopName = document.getElementById('profile-shop-name');
                            const profileFullName = document.getElementById('profile-full-name');
                            const profileNationalId = document.getElementById('profile-national-id');
                            const profileEmail = document.getElementById('profile-email');
                            const profileMobile = document.getElementById('profile-mobile');
                            const profileAddress = document.getElementById('profile-address');
                            const profilePostalCode = document.getElementById('profile-postal-code');

                            if (profileShopName) profileShopName.textContent = user.shopName || 'ثبت نشده';
                            else console.warn('عنصر profile-shop-name یافت نشد');
                            if (profileFullName) profileFullName.textContent = user.fullName || 'نامعلوم';
                            else console.warn('عنصر profile-full-name یافت نشد');
                            if (profileNationalId) profileNationalId.textContent = user.nationalId || 'ثبت نشده';
                            else console.warn('عنصر profile-national-id یافت نشد');
                            if (profileEmail) profileEmail.textContent = user.email || 'نامعلوم';
                            else console.warn('عنصر profile-email یافت نشد');
                            if (profileMobile) profileMobile.textContent = user.mobile || 'نامعلوم';
                            else console.warn('عنصر profile-mobile یافت نشد');
                            if (profileAddress) profileAddress.textContent = user.address || 'ثبت نشده';
                            else console.warn('عنصر profile-address یافت نشد');
                            if (profilePostalCode) profilePostalCode.textContent = user.postalCode || 'ثبت نشده';
                            else console.warn('عنصر profile-postal-code یافت نشد');

                            if (!user.approved) {
                                    console.log('کاربر در انتظار تأیید:', userId);
                                    const existingMessage = document.getElementById('pending-approval-message');
                                    if (!existingMessage) {
                                        const messageDiv = document.createElement('div');
                                        messageDiv.id = 'pending-approval-message';
                                        messageDiv.style.color = 'red';
                                        messageDiv.style.textAlign = 'center';
                                        messageDiv.style.margin = '10px 0';
                                        messageDiv.textContent = 'حساب شما در انتظار تأیید ادمین است. تا زمان تأیید، امکان افزودن محصول یا آپلود بنر ندارید.';
                                        userPanel.appendChild(messageDiv);
                                    }

                                const bannerForm = document.getElementById('banner-form');
                                const productForm = document.getElementById('product-form');
                                if (bannerForm) {
                                    const bannerSubmitBtn = bannerForm.querySelector('button[type="submit"]');
                                    if (bannerSubmitBtn) {
                                        bannerSubmitBtn.disabled = true;
                                        bannerForm.style.opacity = '0.5';
                                    }
                                }
                                if (productForm) {
                                    const productSubmitBtn = productForm.querySelector('button[type="submit"]');
                                    if (productSubmitBtn) {
                                        productSubmitBtn.disabled = true;
                                        productForm.style.opacity = '0.5';
                                    }
                                }
                            } else {
                                const existingMessage = document.getElementById('pending-approval-message');
                                if (existingMessage) {
                                    existingMessage.remove();
                                }
                                const bannerForm = document.getElementById('banner-form');
                                const productForm = document.getElementById('product-form');
                                if (bannerForm) {
                                    const bannerSubmitBtn = bannerForm.querySelector('button[type="submit"]');
                                    if (bannerSubmitBtn) {
                                        bannerSubmitBtn.disabled = false;
                                        bannerForm.style.opacity = '1';
                                    }
                                }
                                if (productForm) {
                                    const productSubmitBtn = productForm.querySelector('button[type="submit"]');
                                    if (productSubmitBtn) {
                                        productSubmitBtn.disabled = false;
                                        productForm.style.opacity = '1';
                                    }
                                }
                            }
                        } else {
                            console.warn('عنصر shop-owner-panel یافت نشد');
                        }
                    }
                })
                .catch(error => {
                    console.error('خطا در بارگذاری اطلاعات کاربر:', error);
                    alert('خطایی در بارگذاری اطلاعات کاربر رخ داد: ' + error.message);
                })
                .finally(() => {
                    showLoading(false);
                });
        } else {
            console.log('userId یا role غایب:', { userId, role });
            window.location.href = 'index.html';
        }
    }

    // فرم پروفایل (با نقشه)
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        const userId = localStorage.getItem('userId');
        const role = localStorage.getItem('role');

        if (userId && role) {
            showLoading(true);

            // گرفتن اطلاعات پروفایل و پر کردن بخش‌های نمایشی و فیلدهای فرم
            fetch(`${baseUrl}/api/user-profile?userId=${userId}`)
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(err => { throw new Error(err.message || 'پاسخ سرور غیرمنتظره'); });
                    }
                    return response.json();
                })
                .then(user => {
                    console.log('داده‌های پروفایل دریافت شد:', user);

                    // پر کردن بخش‌های نمایشی
                    const profileShopName = document.getElementById('profile-shop-name');
                    const profileFullName = document.getElementById('profile-full-name');
                    const profileNationalId = document.getElementById('profile-national-id');
                    const profileEmail = document.getElementById('profile-email');
                    const profileMobile = document.getElementById('profile-mobile');
                    const profileAddress = document.getElementById('profile-address');
                    const profilePostalCode = document.getElementById('profile-postal-code');

                    if (profileShopName) profileShopName.textContent = user.shopName || 'ثبت نشده';
                    if (profileFullName) profileFullName.textContent = user.fullName || 'نامعلوم';
                    if (profileNationalId) profileNationalId.textContent = user.nationalId || 'ثبت نشده';
                    if (profileEmail) profileEmail.textContent = user.email || 'نامعلوم';
                    if (profileMobile) profileMobile.textContent = user.mobile || 'نامعلوم';
                    if (profileAddress) profileAddress.textContent = user.address || 'ثبت نشده';
                    if (profilePostalCode) profilePostalCode.textContent = user.postalCode || 'ثبت نشده';

                    // پر کردن فیلدهای ورودی فرم برای ویرایش
                    const shopNameInput = document.getElementById('new-shop-name');
                    const addressInput = document.getElementById('new-address');
                    const postalCodeInput = document.getElementById('new-postal-code');
                    if (shopNameInput) shopNameInput.value = user.shopName || '';
                    if (addressInput) addressInput.value = user.address || '';
                    if (postalCodeInput) postalCodeInput.value = user.postalCode || '';
                    if (document.getElementById('whatsapp')) document.getElementById('whatsapp').value = user.whatsapp || '';
                    if (document.getElementById('telegram')) document.getElementById('telegram').value = user.telegram || '';
                    if (document.getElementById('instagram')) document.getElementById('instagram').value = user.instagram || '';
                    if (document.getElementById('eitaa')) document.getElementById('eitaa').value = user.eitaa || '';
                    if (document.getElementById('rubika')) document.getElementById('rubika').value = user.rubika || '';
                    if (document.getElementById('bale')) document.getElementById('bale').value = user.bale || '';
                    if (document.getElementById('website')) document.getElementById('website').value = user.website || '';

                    const latInput = document.getElementById('location-lat');
                    const lngInput = document.getElementById('location-lng');
                    if (latInput) latInput.value = user.location?.lat || '';
                    if (lngInput) lngInput.value = user.location?.lng || '';

                    // مقداردهی اولیه نقشه پروفایل با لوکیشن از دیتابیس
                    const profileMapDiv = document.getElementById('location-map');
                    if (profileMapDiv && typeof L !== 'undefined') {
                        let map;
                        if (profileMapDiv._leaflet_id) {
                            map = profileMapDiv.__leaflet_map;
                            if (map) map.remove();
                            profileMapDiv._leaflet_id = null;
                        }

                        map = L.map('location-map').setView(
                            user.location && user.location.lat && user.location.lng ? [user.location.lat, user.location.lng] : [35.6892, 51.3890],
                            13
                        );
                        profileMapDiv.__leaflet_map = map;
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            maxZoom: 19,
                            attribution: '© OpenStreetMap'
                        }).addTo(map);

                        let marker;
                        if (user.location && user.location.lat && user.location.lng) {
                            marker = L.marker([user.location.lat, user.location.lng]).addTo(map).bindPopup('لوکیشن ذخیره‌شده').openPopup();
                        } else {
                            marker = L.marker([35.6892, 51.3890]).addTo(map).bindPopup('لوکیشن پیش‌فرض').openPopup();
                            if (latInput) latInput.value = 35.6892;
                            if (lngInput) lngInput.value = 51.3890;
                        }

                        map.on('click', function (e) {
                            if (marker) {
                                marker.setLatLng(e.latlng);
                            } else {
                                marker = L.marker(e.latlng).addTo(map);
                            }
                            if (latInput) latInput.value = e.latlng.lat;
                            if (lngInput) lngInput.value = e.latlng.lng;
                        });
                    } else if (profileMapDiv) {
                        console.error('Leaflet تعریف نشده یا مشکلی در بارگذاری وجود دارد');
                        profileMapDiv.innerHTML = '<p>خطا در بارگذاری نقشه. لطفاً اتصال اینترنت را بررسی کنید.</p>';
                    }
                })
                .catch(error => {
                    console.error('خطا در گرفتن اطلاعات پروفایل:', error);
                    alert('خطایی در بارگذاری اطلاعات پروفایل رخ داد: ' + error.message);
                })
                .finally(() => {
                    showLoading(false);
                });

            // مدیریت ارسال فرم برای به‌روزرسانی (با چک لوکیشن)
            profileForm.addEventListener('submit', function (event) {
                event.preventDefault();
                console.log('ارسال فرم پروفایل برای به‌روزرسانی...');
                showLoading(true);
                const formData = new FormData(profileForm);
                const newPassword = formData.get('new-password');
                const confirmNewPassword = formData.get('confirm-new-password');
                const lat = formData.get('location-lat');
                const lng = formData.get('location-lng');
                if (newPassword && newPassword !== confirmNewPassword) {
                    alert('رمز عبور جدید و تأیید رمز مطابقت ندارند!');
                    showLoading(false);
                    return;
                }
                if (lat && lng && (isNaN(parseFloat(lat)) || isNaN(parseFloat(lng)))) {
                    alert('لوکیشن معتبر نیست!');
                    showLoading(false);
                    return;
                }
                formData.append('userId', userId);
                formData.append('role', role);
                console.log('داده‌های پروفایل برای به‌روزرسانی:', Object.fromEntries(formData));

                fetch(`${baseUrl}/api/update-profile`, {
                    method: 'POST',
                    body: formData
                })
                    .then(response => {
                        if (!response.ok) {
                            return response.json().then(err => { throw new Error(err.message || 'پاسخ سرور غیرمنتظره'); });
                        }
                        return response.json();
                    })
                    .then(data => {
                        console.log('پروفایل با موفقیت به‌روزرسانی شد:', data);
                        alert(data.message);
                        window.location.reload();  // ریلود صفحه برای نمایش اطلاعات جدید
                    })
                    .catch(error => {
                        console.error('خطا در به‌روزرسانی پروفایل:', error);
                        alert('خطایی رخ داد: ' + error.message);
                    })
                    .finally(() => {
                        showLoading(false);
                    });
            });
        } else {
            alert('برای دسترسی به این بخش، لطفاً ابتدا وارد شوید!');
            window.location.href = 'index.html';
        }
    }

    // فرم آپلود بنر
    const bannerForm = document.getElementById('banner-form');
    if (bannerForm) {
        bannerForm.addEventListener('submit', function (event) {
            event.preventDefault();
            console.log('ارسال فرم بنر...');
            showLoading(true);
            const formData = new FormData(bannerForm);
            const userId = localStorage.getItem('userId');
            const role = localStorage.getItem('role');
            if (userId && role === 'shop_owner') {
                formData.append('userId', userId);
                console.log('داده‌های فرم بنر:', Object.fromEntries(formData));
            } else {
                alert('لطفاً ابتدا به عنوان مغازه‌دار وارد شوید!');
                showLoading(false);
                return;
            }
            fetch(`${baseUrl}/api/upload-banner`, {
                method: 'POST',
                body: formData
            })
                .then(response => {
                    console.log('پاسخ /api/upload-banner:', response.status, response.statusText);
                    if (!response.ok) {
                        return response.json().then(err => { throw new Error(err.message || 'پاسخ سرور غیرمنتظره: ' + response.status); });
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('آپلود بنر موفق');
                    alert(data.message);
                    bannerForm.reset();
                    window.location.reload();
                })
                .catch(error => {
                    console.error('خطا در آپلود بنر:', error);
                    alert('خطایی رخ داد: ' + error.message);
                })
                .finally(() => {
                    showLoading(false);
                });
        });
    }

    // نمایش لیست مغازه‌ها در index.html و customer-panel.html
    const shopsList = document.getElementById('shops-list');
    const searchInput = document.getElementById('search-input');
    if (shopsList) {
        console.log('در حال بارگذاری لیست مغازه‌ها...');
        showLoading(true);

        const role = localStorage.getItem('role');
        const userId = localStorage.getItem('userId');

        // تابع برای گرفتن لیست مغازه‌ها و sort
        const loadShops = (customerProvince = '', customerCity = '', customerRegion = '') => {
            fetch(`${baseUrl}/api/users`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            })
                .then(response => {
                    console.log('پاسخ /api/users:', response.status, response.statusText);
                    if (!response.ok) {
                        return response.json().then(err => { throw new Error(err.message || 'هیچ مغازه‌ای یافت نشد یا خطای سرور رخ داد'); });
                    }
                    return response.json();
                })
                .then(userIds => {
                    console.log('لیست کاربران:', userIds);
                    shopsList.innerHTML = '';
                    if (!userIds.length) {
                        console.log('هیچ مغازه‌ای یافت نشد');
                        shopsList.innerHTML = '<p>هیچ مغازه‌ای وجود ندارد!</p>';
                        showLoading(false);
                        return;
                    }

                    // لیست مغازه‌ها با جزئیات کامل (برای sort)
                    let shops = [];

                    // fetch جزئیات هر مغازه
                    const promises = userIds.map(uid => 
                        fetch(`${baseUrl}/api/user?userId=${uid}`)
                            .then(response => {
                                if (!response.ok) {
                                    return response.json().then(err => { throw new Error(err.message || `پاسخ سرور غیرمنتظره: ${response.status}`); });
                                }
                                return response.json();
                            })
                            .then(user => {
                                shops.push({
                                    uid: uid,
                                    shopName: user.shopName.toLowerCase(),
                                    owner: user.owner,
                                    phone: user.phone,
                                    whatsapp: user.whatsapp,
                                    telegram: user.telegram,
                                    instagram: user.instagram,
                                    eitaa: user.eitaa,
                                    rubika: user.rubika,
                                    bale: user.bale,
                                    website: user.website,
                                    bannerUrl: user.bannerUrl,
                                    province: user.province ? user.province.toLowerCase() : '',
                                    city: user.city ? user.city.toLowerCase() : '',
                                    region: user.region ? user.region.toLowerCase() : ''  // فیلد جدید منطقه
                                });
                            })
                            .catch(error => {
                                console.error(`خطا در گرفتن اطلاعات کاربر ${uid}:`, error);
                                shopsList.innerHTML += `<p>خطا در بارگذاری مغازه ${uid}</p>`;
                            })
                    );

                    // بعد از گرفتن همه، sort و نمایش
                    Promise.all(promises).then(() => {
                        console.log('لیست کامل shops قبل از sort:', shops);

                        // sort بر اساس اولویت لوکیشن (فقط برای مشتری)
                        if (role === 'customer' && customerProvince && customerCity) {
                            shops.sort((a, b) => {
                                const getPriority = (shop) => {
                                    if (shop.province === customerProvince && shop.city === customerCity && shop.region === customerRegion) return 0;  // اولویت اول: منطقه مشتری
                                    if (shop.province === customerProvince && shop.city === customerCity) return 1;  // اولویت دوم: شهر مشتری (غیر منطقه)
                                    if (shop.province === customerProvince) return 2;  // اولویت سوم: استان مشتری (غیر شهر)
                                    return 3;  // بقیه
                                };
                                return getPriority(a) - getPriority(b);
                            });
                        }

                        console.log('لیست shops بعد از sort:', shops);

                        // چک اگر هیچ مغازه‌ای در شهر مشتری نبود
                        const hasCityMatch = shops.some(shop => shop.city === customerCity);
                        if (role === 'customer' && !hasCityMatch && customerCity) {
                            shopsList.innerHTML += '<p style="color: red; text-align: center;">هیچ مغازه‌ای در شهر شما (' + customerCity + ') یافت نشد. نمایش مغازه‌های استان و سایر مناطق.</p>';
                        }

                        // نمایش لیست مرتب‌شده
                        shops.forEach(shop => {
                            const li = document.createElement('li');
                            if (shop.bannerUrl) {
                                const img = document.createElement('img');
                                img.src = shop.bannerUrl;
                                img.alt = 'بنر مغازه';
                                img.style.width = '100px';
                                li.appendChild(img);
                            }
                            li.innerHTML += `<h3>${shop.shopName}</h3>
                                <p>صاحب: ${shop.owner}</p>
                                <p>تلفن: ${shop.phone}</p>`;
                            if (shop.whatsapp) li.innerHTML += `<p>واتس‌اپ: <a href="https://wa.me/${shop.whatsapp}" target="_blank"><i class="fab fa-whatsapp"></i> چت</a></p>`;
                            if (shop.telegram) li.innerHTML += `<p>تلگرام: <a href="https://t.me/${shop.telegram}" target="_blank"><i class="fab fa-telegram"></i> چت</a></p>`;
                            if (shop.instagram) li.innerHTML += `<p>اینستاگرام: <a href="https://instagram.com/${shop.instagram}" target="_blank"><i class="fab fa-instagram"></i> پروفایل</a></p>`;
                            if (shop.eitaa) li.innerHTML += `<p>ایتا: <a href="https://eitaa.com/${shop.eitaa}" target="_blank"><i class="fas fa-comment"></i> چت</a></p>`;
                            if (shop.rubika) li.innerHTML += `<p>روبیکا: <a href="https://rubika.ir/${shop.rubika}" target="_blank"><i class="fas fa-comment-alt"></i> چت</a></p>`;
                            if (shop.bale) li.innerHTML += `<p>بله: <a href="https://bale.ai/${shop.bale}" target="_blank"><i class="fas fa-comment-dots"></i> چت</a></p>`;
                            li.dataset.shopId = shop.uid;
                            li.dataset.shopName = shop.shopName;
                            li.addEventListener('click', function () {
                                window.location.href = `shop-details.html?shopId=${shop.uid}`;
                            });
                            shopsList.appendChild(li);
                        });

                        // سرچ همچنان کار کنه
                        if (searchInput) {
                            searchInput.addEventListener('input', function () {
                                const filter = searchInput.value.toLowerCase();
                                const li = shopsList.getElementsByTagName('li');
                                Array.from(li).forEach(function (item) {
                                    const shopName = item.dataset.shopName || '';
                                    if (shopName.indexOf(filter) > -1) {
                                        item.style.display = '';
                                    } else {
                                        item.style.display = 'none';
                                    }
                                });
                            });
                        }
                    });
                })
                .catch(error => {
                    console.error('خطا در بارگذاری لیست مغازه‌ها:', error);
                    shopsList.innerHTML = '<p>هیچ مغازه‌ای وجود ندارد!</p>';
                })
                .finally(() => {
                    showLoading(false);
                });
        };

        // اگر مشتری باشه، اول لوکیشن بگیر، بعد loadShops رو صدا بزن
        if (role === 'customer' && userId) {
            fetch(`${baseUrl}/api/user-profile?userId=${userId}`)
                .then(response => response.json())
                .then(user => {
                    const customerProvince = user.province ? user.province.toLowerCase() : '';
                    const customerCity = user.city ? user.city.toLowerCase() : '';
                    const customerRegion = user.region ? user.region.toLowerCase() : '';  // فیلد جدید منطقه
                    console.log('لوکیشن مشتری:', { customerProvince, customerCity, customerRegion });
                    loadShops(customerProvince, customerCity, customerRegion);
                })
                .catch(error => {
                    console.error('خطا در گرفتن لوکیشن مشتری:', error);
                    loadShops();  // اگر خطا، لیست عادی
                });
        } else {
            loadShops();  // برای غیرمشتری، لیست عادی
        }
    }

    // نمایش جزئیات مغازه در shop-details.html
    if (window.location.pathname.includes('shop-details.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const shopId = urlParams.get('shopId');
        if (shopId) {
            try {
                showLoading(true);
                fetch(`${baseUrl}/api/user?userId=${shopId}`)
                    .then(response => {
                        console.log('پاسخ /api/user:', response.status, response.statusText);
                        if (!response.ok) {
                            return response.json().then(err => { throw new Error(err.message || `پاسخ سرور غیرمنتظره: ${response.status}`); });
                        }
                        return response.json();
                    })
                    .then(user => {
                        console.log('داده‌های مغازه:', user);
                        const shopNameElement = document.getElementById('shop-name');
                        const shopOwnerElement = document.getElementById('shop-owner');
                        const shopPhoneElement = document.getElementById('shop-phone');
                        const shopWebsiteElement = document.getElementById('shop-website');

                        if (shopNameElement) shopNameElement.textContent = user.shopName || 'نامعلوم';
                        if (shopOwnerElement) shopOwnerElement.textContent = user.owner || 'نامعلوم';
                        if (shopPhoneElement) shopPhoneElement.textContent = user.phone || 'نامعلوم';

                        const socialLinks = [
                            { id: 'whatsapp', platform: 'whatsapp', icon: 'fab fa-whatsapp', text: 'چت در واتس‌اپ', urlPrefix: 'https://wa.me/' },
                            { id: 'telegram', platform: 'telegram', icon: 'fab fa-telegram', text: 'چت در تلگرام', urlPrefix: 'https://t.me/' },
                            { id: 'instagram', platform: 'instagram', icon: 'fab fa-instagram', text: 'پروفایل اینستاگرام', urlPrefix: 'https://instagram.com/' },
                            { id: 'eitaa', platform: 'eitaa', icon: 'fas fa-comment', text: 'چت در ایتا', urlPrefix: 'https://eitaa.com/' },
                            { id: 'rubika', platform: 'rubika', icon: 'fas fa-comment-alt', text: 'چت در روبیکا', urlPrefix: 'https://rubika.ir/' },
                            { id: 'bale', platform: 'bale', icon: 'fas fa-comment-dots', text: 'چت در بله', urlPrefix: 'https://bale.ai/' }
                        ];

                        socialLinks.forEach(link => {
                            if (user[link.platform]) {
                                const element = document.getElementById(`shop-${link.id}`);
                                const linkElement = document.getElementById(`${link.id}-link`);
                                if (element && linkElement) {
                                    element.href = `${link.urlPrefix}${user[link.platform]}`;
                                    element.innerHTML = `<i class="${link.icon}"></i> ${link.text}`;
                                    linkElement.style.display = 'block';
                                }
                            }
                        });

                        if (shopWebsiteElement) {
                            if (user.website) {
                                shopWebsiteElement.href = user.website;
                                shopWebsiteElement.textContent = user.website;
                            } else {
                                shopWebsiteElement.textContent = 'نامعلوم';
                            }
                        }

                        // نمایش نقشه لوکیشن
                        const shopMapDiv = document.getElementById('shop-map');
                        if (shopMapDiv && typeof L !== 'undefined') {
                            let map;
                            if (shopMapDiv._leaflet_id) {
                                map = shopMapDiv.__leaflet_map;
                                if (map) map.remove();
                                shopMapDiv._leaflet_id = null;
                            }

                            map = L.map('shop-map').setView(
                                user.location && user.location.lat && user.location.lng ? [user.location.lat, user.location.lng] : [35.6892, 51.3890],
                                13
                            );
                            shopMapDiv.__leaflet_map = map;
                            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                maxZoom: 19,
                                attribution: '© OpenStreetMap'
                            }).addTo(map);

                            L.marker(
                                user.location && user.location.lat && user.location.lng ? [user.location.lat, user.location.lng] : [35.6892, 51.3890]
                            ).addTo(map)
                                .bindPopup(`${user.shopName || 'مغازه'}`)
                                .openPopup();
                        } else if (shopMapDiv) {
                            shopMapDiv.innerHTML = '<p>خطا در بارگذاری نقشه. لطفاً اتصال اینترنت را بررسی کنید.</p>';
                            const mapErrorElement = document.getElementById('map-error');
                            if (mapErrorElement) mapErrorElement.style.display = 'block';
                        }
                    })
                    .catch(error => {
                        console.error('خطا در گرفتن اطلاعات مغازه:', error);
                        alert(`خطایی در بارگذاری اطلاعات مغازه رخ داد: ${error.message}`);
                    })
                    .finally(() => {
                        showLoading(false);
                    });

                const productSearchInput = document.getElementById('product-search-input');
                const shopProductList = document.getElementById('shop-product-list');
                let allProducts = [];

                if (shopProductList) {
                    showLoading(true);
                    fetch(`${baseUrl}/api/products?userId=${shopId}`)
                        .then(response => {
                            console.log('پاسخ /api/products:', response.status, response.statusText);
                            if (!response.ok) {
                                return response.json().then(err => { throw new Error(err.message || `پاسخ سرور غیرمنتظره: ${response.status}`); });
                            }
                            return response.json();
                        })
                        .then(products => {
                            console.log('محصولات:', products);
                            allProducts = products;
                            shopProductList.innerHTML = '';
                            if (!products.length) {
                                shopProductList.innerHTML = '<p>هیچ محصولی یافت نشد!</p>';
                                return;
                            }

                            function renderProducts(filter = '') {
                                shopProductList.innerHTML = '';
                                const filteredProducts = allProducts.filter(product =>
                                    product.approved && (
                                        product.name.toLowerCase().includes(filter.toLowerCase()) ||
                                        product.description.toLowerCase().includes(filter.toLowerCase())
                                    )
                                );

                                if (!filteredProducts.length) {
                                    shopProductList.innerHTML = '<p>هیچ محصولی با این جستجو یافت نشد!</p>';
                                    return;
                                }

                                filteredProducts.forEach(product => {
                                    const li = document.createElement('li');
                                    if (product.imageUrl) {
                                        const img = document.createElement('img');
                                        img.src = product.imageUrl;
                                        img.alt = 'عکس محصول';
                                        img.style.width = '50px';
                                        img.style.marginRight = '10px';
                                        img.style.cursor = 'pointer';
                                        img.addEventListener('click', () => {
                                            const modal = document.getElementById('image-modal');
                                            const modalImg = document.getElementById('modal-image');
                                            if (modal && modalImg) {
                                                modal.style.display = 'block';
                                                modalImg.src = product.imageUrl;
                                            }
                                        });
                                        li.appendChild(img);
                                    }
                                    li.appendChild(document.createTextNode(`${product.name} – ${product.description}`));
                                    if (product.instagramLink) {
                                        const instaLink = document.createElement('a');
                                        instaLink.href = product.instagramLink;
                                        instaLink.textContent = ' اینستاگرام';
                                        instaLink.target = '_blank';
                                        li.appendChild(instaLink);
                                    }
                                    shopProductList.appendChild(li);
                                });
                            }

                            renderProducts();

                            if (productSearchInput) {
                                productSearchInput.addEventListener('input', function () {
                                    const filter = productSearchInput.value;
                                    console.log('جستجوی محصولات با فیلتر:', filter);
                                    renderProducts(filter);
                                });
                            }
                        })
                        .catch(error => {
                            console.error('خطا در گرفتن محصولات:', error);
                            shopProductList.innerHTML = '<p>خطا در بارگذاری محصولات</p>';
                            alert(`خطایی در بارگذاری محصولات رخ داد: ${error.message}`);
                        })
                        .finally(() => {
                            showLoading(false);
                        });
                }
            } catch (e) {
                        console.error('کرش کلی در shop-details:', e);
                        alert(`خطا در لود صفحه: ${e.message}`);
                    }
                } else {
                    alert('شناسه مغازه یافت نشد!');
                    window.location.href = 'index.html';
                }
            }

    // کد برای پنل ادمین
    if (window.location.pathname.includes('admin-panel.html')) {
        console.log('در صفحه پنل ادمین هستیم.');
        const userId = localStorage.getItem('userId');
        const role = localStorage.getItem('role');
        if (!userId || role !== 'admin') {
            alert('دسترسی غیرمجاز! لطفاً به عنوان ادمین وارد شوید.');
            window.location.href = 'login.html';
        } else {
            const userPanel = document.getElementById('user-panel');
            const userGreeting = document.getElementById('user-greeting');
            if (userPanel && userGreeting) {
                userGreeting.textContent = `خوش آمدید، ادمین (${userId})`;
                userPanel.style.display = 'block';
            }

            function fetchPendingUsers() {
                console.log('در حال واکشی کاربران در انتظار تأیید...');
                showLoading(true);
                fetch(`${baseUrl}/api/pending-users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ adminId: userId })
                })
                    .then(response => {
                        console.log('پاسخ /api/pending-users:', response.status, response.statusText);
                        if (!response.ok) {
                            return response.json().then(err => { throw new Error(err.message || 'خطا در دریافت لیست کاربران'); });
                        }
                        return response.json();
                    })
                    .then(users => {
                        console.log('کاربران دریافت شده:', users);
                        const list = document.getElementById('pending-users-list');
                        while (list.rows.length > 1) {
                            list.deleteRow(1);
                        }
                        if (users.length === 0) {
                            const row = list.insertRow();
                            const cell = row.insertCell();
                            cell.colSpan = 9;
                            cell.textContent = 'هیچ کاربری در انتظار تأیید نیست.';
                            cell.style.textAlign = 'center';
                        } else {
                            users.forEach(user => {
                                const row = list.insertRow();
                                row.insertCell().textContent = user.shopId;
                                row.insertCell().textContent = user.nationalId;
                                row.insertCell().textContent = user.fullName;
                                row.insertCell().textContent = user.email;
                                row.insertCell().textContent = user.mobile;
                                row.insertCell().innerHTML = `<a href="${user.nationalCardUrl}" target="_blank">مشاهده</a>`;
                                row.insertCell().innerHTML = `<a href="${user.selfieUrl}" target="_blank">مشاهده</a>`;
                                row.insertCell().innerHTML = `<a href="${user.businessLicenseUrl}" target="_blank">مشاهده</a>`;
                                const actionCell = row.insertCell();
                                const approveBtn = document.createElement('button');
                                approveBtn.textContent = 'تأیید';
                                approveBtn.className = 'approve-btn';
                                approveBtn.onclick = () => approveUser(user.shopId);
                                actionCell.appendChild(approveBtn);
                            });
                        }
                    })
                    .catch(error => {
                        console.error('خطا در بارگذاری کاربران:', error);
                        alert('خطا در بارگذاری کاربران: ' + error.message);
                    })
                    .finally(() => {
                        showLoading(false);
                    });
            }

            function fetchPendingProducts() {
                console.log('در حال واکشی محصولات در انتظار تأیید...');
                showLoading(true);
                fetch(`${baseUrl}/api/pending-products`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ adminId: userId })
                })
                    .then(response => {
                        console.log('پاسخ /api/pending-products:', response.status, response.statusText);
                        if (!response.ok) {
                            return response.json().then(err => { throw new Error(err.message || 'خطا در دریافت لیست محصولات'); });
                        }
                        return response.json();
                    })
                    .then(products => {
                        console.log('محصولات دریافت شده:', products);
                        const list = document.getElementById('pending-products-list');
                        while (list.rows.length > 1) {
                            list.deleteRow(1);
                        }
                        if (products.length === 0) {
                            const row = list.insertRow();
                            const cell = row.insertCell();
                            cell.colSpan = 6;
                            cell.textContent = 'هیچ محصولی در انتظار تأیید نیست.';
                            cell.style.textAlign = 'center';
                        } else {
                            products.forEach(product => {
                                const row = list.insertRow();
                                row.insertCell().textContent = product._id;
                                row.insertCell().textContent = product.userId;
                                row.insertCell().textContent = product.name;
                                row.insertCell().textContent = product.description;
                                row.insertCell().innerHTML = product.imageUrl ? `<a href="${product.imageUrl}" target="_blank">مشاهده</a>` : 'بدون تصویر';
                                const actionCell = row.insertCell();
                                const approveBtn = document.createElement('button');
                                approveBtn.textContent = 'تأیید';
                                approveBtn.className = 'approve-product-btn';
                                approveBtn.onclick = () => approveProduct(product._id);
                                actionCell.appendChild(approveBtn);
                            });
                        }
                    })
                    .catch(error => {
                        console.error('خطا در بارگذاری محصولات:', error);
                        alert('خطا در بارگذاری محصولات: ' + error.message);
                    })
                    .finally(() => {
                        showLoading(false);
                    });
            }

            window.approveUser = function(userToApproveId) {
                if (!confirm(`آیا از تأیید کاربر با شناسه ${userToApproveId} مطمئن هستید؟`)) return;
                showLoading(true);
                fetch(`${baseUrl}/api/approve-user`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: userToApproveId, adminId: userId })
                })
                    .then(response => {
                        console.log('پاسخ /api/approve-user:', response.status, response.statusText);
                        if (!response.ok) {
                            return response.json().then(err => { throw new Error(err.message || 'خطا در تأیید کاربر'); });
                        }
                        return response.json();
                    })
                    .then(data => {
                        alert(data.message);
                        if (data.message.includes('موفقیت')) {
                            fetchPendingUsers();
                        }
                    })
                    .catch(error => {
                        console.error('خطا در تأیید کاربر:', error);
                        alert('خطا: ' + error.message);
                    })
                    .finally(() => {
                        showLoading(false);
                    });
            }

            window.approveProduct = function(productId) {
                if (!confirm(`آیا از تأیید محصول با شناسه ${productId} مطمئن هستید؟`)) return;
                showLoading(true);
                fetch(`${baseUrl}/api/approve-product`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ adminId: userId, productId })
                })
                    .then(response => {
                        console.log('پاسخ /api/approve-product:', response.status, response.statusText);
                        if (!response.ok) {
                            return response.json().then(err => { throw new Error(err.message || 'خطا در تأیید محصول'); });
                        }
                        return response.json();
                    })
                    .then(data => {
                        alert(data.message);
                        if (data.message.includes('موفقیت')) {
                            fetchPendingProducts();
                        }
                    })
                    .catch(error => {
                        console.error('خطا در تأیید محصول:', error);
                        alert('خطا: ' + error.message);
                    })
                    .finally(() => {
                        showLoading(false);
                    });
            }

            fetchPendingUsers();
            fetchPendingProducts();
        }
    }

    // مدیریت modal برای بزرگ‌نمایی عکس
    const modal = document.getElementById('image-modal');
    const modalClose = document.getElementsByClassName('modal-close')[0];
    if (modal && modalClose) {
        modalClose.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // مدیریت دکمه خروج
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
            console.log('دکمه خروج کلیک شد');
            showLoading(true);
            const userId = localStorage.getItem('userId');
            const role = localStorage.getItem('role');
            if (!userId || !role) {
                console.log('userId یا role غایب:', { userId, role });
                alert('لطفاً ابتدا وارد شوید!');
                window.location.href = 'index.html';
                showLoading(false);
                return;
            }
            fetch(`${baseUrl}/api/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, role })
            })
                .then(response => {
                    console.log('پاسخ /api/logout:', response.status, response.statusText);
                    if (!response.ok) {
                        return response.json().then(err => { throw new Error(err.message || 'خطا در خروج'); });
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('خروج موفق:', data);
                    alert(data.message);
                    localStorage.removeItem('userId');
                    localStorage.removeItem('role');
                    localStorage.removeItem('authEmail');
                    window.location.href = 'index.html';
                })
                .catch(error => {
                    console.error('خطا در خروج:', error);
                    alert('خطایی رخ داد: ' + error.message);
                })
                .finally(() => {
                    showLoading(false);
                });
        });
    }

    // بارگذاری محصولات در پنل مغازه‌دار
    function loadProducts() {
        const productList = document.getElementById('product-list');
        if (productList) {
            showLoading(true);
            fetch(`${baseUrl}/api/products?userId=${localStorage.getItem('userId')}`)
                .then(response => {
                    console.log('پاسخ /api/products:', response.status, response.statusText);
                    if (!response.ok) {
                        return response.json().then(err => { throw new Error(err.message || 'خطا در دریافت محصولات'); });
                    }
                    return response.json();
                })
                .then(products => {
                    productList.innerHTML = '';
                    if (!products.length) {
                        productList.innerHTML = '<p>هیچ محصولی یافت نشد!</p>';
                        showLoading(false);
                        return;
                    }
                    products.forEach(product => {
                        const li = document.createElement('li');
                        li.dataset.productId = product._id;
                        if (product.imageUrl) {
                            const img = document.createElement('img');
                            img.src = product.imageUrl;
                            img.alt = 'عکس محصول';
                            img.style.width = '50px';
                            img.style.marginRight = '10px';
                            img.style.cursor = 'pointer';
                            img.addEventListener('click', () => {
                                const modal = document.getElementById('image-modal');
                                const modalImg = document.getElementById('modal-image');
                                if (modal && modalImg) {
                                    modal.style.display = 'block';
                                    modalImg.src = product.imageUrl;
                                }
                            });
                            li.appendChild(img);
                        }
                        li.appendChild(document.createTextNode(`${product.name} – ${product.description}`));
                        if (product.instagramLink) {
                            const instaLink = document.createElement('a');
                            instaLink.href = product.instagramLink;
                            instaLink.textContent = ' اینستاگرام';
                            instaLink.target = '_blank';
                            li.appendChild(instaLink);
                        }
                        if (product.approved) {
                            li.classList.add('approved-product');
                        } else {
                            li.classList.add('pending-product');
                            li.appendChild(document.createTextNode(' (در انتظار تأیید ادمین)'));
                        }
                        // دکمه ویرایش
                        const editBtn = document.createElement('button');
                        editBtn.textContent = 'ویرایش';
                        editBtn.className = 'edit-btn';
                        editBtn.onclick = () => editProduct(product._id, product.name, product.description, product.instagramLink);
                        li.appendChild(editBtn);

                        // دکمه حذف
                        const deleteBtn = document.createElement('button');
                        deleteBtn.textContent = 'حذف';
                        deleteBtn.className = 'delete-btn';
                        deleteBtn.onclick = () => deleteProduct(product._id);
                        li.appendChild(deleteBtn);

                        productList.appendChild(li);
                    });

                    // فعال کردن درگ اند دراپ برای مرتب‌سازی
                    if (typeof Sortable !== 'undefined') {
                        new Sortable(productList, {
                            animation: 150,
                            ghostClass: 'sortable-ghost',
                            onEnd: function () {
                                const order = Array.from(productList.getElementsByTagName('li')).map(li => li.dataset.productId);
                                setTimeout(() => {
                                    fetch(`${baseUrl}/api/update-product-order`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ userId: localStorage.getItem('userId'), order })
                                    })
                                        .then(response => {
                                            if (!response.ok) {
                                                return response.json().then(err => { throw new Error(err.message || 'خطا در ذخیره ترتیب'); });
                                            }
                                            return response.json();
                                        })
                                        .then(data => {
                                            console.log('ترتیب محصولات ذخیره شد:', data);
                                            alert(data.message);
                                            loadProducts();
                                        })
                                        .catch(error => {
                                            console.error('خطا در ذخیره ترتیب:', error);
                                            alert('خطا در ذخیره ترتیب محصولات: ' + error.message);
                                        });
                                }, 500);
                            }
                        });
                    } else {
                        console.error('Sortable.js تعریف نشده است. لطفاً بررسی کنید که اسکریپت لود شده است.');
                    }
                })
                .catch(error => {
                    console.error('خطا در بارگذاری محصولات:', error);
                    productList.innerHTML = '<p>خطا در بارگذاری محصولات</p>';
                    alert('خطا در بارگذاری محصولات: ' + error.message);
                })
                .finally(() => {
                    showLoading(false);
                });
        }
    }
    // بارگذاری محصولات هنگام لود صفحه
    loadProducts();

    // فرم افزودن محصول
    const productForm = document.getElementById('product-form');
    if (productForm) {
        // تنظیم capture برای input محصول
        const productImageInput = document.getElementById('product-image');
        const productImageSource = document.getElementById('product-image-source');
        if (productImageInput && productImageSource) {
            productImageSource.addEventListener('change', () => {
                if (productImageSource.value === 'camera') {
                    productImageInput.setAttribute('capture', 'environment');
                } else {
                    productImageInput.removeAttribute('capture');
                }
            });
        }

        productForm.addEventListener('submit', function (event) {
            event.preventDefault();
            console.log('ارسال فرم محصول...');
            showLoading(true);
            const formData = new FormData(productForm);
            const userId = localStorage.getItem('userId');
            const role = localStorage.getItem('role');
            if (!userId || role !== 'shop_owner') {
                alert('لطفاً ابتدا به عنوان مغازه‌دار وارد شوید!');
                showLoading(false);
                return;
            }
            formData.append('userId', userId);
            console.log('داده‌های فرم محصول:', Object.fromEntries(formData));

            const file = formData.get('product-image');
            if (file && file.size > 0) {
                // چک حجم 4MB
                if (file.size > 4 * 1024 * 1024) {
                    alert('حجم عکس بیش از 4MB است! لطفاً عکس کوچک‌تری انتخاب کنید.');
                    showLoading(false);
                    return;
                }

                // فشرده‌سازی عکس
                new Compressor(file, {
                    quality: 0.6,  // کیفیت 60% برای فشرده‌سازی
                    success(result) {
                        formData.set('product-image', result, result.name);  // جایگزین فایل اصلی با فشرده‌شده
                        sendProduct(formData);  // ارسال بعد از فشرده‌سازی
                    },
                    error(err) {
                        console.error('خطا در فشرده‌سازی:', err.message);
                        alert('خطا در فشرده‌سازی عکس: ' + err.message);
                        showLoading(false);
                    },
                });
            } else {
                sendProduct(formData);  // اگر بدون عکس، مستقیم ارسال
            }
        });
    }

    // تابع برای ارسال محصول
    function sendProduct(formData) {
        fetch(`${baseUrl}/api/add-product`, {
            method: 'POST',
            body: formData
        })
            .then(response => {
                console.log('پاسخ /api/add-product:', response.status, response.statusText);
                if (!response.ok) {
                    return response.json().then(err => { throw new Error(err.message || 'خطا در اضافه کردن محصول'); });
                }
                return response.json();
            })
            .then(data => {
                console.log('محصول اضافه شد:', data);
                alert(data.message);
                productForm.reset();
                loadProducts();  // ریلود لیست محصولات
            })
            .catch(error => {
                console.error('خطا در اضافه کردن محصول:', error);
                alert('خطا در اضافه کردن محصول: ' + error.message);
            })
            .finally(() => {
                showLoading(false);
            });
    }

    // تابع ویرایش محصول
    window.editProduct = function (productId, name, description, instagramLink) {
        const newName = prompt('نام جدید محصول:', name);
        const newDescription = prompt('توضیحات جدید:', description);
        const newInstagramLink = prompt('لینک اینستاگرام جدید:', instagramLink || '');
        if (newName && newDescription) {
            const formData = new FormData();
            formData.append('product-name', newName);
            formData.append('product-description', newDescription);
            formData.append('product-instagram-link', newInstagramLink);
            formData.append('userId', localStorage.getItem('userId'));
            formData.append('productId', productId);
            fetch(`${baseUrl}/api/edit-product`, {
                method: 'PUT',
                body: formData
            })
                .then(response => {
                    console.log('پاسخ /api/edit-product:', response.status, response.statusText);
                    if (!response.ok) {
                        return response.json().then(err => { throw new Error(err.message || 'خطا در ویرایش محصول'); });
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('محصول ویرایش شد:', data);
                    alert(data.message);
                    loadProducts();
                })
                .catch(error => {
                    console.error('خطا در ویرایش محصول:', error);
                    alert('خطا در ویرایش محصول: ' + error.message);
                });
        }
    };

    // تابع حذف محصول
    window.deleteProduct = function (productId) {
        if (confirm('آیا مطمئن هستید که می‌خواهید این محصول را حذف کنید؟')) {
            showLoading(true);
            fetch(`${baseUrl}/api/delete-product`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId, userId: localStorage.getItem('userId') })
            })
                .then(response => {
                    console.log('پاسخ /api/delete-product:', response.status, response.statusText);
                    if (!response.ok) {
                        return response.json().then(err => { throw new Error(err.message || 'خطا در حذف محصول'); });
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('محصول حذف شد:', data);
                    alert(data.message);
                    loadProducts();
                })
                .catch(error => {
                    console.error('خطا در حذف محصول:', error);
                    alert('خطا در حذف محصول: ' + error.message);
                })
                .finally(() => {
                    showLoading(false);
                });
        }
    };

    // لیست نمونه استان‌ها و شهرها
    const provincesAndCities = {
        "تهران": ["تهران", "اسلامشهر", "پاکدشت", "پردیس", "دماوند", "ری", "شمیرانات", "فیروزکوه", "ورامین"],
        "اصفهان": ["اصفهان", "کاشان", "نجف‌آباد", "خمینی‌شهر", "شاهین‌شهر"],
        "فارس": ["شیراز", "مرودشت", "کازرون", "جهرم", "لارستان"],
    };

    // لیست مناطق تهران
    const tehranRegions = [
        "منطقه 1", "منطقه 2", "منطقه 3", "منطقه 4", "منطقه 5", "منطقه 6", "منطقه 7", "منطقه 8",
        "منطقه 9", "منطقه 10", "منطقه 11", "منطقه 12", "منطقه 13", "منطقه 14", "منطقه 15",
        "منطقه 16", "منطقه 17", "منطقه 18", "منطقه 19", "منطقه 20", "منطقه 21", "منطقه 22"
    ];

    // پر کردن دراپ‌دان استان، شهر و منطقه فقط در صفحات ثبت‌نام
    const isRegistrationPage = window.location.pathname.includes('customer-register.html') || window.location.pathname.includes('register.html');

    if (isRegistrationPage) {
        const provinceInputs = document.querySelectorAll('input[name="province"]');
        provinceInputs.forEach(input => {
            const provinceDatalistId = 'province-list';
            const provinceDatalist = document.getElementById(provinceDatalistId);
            if (input && provinceDatalist) {
                input.setAttribute('list', provinceDatalistId);
                // پر کردن گزینه‌های استان اگر خالی باشه
                if (provinceDatalist.children.length === 0) {
                    Object.keys(provincesAndCities).forEach(province => {
                        const option = document.createElement('option');
                        option.value = province;
                        provinceDatalist.appendChild(option);
                    });
                    console.log('گزینه‌های استان پر شد');
                }

                const cityInput = input.parentNode.querySelector('input[name="city"]');
                const cityDatalistId = 'city-list';
                const cityDatalist = document.getElementById(cityDatalistId);
                if (cityInput && cityDatalist) {
                    cityInput.setAttribute('list', cityDatalistId);
                    input.addEventListener('input', function () {
                        cityDatalist.innerHTML = ''; // پاک کردن شهرهای قبلی
                        const selectedProvince = this.value.trim();
                        console.log('استان انتخاب‌شده:', selectedProvince);
                        if (provincesAndCities[selectedProvince]) {
                            provincesAndCities[selectedProvince].forEach(city => {
                                const option = document.createElement('option');
                                option.value = city;
                                cityDatalist.appendChild(option);
                            });
                            console.log('گزینه‌های شهر پر شد برای:', selectedProvince);
                        }
                        updateRegionField(selectedProvince, cityInput.value);
                    });

                    cityInput.addEventListener('input', function () {
                        updateRegionField(input.value, this.value);
                    });
                }
            }
        });
    }

    // تابع برای مدیریت فیلد منطقه (فقط اگر تهران باشه)
    function updateRegionField(province, city) {
        const regionFields = document.getElementById('region-fields');
        const regionInput = document.getElementById('region');
        const regionDatalist = document.getElementById('region-list');
        if (regionFields && regionInput && regionDatalist) {
            const isTehran = province.toLowerCase() === 'تهران' && city.toLowerCase() === 'تهران';
            regionFields.style.display = isTehran ? 'block' : 'none';
            regionInput.required = isTehran;
            if (isTehran) {
                regionDatalist.innerHTML = '';
                tehranRegions.forEach(region => {
                    const option = document.createElement('option');
                    option.value = region;
                    regionDatalist.appendChild(option);
                });
                console.log('گزینه‌های منطقه تهران پر شد');
            } else {
                regionInput.value = '';
            }
        } else {
            console.error('فیلد منطقه یافت نشد');
        }
    }
};