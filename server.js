const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// تنظیمات S3
const s3 = new AWS.S3({
    accessKeyId: process.env.LIARA_ACCESS_KEY || 'q93lk9pelicu3rgn',
    secretAccessKey: process.env.LIARA_SECRET_KEY || '8f609904-d779-428e-9108-1abb57171f3b',
    endpoint: process.env.LIARA_ENDPOINT || 'https://storage.c2.liara.space',
    s3ForcePathStyle: true
});
const bucketName = process.env.LIARA_BUCKET_NAME || 'rent-online';

// تنظیمات Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'sedghinahada@gmail.com',
        pass: process.env.EMAIL_PASS || 'otsh kgxk aaso hwuz'
    }
});

// MongoDB connection
const mongoUri = 'mongodb+srv://amir:Amir1381@cluster0.1ahamnk.mongodb.net/asn?retryWrites=true&w=majority&appName=Cluster0';
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
            db = mongoClient.db('asn');
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
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        console.log(`فایل دریافتی: ${file.originalname}, نوع: ${file.mimetype}`);
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('فقط تصاویر مجاز هستند'), false);
        }
    }
});

// Helper برای آپلود به S3 با نام منحصر به فرد
async function uploadToS3(file, folder, userEmail) {
    console.log(`شروع آپلود فایل: ${file.originalname} به فولدر ${folder}`);
    try {
        const uniqueName = `${userEmail}-${Date.now()}-${file.originalname}`;
        const params = {
            Bucket: bucketName,
            Key: `${folder}/${uniqueName}`,
            Body: file.buffer,
            ContentType: file.mimetype
        };
        const result = await s3.upload(params).promise();
        console.log(`آپلود موفق: ${result.Location}`);
        return result.Location;
    } catch (error) {
        console.error(`خطا در آپلود: ${error.message}`);
        throw error;
    }
}

// تابع generateOTP (فرض می‌کنیم این تابع وجود دارد، اگر نه اضافه کنید)
const otps = new Map(); // برای ذخیره OTPها
function generateOTP(email) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 رقمی
    const expires = Date.now() + 5 * 60 * 1000; // 5 دقیقه
    otps.set(email, { otp, expires });
    return otp;
}

// API register با logها
app.post('/api/register', upload.fields([
    { name: 'nationalCard', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
    { name: 'businessLicense', maxCount: 1 },
    { name: 'healthLicense', maxCount: 1 }
]), async (req, res) => {
    console.log('درخواست ثبت‌نام دریافت شد');
    try {
        const { role, fullName, email, mobile, province, city, tehranArea, referralCode, password, storeType, activityType, shopName, nationalCode, businessName, description } = req.body;
        const files = req.files;
        console.log(`داده‌ها: role=${role}, fullName=${fullName}, email=${email}, mobile=${mobile}, province=${province}, city=${city}, tehranArea=${tehranArea || 'N/A'}, referralCode=${referralCode || 'N/A'}, storeType=${storeType || 'N/A'}, activityType=${activityType || 'N/A'}, shopName=${shopName || 'N/A'}, nationalCode=${nationalCode || 'N/A'}, businessName=${businessName || 'N/A'}, description=${description || 'N/A'}`);
        console.log('--- درخواست ثبت‌نام جدید ---');
        console.log('نقش کاربر:', role);
        console.log('داده‌های متنی:', req.body);
        // ✨ لاگ کردن نام فایل‌های دریافت شده
        if (files) {
            console.log('فایل‌های دریافت شده:', Object.keys(files).map(key => files[key][0].originalname));
        }

        if (!role || !fullName || !email || !mobile || !province || !city || !password) {
            console.log('داده‌های الزامی مفقود');
            return res.status(400).json({ message: 'داده‌های الزامی پر نشده' });
        }

        await connectMongoDB();
        const usersCollection = db.collection('users');
        const existing = await usersCollection.findOne({ $or: [{ email }, { mobile }, { nationalCode: nationalCode || null }].filter(Boolean) });
        if (existing) {
            console.log('کاربر تکراری یافت شد');
            return res.status(400).json({ message: 'ایمیل، موبایل یا کد ملی تکراری است' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('رمز عبور هش شد');

        let fileUrls = {};
        if (role === 'shop_owner') {
            if (!files.nationalCard || !files.selfie || !files.businessLicense) {
                console.log('فایل‌های الزامی آپلود نشده');
                return res.status(400).json({ message: 'فایل‌های الزامی آپلود نشده' });
            }
            fileUrls.nationalCard = await uploadToS3(files.nationalCard[0], 'national-cards', email);
            fileUrls.selfie = await uploadToS3(files.selfie[0], 'selfies', email);
            fileUrls.businessLicense = await uploadToS3(files.businessLicense[0], 'business-licenses', email);
            if (files.healthLicense) {
                fileUrls.healthLicense = await uploadToS3(files.healthLicense[0], 'health-licenses', email);
            }
            console.log('فایل‌ها آپلود شدند');
        }

        const user = {
            role,
            fullName,
            email,
            mobile,
            address: { province, city, tehranArea: tehranArea || '' },
            referralCode: referralCode || '',
            password: hashedPassword,
            verified: false,
            ...(role === 'shop_owner' ? {
                storeType,
                activityType,
                shopName,
                nationalCode,
                businessName: businessName || '',
                description: description || '',
                files: fileUrls
            } : {})
        };
        const insertResult = await usersCollection.insertOne(user);
        console.log('کاربر جدید در دیتابیس ذخیره شد');

        // ✨ تولید ID منحصر به فرد با فرمت جدید
        let uniqueID;
        const randomNumber = Math.floor(1000000 + Math.random() * 9000000); // تولید عدد 7 رقمی

        if (role === 'shop_owner') {
            uniqueID = `s${randomNumber}`;
        } else { // برای مشتری
            uniqueID = `c${randomNumber}`;
        }

        await usersCollection.updateOne({ _id: insertResult.insertedId }, { $set: { uniqueID } });
        console.log(`ID منحصر به فرد با فرمت جدید تولید شد: ${uniqueID}`);

        // ارسال ایمیل ID
        const mailIDOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'ID منحصر به فرد شما',
            text: `ثبت‌نام موفق! ID شما برای ورود آینده: ${uniqueID}`
        };
        await transporter.sendMail(mailIDOptions);
        console.log(`ایمیل ID ارسال شد به ${email}`);

        // ارسال OTP
        const otp = generateOTP(email);
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'کد تأیید ثبت‌نام',
            text: `کد تأیید شما: ${otp}. این کد 5 دقیقه معتبر است.`
        };
        await transporter.sendMail(mailOptions);
        console.log(`OTP ارسال شد به ایمیل: ${email}`);

        res.json({ success: true, message: 'ثبت‌نام موفق، OTP ارسال شد' });
    } catch (error) {
        console.error('خطا در /api/register:', error);
        res.status(500).json({ message: 'خطا در ثبت‌نام', error: error.message });
    }
});

// API verify OTP
app.post('/api/verify-otp', async (req, res) => {
    console.log('درخواست تأیید OTP دریافت شد');
    try {
        const { email, otp } = req.body;
        console.log(`داده‌ها: email=${email}, otp=${otp}`);

        if (!email || !otp) {
            console.log('داده‌های الزامی مفقود');
            return res.status(400).json({ message: 'ایمیل یا OTP پر نشده' });
        }

        const stored = otps.get(email);
        if (stored && stored.otp === otp && Date.now() < stored.expires) {
            otps.delete(email);
            await connectMongoDB();
            const usersCollection = db.collection('users');
            const updateResult = await usersCollection.updateOne({ email }, { $set: { verified: true } });
            console.log(`کاربر تأیید شد: ${updateResult.modifiedCount} رکورد بروز شد`);
            res.json({ success: true, message: 'تأیید موفق' });
        } else {
            console.log('OTP نامعتبر یا منقضی شده');
            res.status(400).json({ message: 'کد نامعتبر یا منقضی شده' });
        }
    } catch (error) {
        console.error('خطا در /api/verify-otp:', error);
        res.status(500).json({ message: 'خطا در تأیید OTP', error: error.message });
    }
});

// API resend OTP
app.post('/api/resend-otp', async (req, res) => {
    console.log('درخواست ارسال دوباره OTP دریافت شد');
    try {
        const { email } = req.body;
        console.log(`داده‌ها: email=${email}`);

        if (!email) {
            console.log('ایمیل مفقود');
            return res.status(400).json({ message: 'ایمیل پر نشده' });
        }

        await connectMongoDB();
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ email });
        if (!user || user.verified) {
            console.log('کاربر یافت نشد یا قبلاً تأیید شده');
            return res.status(400).json({ message: 'کاربر یافت نشد یا قبلاً تأیید شده' });
        }

        // ارسال OTP جدید
        const otp = generateOTP(email);
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'کد تأیید ثبت‌نام (ارسال دوباره)',
            text: `کد تأیید جدید شما: ${otp}. این کد 5 دقیقه معتبر است.`
        };
        await transporter.sendMail(mailOptions);
        console.log(`OTP جدید ارسال شد به ${email}`);

        res.json({ success: true, message: 'OTP جدید ارسال شد' });
    } catch (error) {
        console.error('خطا در /api/resend-otp:', error);
        res.status(500).json({ message: 'خطا در ارسال دوباره OTP', error: error.message });
    }
});

// API برای ورود (تشخیص نقش بر اساس شناسه)
app.post('/api/login', async (req, res) => {
    console.log('درخواست ورود دریافت شد');
    try {
        const { identifier, password } = req.body;
        console.log(`داده‌ها: identifier=${identifier}`);

        await connectMongoDB();
        const usersCollection = db.collection('users');
        let user = await usersCollection.findOne({ uniqueID: identifier });
        if (!user) {
            console.warn(`کاربر با شناسه ${identifier} یافت نشد. تلاش با کد ملی/موبایل...`);
            user = await usersCollection.findOne({ $or: [{ nationalCode: identifier }, { mobile: identifier }] });
        }

        if (!user) {
            console.error(`ورود ناموفق: کاربری با شناسه ${identifier} در سیستم وجود ندارد.`);
            return res.status(400).json({ message: 'کاربر یافت نشد' });
        }
        console.info(`کاربر ${user.email} پیدا شد. در حال بررسی رمز عبور...`);

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            console.error(`ورود ناموفق: رمز عبور برای کاربر ${user.email} اشتباه است.`);
            return res.status(400).json({ message: 'رمز عبور اشتباه' });
        }
        console.info(`رمز عبور برای ${user.email} صحیح است.`);

        if (user.role === 'shop_owner') {
            // 2FA برای مغازه‌دار
            const otp = generateOTP(user.email);
            const mail2FA = {
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: 'کد دو مرحله‌ای ورود',
                text: `کد ورود شما: ${otp}`
            };
            await transporter.sendMail(mail2FA);
            console.log(`OTP 2FA ارسال شد به ${user.email}`);
            const tempToken = Math.random().toString(36).substring(2); // توکن موقت
            await usersCollection.updateOne({ _id: user._id }, { $set: { tempToken } });
            res.json({ success: true, role: user.role, tempToken });
        } else {
            // برای مشتری، سشن توکن
            const sessionToken = Math.random().toString(36).substring(2);
            res.json({ success: true, role: user.role, sessionToken });
        }
    } catch (error) {
        console.error('خطا در /api/login:', error);
        res.status(500).json({ message: 'خطا در ورود', error: error.message });
    }
});

// API جدید برای verify-2fa
app.post('/api/verify-2fa', async (req, res) => {
    console.log('درخواست تأیید 2FA دریافت شد');
    try {
        const { tempToken, otp } = req.body;
        await connectMongoDB();
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ tempToken });
        if (!user) {
            console.log('توکن موقت نامعتبر');
            return res.status(400).json({ message: 'توکن نامعتبر' });
        }

        const stored = otps.get(user.email);
        if (stored && stored.otp === otp && Date.now() < stored.expires) {
            otps.delete(user.email);
            await usersCollection.updateOne({ _id: user._id }, { $unset: { tempToken: "" } });
            console.log('2FA تأیید شد');
            res.json({ success: true, message: 'ورود موفق' });
        } else {
            console.log('OTP 2FA نامعتبر');
            res.status(400).json({ message: 'کد نامعتبر' });
        }
    } catch (error) {
        console.error('خطا در /api/verify-2fa:', error);
        res.status(500).json({ message: 'خطا در تأیید 2FA', error: error.message });
    }
});

// API برای درخواست فراموشی رمز (بدون نقش)
app.post('/api/forgot-password', async (req, res) => {
    console.log('درخواست فراموشی رمز دریافت شد');
    try {
        const { identifier, email } = req.body;
        console.log(`داده‌ها: identifier=${identifier}, email=${email}`);

        await connectMongoDB();
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ email, $or: [{ nationalCode: identifier }, { mobile: identifier }] });
        if (!user) {
            console.log('کاربر یافت نشد');
            return res.status(400).json({ message: 'کاربر یافت نشد' });
        }

        // ارسال OTP برای بازنشانی
        const otp = generateOTP(email);
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'کد بازنشانی رمز عبور',
            text: `کد بازنشانی شما: ${otp}. این کد 5 دقیقه معتبر است.`
        };
        await transporter.sendMail(mailOptions);
        console.log(`OTP بازنشانی ارسال شد به ${email}`);

        res.json({ success: true, message: 'OTP بازنشانی ارسال شد' });
    } catch (error) {
        console.error('خطا در /api/forgot-password:', error);
        res.status(500).json({ message: 'خطا در درخواست بازنشانی', error: error.message });
    }
});

// API برای verify-reset-otp
app.post('/api/verify-reset-otp', async (req, res) => {
    console.log('درخواست تأیید OTP بازنشانی دریافت شد');
    try {
        const { email, otp } = req.body;
        const stored = otps.get(email);
        if (stored && stored.otp === otp && Date.now() < stored.expires) {
            otps.delete(email);
            // ایجاد توکن موقت برای reset
            const resetToken = Math.random().toString(36).substring(2); // ساده برای مثال
            await connectMongoDB();
            const usersCollection = db.collection('users');
            await usersCollection.updateOne({ email }, { $set: { resetToken } });
            console.log('توکن reset ذخیره شد');
            res.json({ success: true, resetToken });
        } else {
            res.status(400).json({ message: 'کد نامعتبر یا منقضی شده' });
        }
    } catch (error) {
        console.error('خطا در /api/verify-reset-otp:', error);
        res.status(500).json({ message: 'خطا در تأیید OTP', error: error.message });
    }
});

// API برای resend-reset-otp
app.post('/api/resend-reset-otp', async (req, res) => {
    console.log('درخواست ارسال دوباره OTP بازنشانی دریافت شد');
    try {
        const { email } = req.body;
        console.log(`داده‌ها: email=${email}`);

        if (!email) {
            console.log('ایمیل مفقود');
            return res.status(400).json({ message: 'ایمیل پر نشده' });
        }

        await connectMongoDB();
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ email });
        if (!user) {
            console.log('کاربر یافت نشد');
            return res.status(400).json({ message: 'کاربر یافت نشد' });
        }

        // ارسال OTP جدید
        const otp = generateOTP(email);
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'کد بازنشانی رمز عبور (ارسال دوباره)',
            text: `کد بازنشانی جدید شما: ${otp}. این کد 5 دقیقه معتبر است.`
        };
        await transporter.sendMail(mailOptions);
        console.log(`OTP جدید ارسال شد به ${email}`);

        res.json({ success: true, message: 'OTP جدید ارسال شد' });
    } catch (error) {
        console.error('خطا در /api/resend-reset-otp:', error);
        res.status(500).json({ message: 'خطا در ارسال دوباره OTP', error: error.message });
    }
});

// API برای reset-password
app.post('/api/reset-password', async (req, res) => {
    console.log('درخواست تغییر رمز دریافت شد');
    try {
        const { resetToken, newPassword } = req.body;
        console.log(`داده‌ها: resetToken=${resetToken}`);

        if (!resetToken || !newPassword) {
            console.log('داده‌های الزامی مفقود');
            return res.status(400).json({ message: 'توکن یا رمز جدید پر نشده' });
        }

        await connectMongoDB();
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ resetToken });
        if (!user) {
            console.log('توکن نامعتبر');
            return res.status(400).json({ message: 'توکن نامعتبر' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await usersCollection.updateOne({ resetToken }, { $set: { password: hashedPassword, resetToken: null } });
        console.log('رمز بروز شد');

        res.json({ success: true, message: 'رمز تغییر یافت' });
    } catch (error) {
        console.error('خطا در /api/reset-password:', error);
        res.status(500).json({ message: 'خطا در تغییر رمز', error: error.message });
    }
});

// راه‌اندازی سرور
app.listen(port, async () => {
    await connectMongoDB();
    console.log(`Server running on port ${port}`);
});