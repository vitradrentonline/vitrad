const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
require('dotenv').config();

/**
 * فایلی را در فضای ذخیره‌سازی S3 لیارا آپلود می‌کند.
 * @param {object} file - آبجکت فایل که از multer دریافت می‌شود (شامل buffer, originalname, mimetype).
 * @param {string} folderPath - مسیر فولدری که فایل باید در آن آپلود شود (مثال: '1234567890/87654321/products').
 * @param {string|null} customFileName - (اختیاری) یک نام ثابت برای فایل (مثال: 'banner'). اگر ارسال نشود، یک نام یکتا بر اساس زمان ساخته می‌شود.
 * @returns {Promise<string>} آدرس URL کامل فایل آپلود شده را برمی‌گرداند.
 */

const app = express();
const port = process.env.PORT || 3000;
const MONGO_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://vitrad:Vitrad1404@cluster0.jpo6lmk.mongodb.net/Vitrad?retryWrites=true&w=majority&appName=Cluster0';
mongoose.set('strictQuery', false);
mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 })
  .then(() => console.log('✅ Mongoose connected'))
  .catch((err) => console.error('❌ Mongoose connect error:', err?.message));



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
const mongoUri = MONGO_URI;   // یکسان با بالایی
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

        const shops = await shopsCollection.aggregate([
            // مرحله ۱: فقط مغازه‌های فعال را پیدا کن
            { $match: { status: 'active' } }, // در کد شما وضعیت 'active' برای مغازه تایید شده است

            // مرحله ۲: به کالکشن محصولات وصل شو (معادل populate)
            {
                $lookup: {
                    from: 'products',          // نام کالکشن محصولات
                    localField: '_id',         // فیلد اتصال از کالکشن shops
                    foreignField: 'shop_id',   // فیلد اتصال از کالکشن products
                    pipeline: [                // یک پایپ‌لاین داخلی برای مرتب‌سازی و محدود کردن محصولات
                        { $sort: { priority: 1 } },
                        { $limit: 3 },
                        { $project: { name: 1, image: 1, _id: 0 } } // فقط نام و عکس را برگردان
                    ],
                    as: 'products'             // نتیجه را در فیلدی به نام products بریز
                }
            }
        ]).toArray();

        res.json(shops);

    } catch (error) {
        console.error('Server Error in /api/public-shops:', error);
        res.status(500).json({ message: 'خطای سرور در دریافت اطلاعات فروشگاه‌ها' });
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

// API برای آپلود عکس پروفایل کاربر
app.post('/api/user/profile-picture/:user_id', upload.single('profilePicture'), async (req, res) => {
    const { user_id } = req.params;

    try {
        if (!req.file) {
            return res.status(400).json({ message: 'فایل تصویری انتخاب نشده است.' });
        }
        await connectMongoDB();
        const usersCollection = db.collection('users');

        // ۱. پیدا کردن کاربر برای ساخت مسیر پوشه
        const user = await usersCollection.findOne({ _id: new ObjectId(user_id) });
        if (!user) {
            return res.status(404).json({ message: 'کاربر یافت نشد.' });
        }

        // ۲. ساخت مسیر آپلود در فضای ذخیره‌سازی S3
        // مثال: users/شناسه-کاربری-یکتا/profile.jpg
        const folderPath = `users/${user.user_identifier}`;
        const imageUrl = await uploadToS3(req.file, folderPath, 'profile'); // نام فایل را ثابت می‌گذاریم تا جایگزین شود

        // ۳. ذخیره آدرس URL عکس در دیتابیس
        await usersCollection.updateOne(
            { _id: new ObjectId(user_id) },
            { $set: { profile_picture_url: imageUrl } }
        );

        // ۴. ارسال پاسخ موفق به همراه آدرس جدید عکس
        res.json({ success: true, message: 'عکس پروفایل با موفقیت آپلود شد', newImageUrl: imageUrl });

    } catch (error) {
        console.error('خطا در آپلود عکس پروفایل:', error);
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
// ✅ نرمال‌سازی فیلدهای تکمیلی و لوکیشن (بعد از ساخت initialShopData)
try {
  if (typeof req.body.address !== 'undefined') initialShopData.address = req.body.address;
  if (typeof req.body.work_experience !== 'undefined') initialShopData.work_experience = req.body.work_experience;

  const latRaw = req.body.latitude ?? req.body.lat;
  const lngRaw = req.body.longitude ?? req.body.lng;
  const lat = (latRaw !== undefined && latRaw !== null && String(latRaw).trim() !== '') ? parseFloat(latRaw) : null;
  const lng = (lngRaw !== undefined && lngRaw !== null && String(lngRaw).trim() !== '') ? parseFloat(lngRaw) : null;

  if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat !== null && lng !== null) {
    initialShopData.location = { type: 'Point', coordinates: [lng, lat] };
    initialShopData.lat = lat;
    initialShopData.lng = lng;
  }
} catch (e) { console.warn('normalize initialShopData failed:', e); }

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

// این کد را به انتهای فایل server.js اضافه کنید

// API جدید فقط برای آپلود لوگوی فروشگاه
app.post('/api/shop/:shop_id/logo', upload.single('shopLogo'), async (req, res) => {
    const { shop_id } = req.params;

    try {
        if (!req.file) {
            return res.status(400).json({ message: 'فایل لوگو انتخاب نشده است.' });

// ✅ Upload banner (mirrors logo upload)
app.post('/api/shop/:shop_id/banner', upload.single('shopBanner'), async (req, res) => {
  const { shop_id } = req.params;
  try {
    if (!req.file) return res.status(400).json({ message: 'فایل بنر انتخاب نشده است.' });

    await connectMongoDB();
    const shopsCollection = db.collection('shops');
    const shop = await shopsCollection.findOne({ _id: new ObjectId(shop_id) });
    if (!shop) return res.status(404).json({ message: 'فروشگاه یافت نشد.' });

    // اگر تابع uploadToS3 موجود است از آن استفاده می‌کنیم؛
    // وگرنه، مسیر ذخیره‌سازی فعلی پروژه را به‌کار می‌گیریم.
    let imageUrl = null;
    if (typeof uploadToS3 === 'function') {
      const folderPath = `${shop.user_id || 'public'}/${shop.shop_code || 'shop'}`;
      imageUrl = await uploadToS3(req.file, folderPath, 'banner');
    } else if (typeof saveLocalUpload === 'function') {
      imageUrl = await saveLocalUpload(req, req.file, 'banner');
    } else {
      // fallback: نگهداری روی دیسک فعلی
      imageUrl = `/uploads/${req.file.filename}`;
    }

    await shopsCollection.updateOne(
      { _id: new ObjectId(shop_id) },
      { $set: { banner: imageUrl, banner_url: imageUrl, updated_at: new Date() } }
    );

    res.json({ success: true, message: 'بنر با موفقیت آپلود شد', newImageUrl: imageUrl });
  } catch (error) {
    console.error('خطا در آپلود بنر:', error);
    res.status(500).json({ message: 'خطای سرور' });
  }
});

        }
        await connectMongoDB();
        const shopsCollection = db.collection('shops');
        const usersCollection = db.collection('users');

        // ۱. پیدا کردن فروشگاه و مالک برای ساخت مسیر پوشه
        const shop = await shopsCollection.findOne({ _id: new ObjectId(shop_id) });
        if (!shop) return res.status(404).json({ message: 'فروشگاه یافت نشد.' });
        
        const owner = await usersCollection.findOne({ _id: shop.user_id });
        if (!owner) return res.status(404).json({ message: 'مالک فروشگاه یافت نشد.' });

        // ۲. ساخت مسیر آپلود در فضای ذخیره‌سازی
        const folderPath = `${owner.national_id}/${shop.shop_code}`;
        const imageUrl = await uploadToS3(req.file, folderPath, 'logo'); // نام فایل را "logo" می‌گذاریم تا جایگزین شود

        // ۳. ذخیره آدرس URL لوگو در دیتابیس
        await shopsCollection.updateOne(
            { _id: new ObjectId(shop_id) },
            { $set: { logo_url: imageUrl } }
        );
        
        res.json({ success: true, message: 'لوگو با موفقیت آپلود شد', newImageUrl: imageUrl });

    } catch (error) {
        console.error('خطا در آپلود لوگو:', error);
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

// فایل: server.js (جایگزینی API آپدیت مغازه)

app.put('/api/update-shop/:shop_id', async (req, res) => {
    const { shop_id } = req.params;
    
    // ▼▼▼ متغیر call_windows_json را به اینجا اضافه کنید ▼▼▼
    const { 
        description, shop_description, phone, shop_phone, 
        whatsapp, telegram, instagram, eitaa, rubika, bale, 
        work_experience, address, full_address, 
        latitude, longitude, lat, lng,
        calls_enabled, call_windows_json // <-- فیلدهای جدید
    } = req.body;

    try {
        await connectMongoDB();
        const shopsCollection = db.collection('shops');
        
        const updateData = {};
        
        // نرمال‌سازی فیلدهای اطلاعاتی
        if (description !== undefined) updateData.shop_description = description;
        if (shop_description !== undefined) updateData.shop_description = shop_description;
        if (phone !== undefined) updateData.shop_phone = phone;
        if (shop_phone !== undefined) updateData.shop_phone = shop_phone;

        // فیلدهای شبکه‌های اجتماعی
        if (whatsapp !== undefined) updateData.whatsapp = whatsapp;
        if (telegram !== undefined) updateData.telegram = telegram;
        if (instagram !== undefined) updateData.instagram = instagram;
        if (eitaa !== undefined) updateData.eitaa = eitaa;
        if (rubika !== undefined) updateData.rubika = rubika;
        if (bale !== undefined) updateData.bale = bale;
        
        // فیلدهای تکمیلی
        if (work_experience !== undefined) updateData.work_experience = work_experience;
        if (address !== undefined) updateData.address = address;
        if (full_address !== undefined) updateData.address = full_address;

        // نرمال‌سازی موقعیت مکانی
        const latRaw = latitude ?? lat;
        const lngRaw = longitude ?? lng;
        if (latRaw !== undefined && lngRaw !== undefined) {
            updateData.lat = parseFloat(latRaw);
            updateData.lng = parseFloat(lngRaw);
            updateData.location = { type: 'Point', coordinates: [parseFloat(lngRaw), parseFloat(latRaw)] };
        }

        //
        // ▼▼▼ بخش جدید برای ذخیره تنظیمات تماس ▼▼▼
        //
        if (calls_enabled !== undefined) {
            updateData.calls_enabled = (calls_enabled === true || calls_enabled === 'true');
        }
        
        if (call_windows_json !== undefined) {
            try {
                // تلاش برای پارس کردن رشته JSON ارسالی از کلاینت
                updateData.call_windows = JSON.parse(call_windows_json);
            } catch (e) {
                console.warn('خطا در پارس کردن JSON پنجره‌های زمانی تماس:', e.message);
                // اگر فرمت اشتباه بود، ذخیره نکن یا خطا برگردان
                // اینجا ما خطا برنمی‌گردانیم تا بقیه اطلاعات ذخیره شوند
            }
        }
        // ▲▲▲ پایان بخش جدید ▲▲▲

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

app.get('/api/get-all-shops', async (req, res) => {
    try {
        await connectMongoDB();
        const shopsCollection = db.collection('shops');
        
        // فقط مغازه‌هایی که وضعیت 'active' دارند را پیدا کن
        const shops = await shopsCollection.find({ status: 'active' }).toArray();
        
        res.json(shops);
    } catch (error) {
        console.error('خطا در دریافت همه مغازه‌ها:', error);
        res.status(500).json({ message: 'خطای سرور در دریافت مغازه‌ها' });
    }
});

// ✅ جایگزین API قبلی: API جدید و هوشمند برای مرتب‌سازی مغازه‌ها
app.get('/api/sorted-shops', async (req, res) => {
    try {
        const { userId, province, city, tehran_area } = req.query;
        await connectMongoDB();

        const shopsCollection = db.collection('shops');
        let allShops = await shopsCollection.find({ status: 'active' }).toArray();

        for (const shop of allShops) {
            shop.score = await calculateShopScore(shop, db);
        }

        allShops.sort((a, b) => {
            const getUserTier = (shop) => {
                if (userId && shop.user_id.toString() === userId) return 0;
                if (tehran_area && shop.province === 'tehran' && shop.city === 'tehran-city' && shop.tehran_area === tehran_area) return 1;
                if (city && shop.city === city) return 2;
                if (province && shop.province === province) return 3;
                return 4;
            };

            const tierA = getUserTier(a);
            const tierB = getUserTier(b);

            if (tierA !== tierB) {
                return tierA - tierB;
            } else {
                return b.score - a.score;
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
    if (activity) filter.activity_type = activity; // <<-- "activity" به "activity_type" تغییر کرد
    if (subActivity) filter.job_category = subActivity; // <<-- "sub_activity" به "job_category" تغییر کرد
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
// server.js - THE CORRECT CODE
app.get('/api/get-shop-details/:shop_id', async (req, res) => {
    try {
        await connectMongoDB();
        const { shop_id } = req.params;

        // اعتبارسنجی اولیه برای اینکه مطمئن شیم shop_id معتبره
        if (!ObjectId.isValid(shop_id)) {
            return res.status(400).json({ success: false, message: 'شناسه مغازه نامعتبر است.' });
        }

        const shopsCollection = db.collection('shops');
        
        // 1. ساخت صحیح ObjectId
        const shop = await shopsCollection.findOne({ _id: new ObjectId(shop_id) });

        if (!shop) {
            return res.status(404).json({ success: false, message: 'فروشگاه یافت نشد.' });
        }
        
        // 2. ارسال مستقیم آبجکت shop (چون تابع نرمال‌سازی در فرانت‌اند وجود داره)
        res.json({ success: true, data: shop });

    } catch (error) {
        console.error('خطا در دریافت جزئیات مغازه:', error);
        res.status(500).json({ success: false, message: 'خطای سرور' });
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

const userSchema = new mongoose.Schema({
    full_name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    mobile: { type: String, required: true, unique: true },
    national_id: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    province: String,
    city: String,
    tehran_area: String,
    referral_code: { type: String, unique: true },
    referred_by: String,
    is_verified: { type: Boolean, default: false },
    otp: String,
    otp_expires: Date,
    reset_token: String,
    reset_token_expires: Date,
    role: { type: String, enum: ['user', 'seller', 'both'], default: 'user' },
    profile_picture_url: String,
    following_shops: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Shop' }]
});

const shopSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    shop_name: { type: String, required: true },
    shop_description: String,
    activity_type: String,
    job_category: String,
    shop_phone: String,
    shop_email: String,
    province: String,
    city: String,
    address: String,
    tehran_area: String,
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], index: '2dsphere' }
    },
    documents: {
        nationalCardImage: String,
        selfieImage: String,
        businessLicenseImage: String,
        healthLicenseImage: String
    },
    is_verified: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    shop_code: { type: String, unique: true },
    otp: String,
    otp_expires: Date,
    banner: String,
    logo: String,
    score: { type: Number, default: 0 },
    // فیلدهای جدید برای صفحه غرفه
    followers_count: { type: Number, default: 0 },
    last_activity: { type: Date, default: Date.now },
    total_sales: { type: Number, default: 0 },
    work_experience: String,
    // راه‌های ارتباطی
    whatsapp: String,
    telegram: String,
    instagram: String,
    eitaa: String,
    rubika: String,
    bale: String,
    calls_enabled: { type: Boolean, default: false },
    call_windows: { type: Array, default: [] },
});

const productSchema = new mongoose.Schema({
    shop_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    name: { type: String, required: true },
    description: String,
    image: String,
    instagram_link: String,
    priority: { type: Number, default: 0 },
    tags: [String], // for filters like 'free_shipping', 'in_stock', etc.
    price: Number,
    discount_price: Number,
});

// ========= مدل‌های جدید برای صفحه غرفه ==========
const reviewSchema = new mongoose.Schema({
    shop_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    text: String,
    createdAt: { type: Date, default: Date.now },
    helpful_votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

const followSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    shop_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
}, { timestamps: true });
followSchema.index({ user_id: 1, shop_id: 1 }, { unique: true }); // جلوگیری از دنبال کردن تکراری

const reportSchema = new mongoose.Schema({
    reporter_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reported_item_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    report_type: { type: String, enum: ['shop', 'review', 'product'], required: true },
    reason: { type: String, required: true },
    description: String,
    status: { type: String, enum: ['pending', 'reviewed', 'resolved'], default: 'pending' },
}, { timestamps: true });


// Models
const User = mongoose.model('User', userSchema);
const Shop = mongoose.model('Shop', shopSchema);
const Product = mongoose.model('Product', productSchema);
const Review = mongoose.model('Review', reviewSchema);
const Follow = mongoose.model('Follow', followSchema);
const Report = mongoose.model('Report', reportSchema);

// ==========================================================
// ========== API Endpoints for Shop Details Page ==========
// ==========================================================

// 1. دریافت تمام اطلاعات یک غرفه برای نمایش عمومی
// GET /api/shops/:shopId/details
// ====== Shop public details ======
// ====== Shop public details ======
app.get('/api/shops/:shopId/details', async (req, res) => {
  try {
    const { shopId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(shopId)) {
      return res.status(400).json({ success: false, message: 'شناسه غرفه نامعتبر است.' });
    }

    const shop = await Shop.findById(shopId).lean();
    if (!shop /* یا هر شرط تایید/فعال‌بودن */) {
      return res.status(4404).json({ success: false, message: 'غرفه یافت نشد.' });
    }

    // ✅ این محاسبات درست بودند و باقی می‌مانند
    const [productCount, followers, reviews] = await Promise.all([
      Product.countDocuments({ shop_id: shopId }),
      Follow.countDocuments({ shop_id: shopId }),
      Review.find({ shop_id: shopId }, 'rating').lean()
    ]);
    const reviewCount = reviews.length;
    const rating = reviewCount
      ? Number((reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviewCount).toFixed(1))
      : 0;

    //
    // ▼▼▼ بخش اصلی تغییرات اینجاست ▼▼▼
    //
    res.json({
      success: true,
      data: {
        id: shop._id,
        name: shop.shop_name || shop.name || '',
        city: shop.city || '',
        description: shop.shop_description || shop.description || '',
        logo_url: shop.logo || null,
        banner_url: shop.banner || null,
        phone: shop.shop_phone || '', // ✅ این فیلد اضافه شد (برای نمایش تلفن)
        experience: shop.work_experience || '',
        address: shop.address || '',
        
        // ✅ فیلدهای موقعیت مکانی برای نقشه
        lat: shop.lat,
        lng: shop.lng,

        // ✅ فیلدهای مربوط به تماس صوتی/تصویری
        calls_enabled: !!shop.calls_enabled,
        call_windows: shop.call_windows || [],

        // ✅ فیلدهای محاسباتی (اینها از قبل درست بودند)
        followers: followers,
        rating: rating,
        reviewCount: reviewCount,
        productCount: productCount
      }
    });
    // ▲▲▲ پایان بخش تغییرات ▲▲▲
    //
  } catch (error) {
    console.error('Error fetching shop details:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
});




// 2. دریافت محصولات یک غرفه با قابلیت فیلتر، جستجو و مرتب‌سازی
app.get('/api/shops/:shopId/products', async (req, res) => {
    try {
        const { shopId } = req.params;
        const { search, sort, free_shipping, wholesale, in_stock, has_discount } = req.query;

        let query = { shop_id: shopId };

        // اعمال جستجو
        if (search) {
            query.name = { $regex: search, $options: 'i' }; // جستجوی بدون حساسیت به حروف
        }

        // اعمال فیلترها
        let filters = [];
        if (free_shipping === 'true') filters.push('free_shipping');
        if (wholesale === 'true') filters.push('wholesale');
        if (in_stock === 'true') filters.push('in_stock');
        if (has_discount === 'true') query.discount_price = { $exists: true, $ne: null };
        
        if (filters.length > 0) {
            query.tags = { $all: filters };
        }

        // اعمال مرتب‌سازی
        let sortOption = { priority: -1 }; // پیش‌فرض: پیشنهاد غرفه‌دار
        if (sort === 'newest') {
            sortOption = { _id: -1 }; // بر اساس تاریخ ایجاد (آیدی‌های جدیدتر)
        } else if (sort === 'discount') {
            sortOption = { discount_price: -1 };
        }

        const products = await Product.find(query).sort(sortOption);
        res.json({ success: true, data: products });

    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ success: false, message: "خطای سرور" });
    }
});

// 4. ثبت نظر جدید برای یک غرفه
app.post('/api/shops/:shopId/reviews', async (req, res) => {
    try {
        const { userId, rating, text } = req.body;
        const { shopId } = req.params;
        
        // ▼▼▼ بخش اصلی تغییرات اینجاست ▼▼▼
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: "اطلاعات کاربر نامعتبر است. لطفاً دوباره وارد شوید." });
        }
        // ▲▲▲ پایان بخش تغییرات ▲▲▲

        // جلوگیری از ثبت نظر تکراری توسط یک کاربر
        const existingReview = await Review.findOne({ shop_id: shopId, user_id: userId });
        if(existingReview) {
            return res.status(400).json({ success: false, message: "شما قبلا برای این غرفه نظر ثبت کرده‌اید." });
        }

        const newReview = new Review({
            shop_id: shopId,
            user_id: new mongoose.Types.ObjectId(userId), // ✅ تبدیل به ObjectId
            rating,
            text
        });
        await newReview.save();
        res.status(201).json({ success: true, message: "نظر شما با موفقیت ثبت شد.", data: newReview });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطای سرور' });
    }
});


// 5. دریافت خلاصه امتیازات (مثلا: چند نفر 5 ستاره دادن)
app.get('/api/shops/:shopId/rating-summary', async (req, res) => {
    try {
        const summary = await Review.aggregate([
            { $match: { shop_id: mongoose.Types.ObjectId(req.params.shopId) } },
            { $group: { _id: "$rating", count: { $sum: 1 } } }
        ]);
        // تبدیل به فرمت خواناتر
        const formattedSummary = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        summary.forEach(item => {
            formattedSummary[item._id] = item.count;
        });
        res.json({ success: true, data: formattedSummary });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطای سرور' });
    }
});


// 6. دنبال کردن / لغو دنبال کردن یک غرفه
// 6. دنبال کردن / لغو دنبال کردن یک غرفه
app.post('/api/shops/follow', async (req, res) => {
    const { userId, shopId } = req.body;
    
    // ▼▼▼ تغییرات از اینجا شروع می‌شود ▼▼▼
    // const session = await mongoose.startSession(); // این خط حذف شد
    // session.startTransaction(); // این خط حذف شد
    
    try {
        const existingFollow = await Follow.findOne({ user_id: userId, shop_id: shopId });

        if (existingFollow) {
            // Unfollow
            await Follow.findByIdAndDelete(existingFollow._id); // { session } حذف شد
            await Shop.findByIdAndUpdate(shopId, { $inc: { followers_count: -1 } }); // { session } حذف شد
            await User.findByIdAndUpdate(userId, { $pull: { following_shops: shopId } }); // { session } حذف شد
            
            // await session.commitTransaction(); // این خط حذف شد
            
            res.json({ success: true, message: "غرفه از لیست دنبال‌شده‌ها حذف شد.", status: 'unfollowed' });
        } else {
            // Follow
            const newFollow = new Follow({ user_id: userId, shop_id: shopId });
            await newFollow.save(); // { session } حذف شد
            await Shop.findByIdAndUpdate(shopId, { $inc: { followers_count: 1 } }); // { session } حذف شد
            await User.findByIdAndUpdate(userId, { $push: { following_shops: shopId } }); // { session } حذف شد
            
            // await session.commitTransaction(); // این خط حذف شد
            
            res.json({ success: true, message: "غرفه با موفقیت دنبال شد.", status: 'followed' });
        }
    } catch (error) {
        // await session.abortTransaction(); // این خط حذف شد
        res.status(500).json({ success: false, message: 'خطای سرور' });
    } 
    // finally {
    //     session.endSession(); // این خط حذف شد
    // }
    // ▲▲▲ پایان تغییرات ▲▲▲
});


// 7. ثبت گزارش تخلف برای غرفه، محصول یا نظر
app.post('/api/report', async (req, res) => {
    try {
        const { reporterId, reportedItemId, reportType, reason, description } = req.body;
        const newReport = new Report({
            reporter_id: reporterId,
            reported_item_id: reportedItemId,
            report_type: reportType,
            reason: reason,
            description: description
        });
        await newReport.save();
        res.status(201).json({ success: true, message: "گزارش شما با موفقیت ثبت شد و در دست بررسی قرار گرفت." });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطای سرور' });
    }
});


// 8. API های Placeholder برای تماس و چت
app.post('/api/shops/:shopId/initiate-call', (req, res) => {
  const { shopId } = req.params;
  res.json({ success: true, message: 'درخواست تماس با موفقیت ارسال شد.', callRoomId: `call_${shopId}_${Date.now()}` });
});


app.post('/api/shops/:shopId/initiate-chat', (req, res) => {
    // در یک پروژه واقعی، اینجا منطق ایجاد یک چت روم در WebSocket server قرار می‌گیرد
    res.json({ success: true, message: 'چت با موفقیت آغاز شد.', chatRoomId: `chat_${shopId}_${req.body.userId}` });
});

// ====== HTTP + Socket.IO bootstrap ======
const http = require('http');
const server = http.createServer(app);

const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

// سیگنالینگ WebRTC (حداقل لازم)
io.on('connection', (socket) => {
  socket.on('join', ({ roomId, role }) => {
    socket.join(roomId);
    socket.to(roomId).emit('peer-joined', { role });
  });
  socket.on('offer', ({ roomId, sdp }) => {
    socket.to(roomId).emit('offer', { sdp });
  });
  socket.on('answer', ({ roomId, sdp }) => {
    socket.to(roomId).emit('answer', { sdp });
  });
  socket.on('ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('ice-candidate', { candidate });
  });
  socket.on('leave', ({ roomId }) => {
    socket.leave(roomId);
    socket.to(roomId).emit('peer-left');
  });
});
// --- پایان: ستاپ Socket.IO ---

// ====== Call Availability ======
app.get('/api/shops/:shopId/call-availability', async (req, res) => {
  try {
    const { shopId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(shopId)) {
      return res.status(400).json({ success: false, message: 'شناسه نامعتبر' });
    }

    const shop = await Shop.findById(shopId, 'calls_enabled call_windows').lean();
    if (!shop) return res.status(404).json({ success: false, message: 'غرفه یافت نشد' });

    const enabled = !!shop.calls_enabled;
    const windows = Array.isArray(shop.call_windows) ? shop.call_windows : [];

    const now = new Date();                // زمان سرور
    const dayIdx = now.getDay();           // 0..6
    const map = ['sun','mon','tue','wed','thu','fri','sat'];
    const todayKey = map[dayIdx];
    const pad2 = (n) => (n<10? '0'+n : ''+n);
    const hm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

    let within = false;
    for (const w of windows) {
      if (w?.day === todayKey && w?.start && w?.end) {
        if (w.start <= hm && hm <= w.end) { within = true; break; }
      }
    }

    res.json({ success:true, data:{ enabled, within, windows } });
  } catch (e) {
    console.error('availability error:', e);
    res.status(500).json({ success:false, message:'خطای سرور' });
  }
});


// راه‌اندازی سرور
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('🚀 Server listening on', PORT));