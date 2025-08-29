const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

/**
 * فایلی را در فضای ذخیره‌سازی S3 لیارا آپلود می‌کند.
 * @param {object} file - آبجکت فایل که از multer دریافت می‌شود (شامل buffer, originalname, mimetype).
 * @param {string} folderPath - مسیر فولدری که فایل باید در آن آپلود شود (مثال: '1234567890/87654321/products').
 * @param {string|null} customFileName - (اختیاری) یک نام ثابت برای فایل (مثال: 'banner'). اگر ارسال نشود، یک نام یکتا بر اساس زمان ساخته می‌شود.
 * @returns {Promise<string>} آدرس URL کامل فایل آپلود شده را برمی‌گرداند.
 */

const app = express();
const port = process.env.PORT || 3000;

// ✅ تنظیمات S3 با سینتکس v3
const s3Client = new S3Client({
    credentials: {
        accessKeyId: process.env.LIARA_ACCESS_KEY || 'nq9ubchnlgscvmld',
        secretAccessKey: process.env.LIARA_SECRET_KEY || '7637d8be-6c99-4ae0-99f7-e4a0492195df',
    },
    endpoint: process.env.LIARA_ENDPOINT || 'https://storage.c2.liara.space',
    region: 'us-east-1', // این مقدار برای لیارا معمولاً مهم نیست اما بهتر است وجود داشته باشد
    forcePathStyle: true
});

const bucketName = process.env.LIARA_BUCKET_NAME || 'vitrad';

// تنظیمات Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'vitrad.rentonline@gmail.com',
        pass: process.env.EMAIL_PASS || 'icfa yyaz iyss dbmp'
    }
});

// فانکشن برای تولید شناسه یکتای کاربری
async function generateUniqueUserId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    let isUnique = false;
    const usersCollection = db.collection('users');

    while (!isUnique) {
        result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        // چک می‌کنیم که این شناسه قبلا استفاده نشده باشد
        const existingUser = await usersCollection.findOne({ user_identifier: result });
        if (!existingUser) {
            isUnique = true;
        }
    }
    console.log(`شناسه کاربری یکتا تولید شد: ${result}`);
    return result;
}

// MongoDB connection
const mongoUri = 'mongodb://root:1gJu5w36FQqkhKXORWKyZ0l0@chogolisa.liara.cloud:33240/my-app?authSource=admin&replicaSet=rs0&directConnection=true';
let db;
let mongoClient;

// اتصال به MongoDB با retry
async function connectMongoDB() {
    if (db) return db;
    const maxRetries = 5;
    let retries = 0;
    while (retries < maxRetries) {
        try {
            mongoClient = await MongoClient.connect(mongoUri, {
                serverSelectionTimeoutMS: 15000,
                connectTimeoutMS: 20000
            });
            console.log('Connected to MongoDB');
            db = mongoClient.db();

            // ایجاد indexهای unique برای Users
            await db.collection('users').createIndex({ email: 1 }, { unique: true });
            await db.collection('users').createIndex({ mobile: 1 }, { unique: true });
            await db.collection('users').createIndex({ national_id: 1 }, { unique: true });

            // ایجاد index unique برای Shops
            //await db.collection('shops').createIndex({ business_license: 1 }, { unique: true });

            return db;
        } catch (error) {
            retries++;
            console.error(`MongoDB connection attempt ${retries}/${maxRetries} failed:`, error.message);
            if (retries === maxRetries) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

// Middleware برای CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(200).json({});
    }
    console.log(`Request received: ${req.method} ${req.path}`);
    next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'frontend'))); // سرو فایل‌های frontend اگر در فولدر frontend باشن

// Multer برای آپلود با محدودیت‌ها
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 4 * 1024 * 1024 } }); // 4MB max

// فانکشن generateOTP (با ذخیره موقت در DB برای امنیت بیشتر)
async function generateOTP(email, type = 'register') {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiration = new Date(Date.now() + 5 * 60 * 1000); // 5 دقیقه
    await db.collection('otps').updateOne(
        { email, type },
        { $set: { otp, expiration } },
        { upsert: true }
    );
    console.log(`OTP generated for ${email}, type: ${type}`);
    return otp;
}

// ✅ در ابتدای فایل، این تابع جدید را برای تولید کد مغازه اضافه کنید
function generateShopCode(length = 8) {
    const chars = '0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ✅ تابع آپلود فایل با سینتکس v3
async function uploadToS3(file, folderPath, customFileName = null) {
    let fileName;
    if (customFileName) {
        fileName = `${folderPath}/${customFileName}${path.extname(file.originalname)}`;
    } else {
        fileName = `${folderPath}/${Date.now()}_${path.basename(file.originalname)}`;
    }

    try {
        const parallelUploads3 = new Upload({
            client: s3Client,
            params: {
                Bucket: bucketName,
                Key: fileName,
                Body: file.buffer,
                ContentType: file.mimetype
            },
        });

        parallelUploads3.on("httpUploadProgress", (progress) => {
            console.log(progress);
        });

        const data = await parallelUploads3.done();
        console.log(`✅ فایل با موفقیت در آدرس ${data.Location} آپلود شد.`);
        return data.Location;

    } catch (error) {
        console.error('❌ خطا در آپلود فایل در S3 (v3):', error);
        throw error;
    }
}

// ✅ تابع حذف فایل با سینتکس v3 (نسخه اصلاح شده)
async function deleteFromS3(fileUrl) {
    try {
        // استخراج کلید فایل از URL کامل (مانند 'folder/file.jpg')
        const key = new URL(fileUrl).pathname.substring(1).replace(`${bucketName}/`, '');
        
        const deleteParams = {
            Bucket: bucketName,
            Key: key
        };

        // ارسال دستور حذف به S3
        await s3Client.send(new DeleteObjectCommand(deleteParams));
        console.log(`✅ فایل ${key} با موفقیت از S3 حذف شد.`);

    } catch (error) { // ✅ آکولادها در اینجا اضافه شدند
        console.error(`❌ خطا در حذف فایل ${fileUrl} از S3 (v3):`, error);
    }
}

// ✅ این تابع جدید را به server.js اضافه کنید

/**
 * امتیاز یک مغازه را بر اساس معیارهای مختلف محاسبه می‌کند.
 * @param {object} shop - آبجکت کامل یک مغازه از دیتابیس.
 * @param {Db} db - نمونه دیتابیس برای کوئری‌های احتمالی.
 * @returns {Promise<number>} امتیاز نهایی محاسبه‌شده.
 */
async function calculateShopScore(shop, db) {
    let score = 0;

    // ۱. امتیاز تکمیل پروفایل
    if (shop.banner && shop.banner.length > 5) score += 20;
    if (shop.shop_description && shop.shop_description.length > 50) score += 15;
    
    let socialLinksCount = 0;
    if (shop.whatsapp) socialLinksCount++;
    if (shop.instagram) socialLinksCount++;
    if (shop.telegram) socialLinksCount++;
    if (shop.eitaa) socialLinksCount++;
    if (shop.bale) socialLinksCount++;
    if (shop.rubika) socialLinksCount++;
    if (socialLinksCount >= 2) score += 15; // حداقل ۲ راه ارتباطی

    // ۲. امتیاز تازگی و بروزبودن
    if (shop.updated_at) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (new Date(shop.updated_at) > thirtyDaysAgo) {
            score += 20;
        }
    }

    // ۳. امتیاز تعداد محصولات
    try {
        const productCount = await db.collection('products').countDocuments({ shop_id: shop._id });
        score += productCount * 2; // هر محصول ۲ امتیاز
    } catch (error) {
        console.error(`خطا در شمارش محصولات برای مغازه ${shop._id}:`, error);
    }
    
    // در آینده می‌توانید امتیاز مشتریان و معرف را هم به اینجا اضافه کنید

    try {
    const owner = await db.collection('users').findOne({ _id: shop.user_id });
    if (owner && owner.referral_count) {
        score += owner.referral_count * 50; // هر معرفی موفق ۵۰ امتیاز
    }
    } catch (error) {
        console.error(`خطا در خواندن اطلاعات معرف برای مغازه ${shop._id}:`, error);
    }

    if (shop.rating_average && shop.rating_count) {
        // فرمول برای ارزش دادن به تعداد رای‌ها
        // (میانگین امتیاز - ۳) * تعداد رای‌ها. امتیاز پایه ۳ است.
        score += (shop.rating_average - 3) * shop.rating_count;
    }
    
    return score;
}

// ✅ API جدید برای نمایش عمومی مغازه‌ها به کاربران مهمان
app.get('/api/public-shops', async (req, res) => {
    try {
        await connectMongoDB();
        const shopsCollection = db.collection('shops');
        let allShops = await shopsCollection.find({ status: 'active' }).toArray();

        // محاسبه امتیاز برای هر مغازه
        for (const shop of allShops) {
            shop.score = await calculateShopScore(shop, db);
        }

        // مرتب‌سازی فقط بر اساس امتیاز (نزولی)
        allShops.sort((a, b) => b.score - a.score);

        res.json(allShops);
    } catch (error) {
        console.error('خطا در دریافت مغازه‌های عمومی:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
});

// ✅ این API جدید را به server.js اضافه کنید
app.post('/api/rate-shop', async (req, res) => {
    try {
        await connectMongoDB();
        const { shop_id, user_id, rating } = req.body;

        if (!shop_id || !user_id || !rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'اطلاعات ارسالی ناقص یا نامعتبر است.' });
        }

        const ratingsCollection = db.collection('ratings');
        const shopsCollection = db.collection('shops');

        // ثبت یا بروزرسانی امتیاز کاربر برای این مغازه
        // با upsert: true، اگر کاربر قبلا رای داده باشد، رایش آپدیت می‌شود وگرنه رای جدید ثبت می‌شود.
        await ratingsCollection.updateOne(
            { shop_id: new ObjectId(shop_id), user_id: new ObjectId(user_id) },
            { $set: { rating: parseInt(rating), created_at: new Date() } },
            { upsert: true }
        );

        // محاسبه مجدد میانگین امتیاز و تعداد رای‌ها برای آن مغازه
        const stats = await ratingsCollection.aggregate([
            { $match: { shop_id: new ObjectId(shop_id) } },
            { $group: {
                _id: '$shop_id',
                average: { $avg: '$rating' },
                count: { $sum: 1 }
            }}
        ]).toArray();

        if (stats.length > 0) {
            const { average, count } = stats[0];
            await shopsCollection.updateOne(
                { _id: new ObjectId(shop_id) },
                { $set: { rating_average: parseFloat(average.toFixed(2)), rating_count: count } }
            );
        }

        res.json({ success: true, message: 'امتیاز شما با موفقیت ثبت شد.' });

    } catch (error) {
        console.error('خطا در ثبت امتیاز:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
});

// API جدید برای چک کردن مقادیر تکراری
app.post('/api/check-duplicates', async (req, res) => {
    console.log('درخواست بررسی مقادیر تکراری دریافت شد:', req.body);
    try {
        await connectMongoDB();
        const usersCollection = db.collection('users');
        const { email, mobile, national_id } = req.body;

        const duplicates = {
            email: false,
            mobile: false,
            national_id: false
        };

        if (email) {
            const userByEmail = await usersCollection.findOne({ email });
            if (userByEmail) duplicates.email = true;
        }
        if (mobile) {
            const userByMobile = await usersCollection.findOne({ mobile });
            if (userByMobile) duplicates.mobile = true;
        }
        if (national_id) {
            const userByNationalId = await usersCollection.findOne({ national_id });
            if (userByNationalId) duplicates.national_id = true;
        }

        res.json({ duplicates });

    } catch (error) {
        console.error('خطا در بررسی مقادیر تکراری:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
});

// ✅ نسخه نهایی و یکپارچه API ثبت‌نام کاربر
app.post('/api/register-user', upload.none(), async (req, res) => {
    try {
        await connectMongoDB();
        const usersCollection = db.collection('users');
        const { full_name, email, mobile, national_id, password, province, city, tehran_area, referral_code } = req.body;
        

        // اعتبارسنجی‌های ضروری
        if (!full_name || !email || !mobile || !national_id || !password) {
            return res.status(400).json({ message: 'تمام فیلدهای الزامی باید پر شوند.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: 'رمز عبور باید حداقل ۸ کاراکتر باشد.' });
        }
        
        // بررسی تکراری بودن (این بخش اختیاری است چون در فرانت‌اند هم چک می‌شود، اما برای امنیت بیشتر خوب است)
        const existingUser = await usersCollection.findOne({ $or: [{ email }, { mobile }, { national_id }] });
        if (existingUser) {
            return res.status(400).json({ message: 'ایمیل، شماره موبایل یا کد ملی قبلاً ثبت شده است.' });
        }

        // ساخت اطلاعات کاربر جدید
        const hashedPassword = await bcrypt.hash(password, 10);
        const userIdentifier = await generateUniqueUserId(8);
        const referralCodeForNewUser = await generateUniqueUserId(6);
        const newUser = {
            full_name, email, mobile, national_id, password_hash: hashedPassword,
            province, city, tehran_area, user_identifier: userIdentifier,
            role: 'customer', status: 0, // 0 = pending
            referral_code: referralCodeForNewUser, referred_by: referral_code || null,
            referral_count: 0, created_at: new Date(), updated_at: new Date()
        };
        const result = await usersCollection.insertOne(newUser);
        const otp = await generateOTP(email, 'register');
        console.log(`[DEBUG-EMAIL] کد تایید ثبت‌نام برای ${email}: ${otp}`);

        // ✅ ارسال ایمیل صحیح حاوی کد تایید (OTP)
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'کد تایید ثبت‌نام - ویتراد',
            html: `
                <h2>سلام ${full_name}،</h2>
                <p>برای فعال‌سازی حساب کاربری خود در ویتراد، لطفاً از کد تایید زیر استفاده کنید:</p>
                <h3 style="text-align: center; background-color: #f0f0f0; padding: 10px; border-radius: 5px; letter-spacing: 2px;">${otp}</h3>
                <p>این کد به مدت ۵ دقیقه معتبر است.</p>
            `
        });
        console.log(`ایمیل حاوی OTP به ${email} ارسال شد.`);
        res.json({ success: true, user_id: result.insertedId.toString() });
    } catch (error) {
        console.error('خطا در ثبت کاربر:', error);
        res.status(500).json({ message: 'خطای سرور در هنگام ثبت‌نام.' });
    }
});

// ✅ API تایید OTP (نسخه نهایی با ارسال ایمیل خوش‌آمدگویی)
app.post('/api/verify-otp', async (req, res) => {
    try {
        await connectMongoDB();
        const otpsCollection = db.collection('otps');
        const usersCollection = db.collection('users');
        const { email, otp, type = 'register' } = req.body;
        const otpRecord = await otpsCollection.findOne({ email, type, otp });
        if (!otpRecord || new Date() > otpRecord.expiration) {
            return res.status(400).json({ message: 'کد نامعتبر یا منقضی' });
        }
        if (type === 'register') {
            await usersCollection.updateOne({ email }, { $set: { status: 1 } });
            console.log('کاربر فعال شد');
            const user = await usersCollection.findOne({ email });
            if (user) {
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: email,
                    subject: 'ثبت‌نام شما در ویتراد با موفقیت تکمیل شد!',
                    html: `
                        <h2>سلام ${user.full_name}، به ویتراد خوش آمدید!</h2>
                        <p>حساب کاربری شما با موفقیت فعال شد.</p>
                        <p>از این پس می‌توانید با استفاده از <strong>شناسه کاربری</strong> زیر وارد حساب خود شوید:</p>
                        <h3 style="text-align: center; background-color: #f0f0f0; padding: 10px; border-radius: 5px;">${user.user_identifier}</h3>
                        <p>لطفاً این شناسه را در جایی امن نگهداری کنید.</p>
                    `
                });
                console.log(`ایمیل خوش‌آمدگویی و شناسه کاربری به ${email} ارسال شد.`);
            }
        } else if (type === 'reset') {
            const resetToken = Math.random().toString(36).substring(2);
            await usersCollection.updateOne({ email }, { $set: { resetToken } });
            return res.json({ success: true, resetToken });
        }
        await otpsCollection.deleteOne({ email, type });
        res.json({ success: true });
    } catch (error) {
        console.error('خطا در تایید OTP:', error);
        res.status(500).json({ message: 'خطا در تایید' });
    }
});

// ✅ کد کاملاً بازنویسی شده برای API شروع ثبت مغازه (با ساختار فولدر دینامیک)

app.post('/api/initiate-shop-creation', upload.fields([
    { name: 'nationalCardImage', maxCount: 1 },
    { name: 'selfieImage', maxCount: 1 },
    { name: 'businessLicenseImage', maxCount: 1 },
    { name: 'healthLicenseImage', maxCount: 1 }
]), async (req, res) => {
    console.log('درخواست اولیه ایجاد مغازه دریافت شد:', req.body);
    let tempShopId = null; // برای نگهداری آیدی موقت مغازه

    try {
        await connectMongoDB();
        const shopsCollection = db.collection('shops');
        const usersCollection = db.collection('users');

        const { user_id, shop_name /*... سایر فیلدها ...*/ } = req.body;
        
        // ۱. اعتبارسنجی و یافتن کاربر
        if (!user_id || !shop_name) return res.status(400).json({ message: 'فیلدهای اصلی کسب‌وکار الزامی است.' });
        if (!req.files.nationalCardImage || !req.files.selfieImage || !req.files.businessLicenseImage) {
            return res.status(400).json({ message: 'ارسال مدارک هویتی و جواز کسب الزامی است.' });
        }
        const user = await usersCollection.findOne({ _id: new ObjectId(user_id) });
        if (!user) return res.status(404).json({ message: 'کاربر یافت نشد' });
        console.log(`- کاربر "${user.full_name}" با کد ملی "${user.national_id}" پیدا شد.`);

        // ۲. ساخت اولیه سند مغازه برای گرفتن ID
        const shopCode = generateShopCode();
        const otp = await generateOTP(user.email, 'shop_verification');
        console.log(`[DEBUG-EMAIL] کد تایید مغازه برای ${user.email}: ${otp}`);
        console.log(`🆔 کد کسب‌وکار تولید شد: ${shopCode}`);
        console.log(`🔒 کد OTP برای تایید تولید شد: ${otp}`);
        
        // ✅ مطمئن شوید کد شما دقیقاً به این شکل است

        // ...
        const initialShopData = {
            ...req.body, // اول تمام اطلاعات فرم
            user_id: new ObjectId(user_id), // سپس user_id با فرمت صحیح بازنویسی می‌شود
            shop_code: shopCode,
            status: 'pending_upload',
            otp_info: { otp, expiration: new Date(Date.now() + 10 * 60 * 1000) },
            created_at: new Date()
        };
        // ...
        const shopInsertResult = await shopsCollection.insertOne(initialShopData);
        tempShopId = shopInsertResult.insertedId; // آیدی مغازه را گرفتیم!
        console.log(`- پیش‌ثبت مغازه در دیتابیس با آیدی موقت: ${tempShopId}`);

        console.log("📤 شروع فرآیند آپلود فایل‌ها در لیارا...");
        // ۳. ساخت مسیر دینامیک و آپلود فایل‌ها
        const fileUrls = {};
        // کد صحیح و اصلاح شده
        for (const key in req.files) {
            const file = req.files[key][0];
            let fileName = key.replace('Image', ''); // نام فایل را ثابت نگه می‌داریم (مثلا: nationalCard, selfie)
            
            // ✅ از تابع کمکی uploadToS3 که سینتکس v3 دارد استفاده می‌کنیم
            const folderPath = `${user.national_id}/${shopCode}`;
            const fileUrl = await uploadToS3(file, folderPath, fileName); // ارسال نام فایل ثابت
            
            fileUrls[key] = fileUrl;
            console.log(`فایل ${key} با موفقیت آپلود شد.`);
        }
        console.log("🔄 آپدیت نهایی سند مغازه با لینک فایل‌ها...");

        // ۴. آپدیت نهایی سند مغازه با لینک عکس‌ها و تغییر وضعیت
        await shopsCollection.updateOne(
            { _id: tempShopId },
            {
                $set: {
                    status: 'pending_verification', // تغییر وضعیت برای مرحله تایید OTP
                    national_card_image: fileUrls.nationalCardImage,
                    selfie_image: fileUrls.selfieImage,
                    business_license_image: fileUrls.businessLicenseImage,
                    health_license_image: fileUrls.healthLicenseImage || '',
                }
            }
        );
        console.log("- وضعیت مغازه به 'pending_verification' تغییر یافت.");

        console.log(`📧 ارسال ایمیل OTP به ${user.email}...`);
        
        // ارسال ایمیل تایید به کاربر
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'کد تایید نهایی برای ثبت کسب‌وکار شما',
            text: `سلام، برای نهایی کردن ثبت کسب‌وکار "${shop_name}"، از کد زیر استفاده کنید:\n\n${otp}\n\nاین کد به مدت ۱۰ دقیقه معتبر است.`
        });
        console.log("✅ ایمیل با موفقیت ارسال شد.");

        res.json({ success: true, shop_id: tempShopId.toString() });

    } catch (error) {
        console.error('خطا در شروع ثبت مغازه:', error);
        // اگر در حین آپلود خطا رخ داد، سند موقت مغازه را پاک کن
        if (tempShopId) {
            await db.collection('shops').deleteOne({ _id: tempShopId });
        }
        res.status(500).json({ message: 'خطای سرور' });
    }
});


// ✅ کد اصلاح‌شده برای API تایید نهایی مغازه (با بررسی null)
app.post('/api/verify-shop-otp', async (req, res) => {
    console.log('درخواست تایید OTP مغازه دریافت شد:', req.body);
    try {
        await connectMongoDB();
        const shopsCollection = db.collection('shops');
        const usersCollection = db.collection('users');

        const { shop_id, otp } = req.body;
        if (!shop_id || !otp) return res.status(400).json({ message: 'داده‌های ارسالی ناقص است.' });
        console.log(`- جستجو برای مغازه با آیدی: ${shop_id}`);

        const shop = await shopsCollection.findOne({ _id: new ObjectId(shop_id) });

        if (!shop) return res.status(404).json({ message: 'کسب‌وکار یافت نشد.' });
        if (shop.status !== 'pending_verification') return res.status(400).json({ message: 'این کسب‌وکار قبلاً تایید شده است.' });

        if (shop.otp_info.otp !== otp || new Date() > new Date(shop.otp_info.expiration)) {
            return res.status(400).json({ message: 'کد تایید نامعتبر است یا منقضی شده.' });
        }
        console.log("  ✅ کد OTP صحیح است.");

        // ✅ تغییر جدید: ابتدا کاربر را پیدا کن و بررسی کن که وجود دارد
        const user = await usersCollection.findOne({_id: shop.user_id});
        if (!user) {
            console.error(`خطای بحرانی: کاربر با آیدی ${shop.user_id} برای مغازه ${shop_id} یافت نشد.`);
            return res.status(404).json({ message: 'خطا در یافتن اطلاعات مالک کسب‌وکار.' });
        }
        console.log("🔄 در حال فعال‌سازی نهایی کسب‌وکار...");
        
        // اگر کد صحیح بود، مغازه را فعال کن
        await shopsCollection.updateOne(
            { _id: new ObjectId(shop_id) },
            { $set: { status: 'active' }, $unset: { otp_info: "" } }
        );
        console.log("- وضعیت مغازه به 'active' تغییر یافت.");

        const owner = await usersCollection.findOne({ _id: shop.user_id });
        if (owner && owner.referred_by) {
            console.log(`- این کاربر توسط "${owner.referred_by}" معرفی شده. در حال اعمال امتیاز...`);
            // کاربر معرف را با کد او پیدا می‌کنیم
            const referrer = await usersCollection.findOne({ referral_code: owner.referred_by });
            if (referrer) {
                // شمارنده معرف را یکی اضافه می‌کنیم
                await usersCollection.updateOne(
                    { _id: referrer._id },
                    { $inc: { referral_count: 1 } }
                );
                console.log(`✅ امتیاز با موفقیت به کاربر "${referrer.full_name}" اضافه شد.`);
            } else {
                console.warn(`- کد معرف "${owner.referred_by}" یافت نشد.`);
            }
        }
        
        // نقش کاربر را بروز کن
        let newRole = user.role === 'customer' ? 'seller' : 'both';
        if (user.role !== 'seller' && user.role !== 'both') {
            await usersCollection.updateOne({ _id: user._id }, { $set: { role: newRole } });
            console.log(`- نقش کاربر "${user.full_name}" به "${newRole}" بروزرسانی شد.`);
        }
        
        console.log(`📧 ارسال ایمیل خوش‌آمدگویی نهایی به ${user.email}...`);
        // ارسال ایمیل موفقیت‌آمیز
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: `کسب‌وکار شما با موفقیت ثبت شد!`,
            html: `<h2>تبریک! کسب‌وکار "${shop.shop_name}" با موفقیت ثبت و فعال شد.</h2>
                   <p>از این پس می‌توانید از خدمات پنل خود استفاده کنید.</p>
                   <p>کد کسب‌وکار شما:</p>
                   <h3 style="text-align: center; background-color: #f0f0f0; padding: 10px;">${shop.shop_code}</h3>`
        });
        console.log("✅ ایمیل خوش‌آمدگویی با موفقیت ارسال شد.");

        res.json({ success: true, shop_code: shop.shop_code });

    } catch (error) {
        console.error('خطا در تایید OTP مغازه:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
});

// ✅ API لاگین (نسخه نهایی و امن)
app.post('/api/login', async (req, res) => {
    try {
        await connectMongoDB();
        const usersCollection = db.collection('users');
        const shopsCollection = db.collection('shops');
        const { identifier, password } = req.body;
        const user = await usersCollection.findOne({ user_identifier: identifier });
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(400).json({ message: 'شناسه کاربری یا رمز عبور اشتباه است' });
        }
        if (user.status !== 1) {
            return res.status(400).json({ message: 'حساب شما فعال نیست. لطفاً ایمیل خود را تایید کنید.' });
        }
        let shops = [];
        if (user.role !== 'customer') {
            shops = await shopsCollection.find({ user_id: user._id }).toArray();
        }

        // از آبجکت user، فیلد پسورد را جدا می‌کنیم و بقیه را ارسال می‌کنیم
        const { password_hash, ...safeUserData } = user;
        res.json({ success: true, user: { ...safeUserData, _id: safeUserData._id.toString() }, shops: shops.map(s => ({ ...s, _id: s._id.toString() })) });

    } catch (error) {
        console.error('خطا در لاگین:', error);
        res.status(500).json({ message: 'خطا در لاگین' });
    }
});

// API موجود get-shops (برای چک، بدون تغییر زیاد)
app.get('/api/get-shops', async (req, res) => {
    const { user_id } = req.query;
    try {
        await connectMongoDB();
        const shopsCollection = db.collection('shops');
        const filter = user_id ? { user_id: new ObjectId(user_id) } : {};
        const shops = await shopsCollection.find(filter).toArray();
        res.json(shops);
    } catch (error) {
        console.error('خطا:', error);
        res.status(500).json({ message: 'خطا' });
    }
});

// API فراموشی رمز عبور
// server.js

// API فراموشی رمز عبور (اصلاح شده)
app.post('/api/forgot-password', async (req, res) => {
    console.log('درخواست فراموشی رمز دریافت شد:', req.body);
    try {
        await connectMongoDB();
        const usersCollection = db.collection('users');

        // ✅ حالا identifier همان شناسه کاربری است
        const { identifier, email } = req.body;

        // ✅ جستجو بر اساس شناسه کاربری و ایمیل
        const user = await usersCollection.findOne({
            user_identifier: identifier,
            email
        });

        if (!user) {
            console.log('کاربر یافت نشد');
            // برای امنیت، پیام عمومی‌تری به کاربر نمایش می‌دهیم
            return res.status(400).json({ message: 'اطلاعات وارد شده صحیح نیست.' });
        }

        const otp = await generateOTP(email, 'reset');
        console.log(`[DEBUG-EMAIL] کد بازنشانی رمز برای ${email}: ${otp}`);
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'کد بازنشانی رمز عبور',
            text: `کد بازنشانی شما: ${otp}. این کد 5 دقیقه معتبر است.`
        });
        console.log('OTP بازنشانی ارسال شد به:', email);

        res.json({ success: true });
    } catch (error) {
        console.error('خطا در فراموشی رمز:', error);
        res.status(500).json({ message: 'خطا در ارسال کد' });
    }
});

// API ارسال دوباره OTP بازنشانی
app.post('/api/resend-reset-otp', async (req, res) => {
    console.log('درخواست ارسال دوباره OTP بازنشانی دریافت شد:', req.body);
    try {
        const { email } = req.body;

        if (!email) {
            console.log('ایمیل پر نشده');
            return res.status(400).json({ message: 'ایمیل پر نشده' });
        }

        await connectMongoDB();
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ email });
        if (!user) {
            console.log('کاربر یافت نشد');
            return res.status(400).json({ message: 'کاربر یافت نشد' });
        }

        const otp = await generateOTP(email, 'reset');
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'کد بازنشانی رمز عبور (ارسال دوباره)',
            text: `کد جدید: ${otp}. این کد 5 دقیقه معتبر است.`
        });
        console.log('OTP جدید ارسال شد به:', email);

        res.json({ success: true });
    } catch (error) {
        console.error('خطا در ارسال دوباره OTP:', error);
        res.status(500).json({ message: 'خطا در ارسال دوباره' });
    }
});

// API بازنشانی رمز عبور
app.post('/api/reset-password', async (req, res) => {
    console.log('درخواست بازنشانی رمز دریافت شد:', req.body);
    try {
        await connectMongoDB();
        const usersCollection = db.collection('users');

        const { resetToken, newPassword } = req.body;

        if (!resetToken || !newPassword || newPassword.length < 8) {
            console.log('داده‌ها نامعتبر');
            return res.status(400).json({ message: 'داده‌ها نامعتبر' });
        }

        const user = await usersCollection.findOne({ resetToken });
        if (!user) {
            console.log('توکن نامعتبر');
            return res.status(400).json({ message: 'توکن نامعتبر' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await usersCollection.updateOne({ resetToken }, { $set: { password_hash: hashedPassword, resetToken: null } });
        console.log('رمز عبور بروز شد');

        res.json({ success: true });
    } catch (error) {
        console.error('خطا در بازنشانی رمز:', error);
        res.status(500).json({ message: 'خطا در تغییر رمز' });
    }
});

// API اضافه محصول (نسخه نهایی با مسیردهی هوشمند)
app.post('/api/add-product/:shop_id', upload.single('image'), async (req, res) => {
    const { shop_id } = req.params;
    const { name, description, instagram_link } = req.body; 

    try {
        if (!req.file) {
            return res.status(400).json({ message: 'تصویر محصول الزامی است.' });
        }
        await connectMongoDB();

        // ۱. پیدا کردن اطلاعات مغازه از دیتابیس
        const shopsCollection = db.collection('shops');
        const shop = await shopsCollection.findOne({ _id: new ObjectId(shop_id) });
        if (!shop) {
            return res.status(404).json({ message: 'مغازه یافت نشد.' });
        }

        // ۲. پیدا کردن اطلاعات کاربر (مالک مغازه) برای گرفتن کد ملی
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ _id: shop.user_id });
        if (!user) {
            return res.status(404).json({ message: 'مالک مغازه یافت نشد.' });
        }

        // ۳. ساخت مسیر داینامیک برای آپلود عکس محصول
        const folderPath = `${user.national_id}/${shop.shop_code}/products`;
        
        const imageUrl = await uploadToS3(req.file, folderPath);

        // ۴. ذخیره محصول در دیتابیس
        const productsCollection = db.collection('products');
        const productsCount = await productsCollection.countDocuments({ shop_id: new ObjectId(shop_id) });

        await productsCollection.insertOne({ 
            shop_id: new ObjectId(shop_id), 
            name, 
            description, 
            instagram_link, // فیلد جدید اینجا ذخیره می‌شود
            image: imageUrl,
            priority: productsCount + 1
        });

        res.json({ message: 'محصول با موفقیت اضافه شد' });
    } catch (error) {
        console.error('خطا در افزودن محصول:', error);
        res.status(500).json({ message: 'خطای سرور در افزودن محصول' });
    }
});

// ✅ API بروزرسانی اطلاعات مغازه (نسخه نهایی)
// متد را از POST به PUT تغییر می‌دهیم
app.put('/api/update-shop/:shop_id', async (req, res) => {
    const { shop_id } = req.params;
    // دریافت فیلدهای جدید از body درخواست
    const { description, phone, whatsapp, telegram, instagram, eitaa, rubika, bale } = req.body;
    try {
        await connectMongoDB();
        const shopsCollection = db.collection('shops');
        
        // فقط فیلدهایی که مقدار دارند را برای آپدیت آماده می‌کنیم
        const updateData = {};
        if (description) updateData.shop_description = description; // نام فیلد در دیتابیس
        if (phone) updateData.shop_phone = phone; // نام فیلد در دیتابیس
        
        // ======== بخش جدید ========
        // فیلدهای جدید را به آبجکت آپدیت اضافه می‌کنیم
        // اگر کاربر فیلدی را خالی بفرستد، در دیتابیس هم خالی ذخیره می‌شود تا بعدا نمایش داده نشود
        if (whatsapp !== undefined) updateData.whatsapp = whatsapp;
        if (telegram !== undefined) updateData.telegram = telegram;
        if (instagram !== undefined) updateData.instagram = instagram;
        if (eitaa !== undefined) updateData.eitaa = eitaa;
        if (rubika !== undefined) updateData.rubika = rubika;
        if (bale !== undefined) updateData.bale = bale;
        // ========================

        updateData.updated_at = new Date();

        await shopsCollection.updateOne({ _id: new ObjectId(shop_id) }, { $set: updateData });
        
        res.json({ success: true, message: 'اطلاعات با موفقیت بروزرسانی شد' });
    } catch (error) {
        console.error('خطا در بروزرسانی اطلاعات مغازه:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
});

// API جدید برای گرفتن پروفایل کاربر
app.get('/api/get-user-profile/:user_id', async (req, res) => {
    console.log('درخواست پروفایل کاربر:', req.params);
    try {
        await connectMongoDB();
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ _id: new ObjectId(req.params.user_id) }, {
            projection: { full_name: 1, email: 1, mobile: 1, address: 1 } // فیلدهای امن، بدون پسورد
        });
        if (!user) {
            return res.status(404).json({ message: 'کاربر یافت نشد' });
        }
        res.json(user);
    } catch (error) {
        console.error('خطا در گرفتن پروفایل:', error);
        res.status(500).json({ message: 'خطا در سرور' });
    }
});



// API برای گرفتن محصولات یک مغازه (نسخه نهایی با مرتب‌سازی بر اساس اولویت)
app.get('/api/get-products/:shop_id', async (req, res) => {
    const { shop_id } = req.params;

    // ۱. اعتبارسنجی اولیه: مطمئن می‌شویم که shop_id ارسال شده است.
    if (!shop_id || shop_id === 'null') {
        return res.status(400).json({ message: 'شناسه مغازه نامعتبر است' });
    }

    try {
        await connectMongoDB();
        const productsCollection = db.collection('products');

        // ۲. پیدا کردن تمام محصولات مربوط به این shop_id
        const products = await productsCollection.find({ shop_id: new ObjectId(shop_id) })
                                             .sort({ priority: 1 }) // ۳. مرتب‌سازی صعودی بر اساس فیلد priority
                                             .toArray();
        
        // ۴. ارسال لیست مرتب‌شده محصولات به کلاینت
        res.json(products);

    } catch (error) {
        console.error('❌ خطا در گرفتن لیست محصولات:', error);
        // اگر shop_id فرمت اشتباهی داشته باشد (مثلاً ObjectId نباشد)، اینجا خطا رخ می‌دهد.
        res.status(500).json({ message: 'خطای سرور در دریافت محصولات' });
    }
});

// API بروزرسانی پروفایل کاربر
app.put('/api/update-profile', async (req, res) => {
    console.log('درخواست بروزرسانی پروفایل دریافت شد:', req.body);
    try {
        await connectMongoDB();
        const usersCollection = db.collection('users');

        const { user_id, full_name, email, mobile, address, postal_code, whatsapp, telegram, instagram, eitaa, rubika, bale, website, location, new_password } = req.body;

        const updateData = {};
        if (full_name) updateData.full_name = full_name;
        if (email) updateData.email = email;
        if (mobile) updateData.mobile = mobile;
        if (address) updateData.address = address;
        if (postal_code) updateData.postal_code = postal_code;
        if (whatsapp) updateData.whatsapp = whatsapp;
        if (telegram) updateData.telegram = telegram;
        if (instagram) updateData.instagram = instagram;
        if (eitaa) updateData.eitaa = eitaa;
        if (rubika) updateData.rubika = rubika;
        if (bale) updateData.bale = bale;
        if (website) updateData.website = website;
        if (location) updateData.location = location;
        if (new_password) {
            if (new_password.length < 8) {
                console.log('رمز جدید کوتاه');
                return res.status(400).json({ message: 'رمز جدید کوتاه' });
            }
            updateData.password_hash = await bcrypt.hash(new_password, 10);
            console.log('رمز جدید هش شد');
        }
        updateData.updated_at = new Date();

        await usersCollection.updateOne({ _id: new ObjectId(user_id) }, { $set: updateData });
        console.log('پروفایل بروز شد');

        res.json({ success: true });
    } catch (error) {
        console.error('خطا در بروزرسانی پروفایل:', error);
        res.status(500).json({ message: 'خطا در بروزرسانی' });
    }
});

// API آپلود بنر (نسخه نهایی با مسیردهی هوشمند)
app.post('/api/upload-banner/:shop_id', upload.single('banner'), async (req, res) => {
    const { shop_id } = req.params;
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'فایل بنر انتخاب نشده است.' });
        }
        await connectMongoDB();
        const shopsCollection = db.collection('shops');
        const usersCollection = db.collection('users');

        // پیدا کردن مغازه و کاربر برای ساخت مسیر
        const shop = await shopsCollection.findOne({ _id: new ObjectId(shop_id) });
        if (!shop) return res.status(404).json({ message: 'مغازه یافت نشد' });
        
        const user = await usersCollection.findOne({ _id: shop.user_id });
        if (!user) return res.status(404).json({ message: 'مالک مغازه یافت نشد' });

        // ساخت مسیر در فولدر اصلی مغازه با نام ثابت banner
        // با این کار هر بار بنر جدید جایگزین قبلی می‌شود
        const folderPath = `${user.national_id}/${shop.shop_code}`;
        const bannerUrl = await uploadToS3(req.file, folderPath, 'banner'); // از تابع uploadToS3 استفاده می‌کنیم

        // ذخیره آدرس بنر در دیتابیس
        await shopsCollection.updateOne({ _id: new ObjectId(shop_id) }, { $set: { banner: bannerUrl } });
        
        res.json({ message: 'بنر با موفقیت آپلود شد', bannerUrl: bannerUrl });
    } catch (error) {
        console.error('خطا در آپلود بنر:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
});


// ✅ جایگزین API قبلی: API جدید و هوشمند برای مرتب‌سازی مغازه‌ها
app.get('/api/sorted-shops', async (req, res) => {
    try {
        // ۱. دریافت اطلاعات کاربر فعلی از کوئری استرینگ
        const { userId, province, city, tehran_area } = req.query;
        await connectMongoDB();

        // ۲. واکشی تمام مغازه‌های فعال
        const shopsCollection = db.collection('shops');
        let allShops = await shopsCollection.find({ status: 'active' }).toArray();

        // ۳. محاسبه آنی امتیاز برای هر مغازه
        // نکته: در یک اپلیکیشن بزرگ، بهتر است امتیازها به صورت دوره‌ای محاسبه و در دیتابیس ذخیره شوند.
        // اما برای شروع، محاسبه آنی ساده‌تر و کاملاً کافی است.
        for (const shop of allShops) {
            shop.score = await calculateShopScore(shop, db);
        }

        // ۴. مرتب‌سازی لیست مغازه‌ها بر اساس منطق چندلایه
        allShops.sort((a, b) => {
            // تابع مقایسه برای مرتب‌سازی
            const getUserTier = (shop) => {
                if (userId && shop.user_id.toString() === userId) return 0; // مغازه خودم
                if (tehran_area && shop.province === 'tehran' && shop.city === 'tehran-city' && shop.tehran_area === tehran_area) return 1; // هم‌محله‌ای (تهران)
                if (city && shop.city === city) return 2; // همشهری
                if (province && shop.province === province) return 3; // هم‌استانی
                return 4; // بقیه
            };

            const tierA = getUserTier(a);
            const tierB = getUserTier(b);

            if (tierA !== tierB) {
                return tierA - tierB; // اگر در دسته‌های مختلفی هستند، بر اساس دسته مرتب کن
            } else {
                return b.score - a.score; // اگر در یک دسته هستند، بر اساس امتیاز (نزولی) مرتب کن
            }
        });

        res.json(allShops);

    } catch (error) {
        console.error('خطا در مرتب‌سازی و دریافت مغازه‌ها:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
});


// API برای جستجو (جدید، اضافه کن)
app.get('/api/search-shops', async (req, res) => {
    const { query } = req.query;
    try {
        await connectMongoDB();
        const shopsCollection = db.collection('shops');
        const productsCollection = db.collection('products'); // فرض کن کالکشن products داری

        // جستجو بر اساس نام مغازه
        let shops = await shopsCollection.find({ shop_name: { $regex: query, $options: 'i' } }).toArray();

        // اگر محصول بود، مغازه‌هایی که محصول دارن
        if (shops.length === 0) {
            const products = await productsCollection.find({ name: { $regex: query, $options: 'i' } }).toArray();
            const shopIds = products.map(p => p.shop_id);
            shops = await shopsCollection.find({ _id: { $in: shopIds.map(id => new ObjectId(id)) } }).toArray();
        }

        res.json(shops);
    } catch (error) {
        console.error('خطا در جستجو:', error);
        res.status(500).json({ message: 'خطا' });
    }
});

// API برای فیلتر (جدید، اضافه کن)
app.get('/api/filter-shops', async (req, res) => {
    const { storeType, activity, subActivity, province, city, sort } = req.query;
    const filter = {};
    if (storeType) filter.store_type = storeType;
    if (activity) filter.activity = activity;
    if (subActivity) filter.sub_activity = subActivity;
    if (province) filter.province = province;
    if (city) filter.city = city;

    let sortObj = {};
    if (sort === 'name') sortObj = { shop_name: 1 };
    else if (sort === 'date') sortObj = { created_at: -1 };

    try {
        await connectMongoDB();
        const shopsCollection = db.collection('shops');
        const shops = await shopsCollection.find(filter).sort(sortObj).toArray();
        res.json(shops);
    } catch (error) {
        console.error('خطا در فیلتر:', error);
        res.status(500).json({ message: 'خطا' });
    }
});

// API برای جزئیات مغازه (نسخه نهایی با ارسال امتیاز)
app.get('/api/get-shop-details/:shop_id', async (req, res) => {
    const { shop_id } = req.params;
    if (!shop_id || shop_id === 'null') {
        return res.status(400).json({ message: 'شناسه مغازه نامعتبر' });
    }
    try {
        await connectMongoDB();
        const shopsCollection = db.collection('shops');
        const usersCollection = db.collection('users');
        const shop = await shopsCollection.findOne({ _id: new ObjectId(shop_id) });

        if (shop) {
            const owner = await usersCollection.findOne({ _id: new ObjectId(shop.user_id) });
            shop.owner_full_name = owner ? owner.full_name : 'نامشخص';
            
            // ✅ محاسبه و اضافه کردن امتیاز به آبجکت shop
            shop.score = await calculateShopScore(shop, db); 

            shop.user_id = shop.user_id.toString();
        }
        res.json(shop || {});
    } catch (error) {
        console.error('خطا در جزئیات مغازه:', error);
        res.status(500).json({ message: 'خطا' });
    }
});

// ✅ API حذف محصول (نسخه نهایی با قابلیت حذف عکس از S3)
app.delete('/api/product/:productId', async (req, res) => {
    const { productId } = req.params;
    try {
        await connectMongoDB();
        const productsCollection = db.collection('products');
        
        // ۱. ابتدا محصول را پیدا کن تا آدرس عکس آن را داشته باشیم
        const productToDelete = await productsCollection.findOne({ _id: new ObjectId(productId) });
        if (!productToDelete) {
            return res.status(404).json({ message: 'محصول یافت نشد' });
        }

        // ۲. محصول را از دیتابیس حذف کن
        await productsCollection.deleteOne({ _id: new ObjectId(productId) });

        // ۳. اگر محصول عکس داشت، آن را از S3 هم حذف کن
        if (productToDelete.image) {
            await deleteFromS3(productToDelete.image);
        }
        
        res.json({ success: true, message: 'محصول با موفقیت حذف شد' });
    } catch (error) {
        console.error('خطا در حذف محصول:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
});


// ۳. API جدید برای ویرایش محصول (این کد را هم به انتهای فایل اضافه کن)
app.put('/api/product/:productId', async (req, res) => {
    const { productId } = req.params;
    const { name, description, instagram_link } = req.body;
    try {
        await connectMongoDB();
        const productsCollection = db.collection('products');
        const updateData = { name, description, instagram_link };
        
        await productsCollection.updateOne(
            { _id: new ObjectId(productId) },
            { $set: updateData }
        );
        res.json({ success: true, message: 'محصول با موفقیت بروزرسانی شد' });
    } catch (error) {
        console.error('خطا در ویرایش محصول:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
});

// این API را به server.js اضافه کن
app.put('/api/products/reorder', async (req, res) => {
    const { orderedIds } = req.body;
    try {
        await connectMongoDB();
        const productsCollection = db.collection('products');
        
        const updatePromises = orderedIds.map((id, index) => 
            productsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { priority: index + 1 } }
            )
        );
        await Promise.all(updatePromises);
        res.json({ success: true, message: 'ترتیب محصولات ذخیره شد.' });
    } catch (error) {
        res.status(500).json({ message: 'خطای سرور در ذخیره ترتیب' });
    }
});

// راه‌اندازی سرور
app.listen(port, async () => {
    await connectMongoDB();
    console.log(`Server running on port ${port}`);
});