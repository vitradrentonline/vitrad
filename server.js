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

// تنظیمات لیارا Object Storage
const s3 = new AWS.S3({
    accessKeyId: process.env.LIARA_ACCESS_KEY || 'q93lk9pelicu3rgn',
    secretAccessKey: process.env.LIARA_SECRET_KEY || '8f609904-d779-428e-9108-1abb57171f3b',
    endpoint: process.env.LIARA_ENDPOINT || 'https://storage.c2.liara.space',
    s3ForcePathStyle: true
});
const bucketName = process.env.LIARA_BUCKET_NAME || 'rent-online';

// تنظیمات Nodemailer برای Gmail
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

// اتصال به MongoDB
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
                console.error('MongoDB connection failed after max retries:', error);
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

// تنظیم برای آپلود فایل‌ها
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// تابع آپلود فایل به Liara
async function uploadToS3(fileBuffer, fileName) {
    const params = {
        Bucket: bucketName,
        Key: `${Date.now()}-${fileName}`,
        Body: fileBuffer,
        ContentType: 'image/jpeg',
        ACL: 'public-read'
    };
    try {
        const data = await s3.upload(params).promise();
        console.log('File uploaded to Liara:', data.Location);
        return data.Location;
    } catch (error) {
        console.error('Error uploading to Liara:', error.message);
        throw new Error(`Failed to upload ${fileName} to S3: ${error.message}`);
    }
}

// تابع تولید کد تأیید 6 رقمی
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// تابع برای تولید shopId 8 رقمی
function generateShopId() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Middleware برای چک کردن اتصال MongoDB
const checkMongoConnection = async (req, res, next) => {
    try {
        await connectMongoDB();
        console.log('MongoDB connection verified for request:', req.path);
        next();
    } catch (error) {
        console.error('MongoDB not connected for request:', req.path, error.message);
        res.status(500).json({ message: 'اتصال به دیتابیس برقرار نیست', error: error.message });
    }
};

// Middleware برای چک کردن نقش ادمین
const checkAdmin = async (req, res, next) => {
    const adminId = req.body.adminId || req.body.userId;
    console.log('چک کردن نقش ادمین برای:', adminId);
    try {
        if (!adminId) {
            console.log('adminId غایب');
            return res.status(400).json({ message: 'شناسه ادمین لازم است' });
        }
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ mobile: adminId, role: 'admin' });
        if (!user) {
            console.log('دسترسی غیرمجاز: کاربر ادمین نیست', adminId);
            return res.status(403).json({ message: 'فقط ادمین‌ها مجاز هستند!' });
        }
        console.log('ادمین تأیید شد:', { mobile: adminId, role: user.role });
        req.adminId = user._id.toString();
        next();
    } catch (error) {
        console.error('خطا در چک کردن ادمین:', error.message);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
};

// روت برای ارسال کد تأیید به ایمیل
app.post('/api/send-code', checkMongoConnection, async (req, res) => {
    const { email } = req.body;
    console.log('درخواست /api/send-code:', { email });
    try {
        if (!email) {
            console.log('ایمیل غایب');
            return res.status(400).json({ message: 'ایمیل لازم است' });
        }
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ email });
        if (!user) {
            console.log('کاربر یافت نشد:', email);
            return res.status(404).json({ message: 'ایمیل ثبت نشده است!' });
        }
        const code = generateVerificationCode();
        await usersCollection.updateOne({ email }, { $set: { verificationCode: code } });
        const mailOptions = {
            from: process.env.EMAIL_USER || 'sedghinahada@gmail.com',
            to: email,
            subject: 'کد تأیید',
            text: `کد تأیید شما: ${code}`
        };
        await transporter.sendMail(mailOptions);
        console.log('ایمیل ارسال شد:', { email, code });
        res.json({ message: 'کد تأیید به ایمیل شما ارسال شد.' });
    } catch (error) {
        console.error('خطا در /api/send-code:', error.message);
        res.status(500).json({ message: 'خطا در ارسال ایمیل', error: error.message });
    }
});

// روت تست برای چک کردن سرور
app.get('/api/health', async (req, res) => {
    try {
        await connectMongoDB();
        console.log('Health check: MongoDB connected');
        res.json({ status: 'Server is running', mongoConnected: !!db });
    } catch (error) {
        console.error('Health check failed:', error.message);
        res.status(500).json({ status: 'Server is running, but MongoDB connection failed', error: error.message });
    }
});

// روت برای ثبت‌نام مغازه‌دار
app.post('/api/auth', checkMongoConnection, upload.fields([
    { name: 'national-card' }, 
    { name: 'selfie' }, 
    { name: 'business-license' },
    { name: 'health-license', maxCount: 1 }
]), async (req, res) => {
    try {
        const { 
            'full-name': fullName, 
            'national-id': nationalId, 
            email, 
            mobile, 
            password, 
            'confirm-password': confirmPassword, 
            'shop-name': shopName, 
            province, 
            city,
            region,
            'referral-code': referralCode,
            'store-type': storeType,
            'other-store-name': otherStoreName,
            'other-store-description': otherStoreDescription,
            'activity-type': activityType,
            'business-type': businessType
        } = req.body;

        console.log('درخواست /api/auth:', { 
            fullName, nationalId, email, mobile, province, city, region, referralCode, storeType, otherStoreName, otherStoreDescription, activityType, businessType,
            hasNationalCard: !!req.files['national-card'],
            hasSelfie: !!req.files['selfie'],
            hasBusinessLicense: !!req.files['business-license'],
            hasHealthLicense: !!req.files['health-license']
        });

        // اعتبارسنجی
        if (!fullName || !nationalId || !email || !mobile || !password || !confirmPassword || !province || !city || !storeType || !activityType) {
            console.log('داده‌های ناقص:', { fullName, nationalId, email, mobile, password, confirmPassword, province, city, storeType, activityType });
            return res.status(400).json({ message: 'همه فیلدهای الزامی باید پر شوند' });
        }
        if (password !== confirmPassword) {
            console.log('رمز عبور و تأیید رمز مطابقت ندارند');
            return res.status(400).json({ message: 'رمز عبور و تأیید رمز عبور مطابقت ندارند' });
        }
        if (province === 'تهران' && city === 'تهران' && !region) {
            return res.status(400).json({ message: 'منطقه برای تهران اجباری است!' });
        }
        if (!req.files['national-card'] || !req.files['selfie'] || !req.files['business-license']) {
            console.log('فایل‌های مورد نیاز آپلود نشده‌اند:', {
                nationalCard: !!req.files['national-card'],
                selfie: !!req.files['selfie'],
                businessLicense: !!req.files['business-license']
            });
            return res.status(400).json({ message: 'فایل‌های کارت ملی، سلفی و جواز کسب الزامی هستند' });
        }

        const usersCollection = db.collection('users');
        if (await usersCollection.findOne({ nationalId })) {
            console.log('کد ملی تکراری:', nationalId);
            return res.status(400).json({ message: 'این کد ملی قبلاً ثبت شده است!' });
        }
        if (await usersCollection.findOne({ email })) {
            console.log('ایمیل تکراری:', email);
            return res.status(400).json({ message: 'این ایمیل قبلاً ثبت شده است!' });
        }
        if (await usersCollection.findOne({ mobile })) {
            console.log('موبایل تکراری:', mobile);
            return res.status(400).json({ message: 'این موبایل قبلاً ثبت شده است!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        let nationalCardUrl = '';
        let selfieUrl = '';
        let businessLicenseUrl = '';
        let healthLicenseUrl = '';

        // آپلود فایل‌ها به S3 با لاگ
        try {
            console.time('upload_national_card');
            nationalCardUrl = await uploadToS3(req.files['national-card'][0].buffer, `national-${nationalId}.jpg`);
            console.timeEnd('upload_national_card');

            console.time('upload_selfie');
            selfieUrl = await uploadToS3(req.files['selfie'][0].buffer, `selfie-${nationalId}.jpg`);
            console.timeEnd('upload_selfie');

            console.time('upload_business_license');
            businessLicenseUrl = await uploadToS3(req.files['business-license'][0].buffer, `license-${nationalId}.jpg`);
            console.timeEnd('upload_business_license');

            if (req.files['health-license'] && req.files['health-license'][0]) {
                console.time('upload_health_license');
                healthLicenseUrl = await uploadToS3(req.files['health-license'][0].buffer, `health-${nationalId}.jpg`);
                console.timeEnd('upload_health_license');
            }
        } catch (uploadError) {
            console.error('خطا در آپلود به S3:', uploadError.message, uploadError.stack);
            return res.status(500).json({ message: 'خطا در آپلود فایل‌ها به S3', error: uploadError.message });
        }

        const shopId = generateShopId();
        const data = { 
            shopId,
            shopName: shopName || `${fullName} مارکت`,
            fullName, 
            nationalId, 
            email, 
            mobile, 
            password: hashedPassword, 
            nationalCardUrl, 
            selfieUrl, 
            businessLicenseUrl, 
            healthLicenseUrl: healthLicenseUrl || '',
            verified: false,
            approved: false, 
            bannerUrl: '', 
            verificationCode: '', 
            address: '', 
            postalCode: '', 
            role: 'shop_owner',
            whatsapp: '',
            telegram: '',
            instagram: '',
            eitaa: '',
            rubika: '',
            bale: '',
            website: '',
            province,
            city,
            region: region || '',
            referralCode: referralCode || '',
            storeType,
            otherStoreName: otherStoreName || '',
            otherStoreDescription: otherStoreDescription || '',
            activityType,
            businessType: businessType || '',
            location: { lat: '', lng: '' }
        };

        const result = await usersCollection.insertOne(data);
        const code = generateVerificationCode();
        await usersCollection.updateOne({ _id: result.insertedId }, { $set: { verificationCode: code } });

        const mailOptions = {
            from: process.env.EMAIL_USER || 'sedghinahada@gmail.com',
            to: email,
            subject: 'کد تأیید ثبت‌نام مغازه‌دار',
            text: `کد تأیید شما: ${code}\nشناسه مغازه شما: ${shopId}`
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log('ایمیل ارسال شد:', { email, code, shopId });
        } catch (emailError) {
            console.error('خطا در ارسال ایمیل:', emailError.message, emailError.stack);
            return res.status(500).json({ message: 'خطا در ارسال ایمیل تأیید', error: emailError.message });
        }

        res.json({ message: 'ثبت‌نام با موفقیت انجام شد. لطفاً کد تأیید را وارد کنید.', userId: shopId });
    } catch (error) {
        console.error('خطا در /api/auth:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای ثبت‌نام مشتری
app.post('/api/register-customer', checkMongoConnection, upload.none(), async (req, res) => {
    try {
        const { fullName, email, mobile, password, 'confirm-password': confirmPassword, province, city } = req.body;
        console.log('درخواست ثبت مشتری:', { fullName, email, mobile, province, city });

        if (province === 'تهران' && city === 'تهران' && !region) {
            return res.status(400).json({ message: 'منطقه برای تهران اجباری است!' });
        }

        if (!fullName || !email || !mobile || !password || !confirmPassword || !province || !city) {
            console.log('داده‌های ناقص:', { fullName, email, mobile, password, confirmPassword, province, city });
            return res.status(400).json({ message: 'همه فیلدها باید پر شوند' });
        }
        if (password !== confirmPassword) {
            console.log('رمزها مطابقت ندارند');
            return res.status(400).json({ message: 'رمز عبور و تأیید رمز مطابقت ندارند' });
        }

        const usersCollection = db.collection('users');
        if (await usersCollection.findOne({ email })) {
            console.log('ایمیل تکراری:', email);
            return res.status(400).json({ message: 'این ایمیل قبلاً ثبت شده است!' });
        }
        if (await usersCollection.findOne({ mobile })) {
            console.log('موبایل تکراری:', mobile);
            return res.status(400).json({ message: 'این موبایل قبلاً ثبت شده است!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const code = generateVerificationCode();
        const data = { 
            fullName, 
            email, 
            mobile, 
            password: hashedPassword, 
            role: 'customer', 
            verified: false,
            approved: true, 
            verificationCode: code,
            province,
            city,
            region: region || '',  // فیلد جدید
            referralCode: referralCode || ''  // فیلد جدید
        };

        const result = await usersCollection.insertOne(data);
        const mailOptions = {
            from: process.env.EMAIL_USER || 'sedghinahada@gmail.com',
            to: email,
            subject: 'کد تأیید ثبت‌نام مشتری',
            text: `کد تأیید شما: ${code}`
        };

        await transporter.sendMail(mailOptions);
        console.log('ایمیل ارسال شد:', { email, code });
        res.json({ message: 'ثبت‌نام مشتری موفق. کد تأیید به ایمیل شما ارسال شد.', userId: mobile });
    } catch (error) {
        console.error('خطا در ثبت مشتری:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای ثبت‌نام ادمین (برای تست، بعداً ایمن کنید)
app.post('/api/register-admin', checkMongoConnection, upload.none(), async (req, res) => {
    const { fullName, email, mobile, password, 'confirm-password': confirmPassword } = req.body;
    console.log('درخواست ثبت ادمین:', { fullName, email, mobile });
    try {
        if (!fullName || !email || !mobile || !password || !confirmPassword) {
            console.log('داده‌های ناقص:', { fullName, email, mobile, password, confirmPassword });
            return res.status(400).json({ message: 'همه فیلدها باید پر شوند' });
        }
        if (password !== confirmPassword) {
            console.log('رمزها مطابقت ندارند');
            return res.status(400).json({ message: 'رمز عبور و تأیید رمز مطابقت ندارند' });
        }
        const usersCollection = db.collection('users');
        if (await usersCollection.findOne({ email })) {
            console.log('ایمیل تکراری:', email);
            return res.status(400).json({ message: 'این ایمیل قبلاً ثبت شده است!' });
        }
        if (await usersCollection.findOne({ mobile })) {
            console.log('موبایل تکراری:', mobile);
            return res.status(400).json({ message: 'این موبایل قبلاً ثبت شده است!' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const code = generateVerificationCode();
        const data = { 
            fullName, 
            email, 
            mobile, 
            password: hashedPassword, 
            role: 'admin', 
            verified: false,
            approved: true, 
            verificationCode: code 
        };
        const result = await usersCollection.insertOne(data);
        const mailOptions = {
            from: process.env.EMAIL_USER || 'sedghinahada@gmail.com',
            to: email,
            subject: 'کد تأیید ثبت‌نام ادمین',
            text: `کد تأیید شما: ${code}`
        };
        await transporter.sendMail(mailOptions);
        console.log('ایمیل ارسال شد:', { email, code });
        res.json({ message: 'ثبت‌نام ادمین موفق. کد تأیید به ایمیل شما ارسال شد.', userId: mobile });
    } catch (error) {
        console.error('خطا در ثبت ادمین:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای تأیید کد احراز هویت
app.post('/api/verify-auth', checkMongoConnection, upload.none(), async (req, res) => {
    const { code, userId, role } = req.body;
    console.log('درخواست /api/verify-auth:', { code, userId, role });
    try {
        if (!code || !userId || !role) {
            console.log('داده‌های ناقص:', { code, userId, role });
            return res.status(400).json({ message: 'کد تأیید، userId و نقش لازم است' });
        }
        const usersCollection = db.collection('users');
        let user;
        if (role === 'shop_owner') {
            user = await usersCollection.findOne({ shopId: userId, role });
            if (!user) {
                user = await usersCollection.findOne({ nationalId: userId, role });
            }
        } else {
            user = await usersCollection.findOne({ mobile: userId, role });
        }
        if (!user) {
            console.log('کاربر یافت نشد:', userId, role);
            return res.status(404).json({ message: 'کاربر یافت نشد!' });
        }
        if (code === user.verificationCode) {
            await usersCollection.updateOne(
                { _id: user._id },
                { $set: { verified: true, verificationCode: '' } }
            );
            console.log('تأیید موفق، کاربر:', userId, role);
            res.json({ message: 'احراز هویت با موفقیت انجام شد!', userId: role === 'shop_owner' ? user.shopId : user.mobile, role });
        } else {
            console.log('کد تأیید اشتباه:', code);
            return res.status(400).json({ message: 'کد تأیید اشتباه است!' });
        }
    } catch (error) {
        console.error('خطا در /api/verify-auth:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای ورود اولیه (چک کردن کد ملی/موبایل و رمز)
app.post('/api/pre-login', checkMongoConnection, upload.none(), async (req, res) => {
    const { userId, password, role } = req.body;
    console.log('درخواست /api/pre-login:', { userId, role });
    try {
        if (!userId || !password || !role) {
            console.log('داده‌های ناقص:', { userId, password, role });
            return res.status(400).json({ message: 'شناسه، رمز عبور و نقش لازم است' });
        }
        const usersCollection = db.collection('users');
        let user;
        if (role === 'shop_owner') {
            user = await usersCollection.findOne({ shopId: userId, role });
            if (!user) {
                user = await usersCollection.findOne({ nationalId: userId, role });
            }
        } else {
            user = await usersCollection.findOne({ mobile: userId, role });
        }
        if (!user) {
            console.log('کاربر یافت نشد:', userId, role);
            return res.status(404).json({ message: 'شناسه یا نقش اشتباه است!' });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            console.log('رمز عبور اشتباه:', userId);
            return res.status(400).json({ message: 'رمز عبور اشتباه است!' });
        }
        const code = generateVerificationCode();
        await usersCollection.updateOne(
            { _id: user._id },
            { $set: { verificationCode: code } }
        );
        const mailOptions = {
            from: process.env.EMAIL_USER || 'sedghinahada@gmail.com',
            to: user.email,
            subject: 'کد تأیید ورود',
            text: `کد تأیید شما: ${code}`
        };
        await transporter.sendMail(mailOptions);
        console.log('ایمیل ورود ارسال شد:', { email: user.email, code });
        res.json({ message: 'لطفاً کد تأیید را وارد کنید.', userId: role === 'shop_owner' ? user.shopId : user.mobile, email: user.email, role });
    } catch (error) {
        console.error('خطا در /api/pre-login:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای تأیید کد ورود
app.post('/api/login', checkMongoConnection, upload.none(), async (req, res) => {
    const { email, code, userId, role } = req.body;
    console.log('درخواست /api/login:', { email, code, userId, role });
    try {
        if (!email || !code || !userId || !role) {
            console.log('داده‌های ناقص:', { email, code, userId, role });
            return res.status(400).json({ message: 'ایمیل، کد تأیید، userId و نقش لازم است' });
        }
        const usersCollection = db.collection('users');
        let user;
        if (role === 'shop_owner') {
            user = await usersCollection.findOne({ shopId: userId, email, role });
            if (!user) {
                user = await usersCollection.findOne({ nationalId: userId, email, role });
            }
        } else {
            user = await usersCollection.findOne({ mobile: userId, email, role });
        }
        if (!user) {
            console.log('کاربر یافت نشد:', email, userId, role);
            return res.status(404).json({ message: 'ایمیل یا شناسه ثبت نشده است!' });
        }
        if (code === user.verificationCode) {
            await usersCollection.updateOne(
                { _id: user._id },
                { $set: { verified: true, verificationCode: '' } }
            );
            console.log('ورود موفق، کاربر:', userId, role);
            res.json({ message: 'ورود موفق!', userId: role === 'shop_owner' ? user.shopId : user.mobile, role });
        } else {
            console.log('کد تأیید اشتباه:', code);
            return res.status(400).json({ message: 'کد تأیید اشتباه است!' });
        }
    } catch (error) {
        console.error('خطا در /api/login:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای بازیابی رمز
app.post('/api/reset-password', checkMongoConnection, upload.none(), async (req, res) => {
    const { email, code, 'new-password': newPassword, 'confirm-new-password': confirmNewPassword, userId, role } = req.body;
    console.log('درخواست /api/reset-password:', { email, userId, role, code });
    try {
        if (!email || !code || !newPassword || !confirmNewPassword || !userId || !role) {
            console.log('داده‌های ناقص:', { email, code, newPassword, userId, role });
            return res.status(400).json({ message: 'ایمیل، کد تأیید، رمز جدید، userId و نقش لازم است' });
        }
        if (newPassword !== confirmNewPassword) {
            console.log('رمز جدید و تأیید رمز مطابقت ندارند');
            return res.status(400).json({ message: 'رمز جدید و تأیید رمز مطابقت ندارند' });
        }
        const usersCollection = db.collection('users');
        let userQuery;
        if (role === 'shop_owner') {
            userQuery = { shopId: userId, email, role };
            const userByNationalId = await usersCollection.findOne({ nationalId: userId, email, role });
            if (userByNationalId) userQuery = { _id: userByNationalId._id };
        } else {
            userQuery = { mobile: userId, email, role };
        }
        console.log('جستجوی کاربر با query:', userQuery);
        const user = await usersCollection.findOne(userQuery);
        if (!user) {
            console.log('کاربر یافت نشد با query:', userQuery);
            return res.status(404).json({ message: 'ایمیل یا شناسه ثبت نشده است!' });
        }
        console.log('کاربر یافت شد:', { id: user._id, email: user.email, [role === 'shop_owner' ? 'nationalId' : 'mobile']: user[role === 'shop_owner' ? 'nationalId' : 'mobile'], role: user.role });
        if (code === user.verificationCode) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await usersCollection.updateOne(
                userQuery,
                { $set: { password: hashedPassword, verificationCode: '' } }
            );
            console.log('رمز عبور بازیابی شد:', userId, role);
            res.json({ message: 'رمز عبور با موفقیت بازیابی شد!' });
        } else {
            console.log('کد تأیید اشتباه:', code, 'انتظار:', user.verificationCode);
            return res.status(400).json({ message: 'کد تأیید اشتباه است!' });
        }
    } catch (error) {
        console.error('خطا در /api/reset-password:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای گرفتن اطلاعات پروفایل
app.get('/api/user-profile', checkMongoConnection, async (req, res) => {
    const userId = req.query.userId;
    console.log('درخواست /api/user-profile با userId:', userId);
    try {
        if (!userId) {
            console.log('userId غایب');
            return res.status(400).json({ message: 'userId لازم است' });
        }
        const usersCollection = db.collection('users');
        let user;
        user = await usersCollection.findOne({ shopId: userId, role: 'shop_owner' });
        if (!user) {
            user = await usersCollection.findOne({ mobile: userId, role: { $in: ['customer', 'admin'] } });
        }
        if (user) {
            console.log('کاربر یافت شد:', { shopId: user.shopId, mobile: user.mobile, role: user.role, approved: user.approved });
            res.json({
                shopName: user.shopName || 'نام فروشگاه ثبت نشده',
                fullName: user.fullName || 'نام کامل ثبت نشده',
                nationalId: user.nationalId || 'کد ملی ثبت نشده',
                email: user.email || 'ایمیل ثبت نشده',
                mobile: user.mobile || 'موبایل ثبت نشده',
                address: user.address || 'آدرس ثبت نشده',
                postalCode: user.postalCode || 'کد پستی ثبت نشده',
                whatsapp: user.whatsapp || '',
                telegram: user.telegram || '',
                instagram: user.instagram || '',
                eitaa: user.eitaa || '',
                rubika: user.rubika || '',
                bale: user.bale || '',
                website: user.website || '',
                bannerUrl: user.bannerUrl || '',
                province: user.province || 'نامشخص',
                city: user.city || 'نامشخص',
                region: user.region || '',  // فیلد جدید
                location: user.location || { lat: '', lng: '' },
                approved: user.approved || false
            });
        } else {
            console.log('کاربر یافت نشد برای userId:', userId);
            return res.status(404).json({ message: 'کاربر یافت نشد!' });
        }
    } catch (error) {
        console.error('خطا در /api/user-profile:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای گرفتن لیست کاربران (برای جستجوی مغازه‌ها)
app.get('/api/users', checkMongoConnection, async (req, res) => {
    console.log('درخواست /api/users');
    try {
        const usersCollection = db.collection('users');
        const shopUsers = await usersCollection
            .find({ role: 'shop_owner', approved: true })
            .project({ shopId: 1, _id: 0 })
            .toArray();
        
        const userIds = shopUsers.map(u => u.shopId);
        console.log('لیست مغازه‌های تایید شده:', userIds);
        res.json(userIds);
    } catch (error) {
        console.error('خطا در /api/users:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای گرفتن کاربران در انتظار تأیید
app.post('/api/pending-users', checkMongoConnection, checkAdmin, async (req, res) => {
    console.log('درخواست /api/pending-users');
    try {
        const usersCollection = db.collection('users');
        const pendingUsers = await usersCollection
            .find({ role: 'shop_owner', approved: false })
            .toArray();
        console.log('کاربران در انتظار تأیید:', pendingUsers);
        res.json(pendingUsers.map(user => ({
            shopId: user.shopId,
            nationalId: user.nationalId,
            fullName: user.fullName,
            email: user.email,
            mobile: user.mobile,
            nationalCardUrl: user.nationalCardUrl || '',
            selfieUrl: user.selfieUrl || '',
            businessLicenseUrl: user.businessLicenseUrl || ''
        })));
    } catch (error) {
        console.error('خطا در /api/pending-users:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای تأیید کاربر توسط ادمین
app.post('/api/approve-user', checkMongoConnection, checkAdmin, async (req, res) => {
    const { userId, adminId } = req.body;
    console.log('درخواست /api/approve-user:', { userId, adminId });
    try {
        if (!userId || !adminId) {
            console.log('userId یا adminId غایب');
            return res.status(400).json({ message: 'userId و adminId لازم است' });
        }
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ shopId: userId, role: 'shop_owner' });
        if (!user) {
            console.log('کاربر یافت نشد:', userId);
            return res.status(404).json({ message: 'کاربر یافت نشد!' });
        }
        await usersCollection.updateOne(
            { shopId: userId },
            { $set: { approved: true } }
        );
        console.log('کاربر تأیید شد:', userId);
        res.json({ message: 'کاربر با موفقیت تأیید شد!' });
    } catch (error) {
        console.error('خطا در /api/approve-user:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای آپلود بنر
app.post('/api/upload-banner', checkMongoConnection, upload.fields([{ name: 'banner-image' }]), async (req, res) => {
    const { userId } = req.body;
    let bannerUrl = '';
    console.log('درخواست /api/upload-banner:', { userId });
    try {
        if (!userId) {
            console.log('userId غایب');
            return res.status(400).json({ message: 'userId لازم است' });
        }
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ shopId: userId, role: 'shop_owner', approved: true });
        if (!user) {
            console.log('کاربر غیرمجاز یا تأییدنشده:', userId);
            return res.status(403).json({ message: 'لطفاً ابتدا توسط ادمین تأیید شوید!' });
        }
        if (req.files['banner-image'] && req.files['banner-image'][0]) {
            bannerUrl = await uploadToS3(req.files['banner-image'][0].buffer, `banner-${userId}.jpg`);
        }
        await usersCollection.updateOne({ shopId: userId }, { $set: { bannerUrl } });
        console.log('بنر آپلود شد:', bannerUrl);
        res.json({ message: 'بنر با موفقیت آپلود شد!' });
    } catch (error) {
        console.error('خطا در /api/upload-banner:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای اضافه کردن محصول
app.post('/api/add-product', checkMongoConnection, upload.fields([{ name: 'product-image' }]), async (req, res) => {
    const { 'product-name': name, 'product-description': description, userId, 'product-instagram-link': instagramLink } = req.body;
    let imageUrl = '';
    console.log('درخواست /api/add-product:', { name, description, userId, instagramLink });
    try {
        if (!userId || !name || !description) {
            console.log('داده‌های ناقص:', { name, description, userId });
            return res.status(400).json({ message: 'userId، نام و توضیحات محصول لازم است' });
        }
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ shopId: userId, role: 'shop_owner', approved: true });
        if (!user) {
            console.log('کاربر غیرمجاز یا تأییدنشده:', userId);
            return res.status(403).json({ message: 'لطفاً ابتدا توسط ادمین تأیید شوید!' });
        }
        const productsCollection = db.collection('products');

        // چک محدودیت 30 عکس
        const productCountWithImage = await productsCollection.countDocuments({ userId, imageUrl: { $ne: '' } });
        const hasImage = req.files['product-image'] && req.files['product-image'][0];
        if (hasImage && productCountWithImage >= 30) {
            console.log('محدودیت 30 عکس برای کاربر:', userId);
            // ذخیره محصول بدون عکس
            const product = { userId, name, description, imageUrl: '', approved: false, instagramLink: instagramLink || '', order: 0 };
            await productsCollection.insertOne(product);
            return res.json({ message: 'شما به محدودیت 30 عکس محصول رسیده‌اید. محصول بدون عکس اضافه شد و در انتظار تأیید ادمین است!' });
        }

        if (hasImage) {
            imageUrl = await uploadToS3(req.files['product-image'][0].buffer, `product-${name}-${userId}.jpg`);
        }
        const existingProduct = await productsCollection.findOne({ userId, name });
        if (existingProduct) {
            console.log('محصول تکراری:', name);
            return res.status(400).json({ message: 'این محصول قبلاً برای شما ثبت شده است!' });
        }
        const product = { userId, name, description, imageUrl, approved: false, instagramLink: instagramLink || '', order: 0 };
        await productsCollection.insertOne(product);
        console.log('محصول اضافه شد:', product);
        res.json({ message: 'محصول با موفقیت اضافه شد و در انتظار تأیید ادمین است!' });
    } catch (error) {
        console.error('خطا در /api/add-product:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای ویرایش محصول
app.put('/api/edit-product', checkMongoConnection, upload.fields([{ name: 'product-image' }]), async (req, res) => {
    const { 'product-name': name, 'product-description': description, userId, productId, 'product-instagram-link': instagramLink } = req.body;
    let imageUrl = '';
    console.log('درخواست /api/edit-product:', { name, description, userId, productId, instagramLink });
    try {
        if (!userId || !productId || !name || !description) {
            console.log('داده‌های ناقص:', { name, description, userId, productId });
            return res.status(400).json({ message: 'userId، productId، نام و توضیحات محصول لازم است' });
        }
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ shopId: userId, role: 'shop_owner', approved: true });
        if (!user) {
            console.log('کاربر غیرمجاز یا تأییدنشده:', userId);
            return res.status(403).json({ message: 'لطفاً ابتدا توسط ادمین تأیید شوید!' });
        }
        const productsCollection = db.collection('products');
        let productObjectId;
        try {
            productObjectId = new ObjectId(productId);
        } catch (error) {
            console.error('خطا در تبدیل productId به ObjectId:', error.message);
            return res.status(400).json({ message: 'شناسه محصول نامعتبر است', error: error.message });
        }
        const existingProduct = await productsCollection.findOne({ _id: productObjectId, userId });
        if (!existingProduct) {
            console.log('محصول یافت نشد:', productId);
            return res.status(404).json({ message: 'محصول یافت نشد!' });
        }
        if (req.files['product-image'] && req.files['product-image'][0]) {
            imageUrl = await uploadToS3(req.files['product-image'][0].buffer, `product-${name}-${userId}.jpg`);
        } else {
            imageUrl = existingProduct.imageUrl;
        }
        await productsCollection.updateOne(
            { _id: productObjectId },
            { $set: { name, description, imageUrl, approved: false, instagramLink: instagramLink || '' } }
        );
        console.log('محصول ویرایش شد:', { productId, name, description, imageUrl, instagramLink });
        res.json({ message: 'محصول با موفقیت ویرایش شد و در انتظار تأیید ادمین است!' });
    } catch (error) {
        console.error('خطا در /api/edit-product:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای حذف محصول
app.delete('/api/delete-product', checkMongoConnection, async (req, res) => {
    const { productId, userId } = req.body;
    console.log('درخواست /api/delete-product:', { productId, userId });
    try {
        if (!userId || !productId) {
            console.log('داده‌های ناقص:', { productId, userId });
            return res.status(400).json({ message: 'userId و productId لازم است' });
        }
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ shopId: userId, role: 'shop_owner', approved: true });
        if (!user) {
            console.log('کاربر غیرمجاز یا تأییدنشده:', userId);
            return res.status(403).json({ message: 'لطفاً ابتدا توسط ادمین تأیید شوید!' });
        }
        const productsCollection = db.collection('products');
        let productObjectId;
        try {
            productObjectId = new ObjectId(productId);
        } catch (error) {
            console.error('خطا در تبدیل productId به ObjectId:', error.message);
            return res.status(400).json({ message: 'شناسه محصول نامعتبر است', error: error.message });
        }
        const result = await productsCollection.deleteOne({ _id: productObjectId, userId });
        if (result.deletedCount === 0) {
            console.log('محصول یافت نشد:', productId);
            return res.status(404).json({ message: 'محصول یافت نشد!' });
        }
        console.log('محصول حذف شد:', productId);
        res.json({ message: 'محصول با موفقیت حذف شد!' });
    } catch (error) {
        console.error('خطا در /api/delete-product:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای گرفتن محصولات
app.get('/api/products', checkMongoConnection, async (req, res) => {
    const userId = req.query.userId;
    console.log('درخواست /api/products:', { userId });
    try {
        if (!userId) {
            console.log('userId غایب');
            return res.status(400).json({ message: 'userId لازم است' });
        }
        const productsCollection = db.collection('products');
        const products = await productsCollection.find({ userId }).sort({ order: 1 }).toArray();
        console.log('محصولات:', products);
        res.json(products);
    } catch (error) {
        console.error('خطا در /api/products:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای گرفتن اطلاعات کاربر (برای مغازه‌ها)
app.get('/api/user', checkMongoConnection, async (req, res) => {
    const userId = req.query.userId;
    console.log('درخواست /api/user با userId:', userId);
    try {
        if (!userId) {
            console.log('userId غایب');
            return res.status(400).json({ message: 'userId لازم است' });
        }
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ shopId: userId, role: 'shop_owner', approved: true });
        if (user) {
            console.log('کاربر یافت شد:', { shopId: user.shopId, role: user.role });
            res.json({
                shopName: user.shopName,
                owner: user.fullName,
                phone: user.mobile,
                whatsapp: user.whatsapp || '',
                telegram: user.telegram || '',
                instagram: user.instagram || '',
                eitaa: user.eitaa || '',
                rubika: user.rubika || '',
                bale: user.bale || '',
                website: user.website || '',
                bannerUrl: user.bannerUrl || '',
                province: user.province || 'نامشخص',
                city: user.city || 'نامشخص',
                region: user.region || '',  // فیلد جدید
                location: user.location || { lat: '', lng: '' }  // برگردوندن لوکیشن
            });
        } else {
            console.log('کاربر یافت نشد یا تأییدنشده برای userId:', userId);
            return res.status(404).json({ message: 'کاربر یافت نشد یا تأیید نشده است!' });
        }
    } catch (error) {
        console.error('خطا در /api/user:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای گرفتن محصولات در انتظار تأیید
app.post('/api/pending-products', checkMongoConnection, checkAdmin, async (req, res) => {
    console.log('درخواست /api/pending-products');
    try {
        const productsCollection = db.collection('products');
        const pendingProducts = await productsCollection
            .find({ approved: false })
            .toArray();
        console.log('محصولات در انتظار تأیید:', pendingProducts);
        res.json(pendingProducts.map(product => ({
            _id: product._id.toString(),
            userId: product.userId,
            name: product.name,
            description: product.description,
            imageUrl: product.imageUrl || '',
            instagramLink: product.instagramLink || ''
        })));
    } catch (error) {
        console.error('خطا در /api/pending-products:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای تأیید محصول توسط ادمین
app.post('/api/approve-product', checkMongoConnection, checkAdmin, async (req, res) => {
    const { productId, adminId } = req.body;
    console.log('درخواست /api/approve-product:', { productId, adminId });
    try {
        if (!productId || !adminId) {
            console.log('productId یا adminId غایب');
            return res.status(400).json({ message: 'productId و adminId لازم است' });
        }
        const productsCollection = db.collection('products');
        let productObjectId;
        try {
            productObjectId = new ObjectId(productId);
        } catch (error) {
            console.error('خطا در تبدیل productId به ObjectId:', error.message);
            return res.status(400).json({ message: 'شناسه محصول نامعتبر است', error: error.message });
        }
        const product = await productsCollection.findOne({ _id: productObjectId });
        if (!product) {
            console.log('محصول یافت نشد:', productId);
            return res.status(404).json({ message: 'محصول یافت نشد!' });
        }
        await productsCollection.updateOne(
            { _id: productObjectId },
            { $set: { approved: true } }
        );
        console.log('محصول تأیید شد:', productId);
        res.json({ message: 'محصول با موفقیت تأیید شد!' });
    } catch (error) {
        console.error('خطا در /api/approve-product:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای به‌روزرسانی ترتیب محصولات
app.post('/api/update-product-order', checkMongoConnection, async (req, res) => {
    const { userId, order } = req.body;
    console.log('درخواست /api/update-product-order:', { userId, order });
    try {
        if (!userId || !Array.isArray(order)) {
            return res.status(400).json({ message: 'userId و order (آرایه) لازم است' });
        }
        const productsCollection = db.collection('products');
        for (let i = 0; i < order.length; i++) {
            const productId = order[i];
            let productObjectId;
            try {
                productObjectId = new ObjectId(productId);
            } catch (error) {
                console.error('خطا در تبدیل productId به ObjectId:', error.message);
                continue;
            }
            await productsCollection.updateOne(
                { _id: productObjectId, userId },
                { $set: { order: i } }
            );
        }
        console.log('ترتیب محصولات ذخیره شد');
        res.json({ message: 'ترتیب محصولات با موفقیت ذخیره شد!' });
    } catch (error) {
        console.error('خطا در /api/update-product-order:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای به‌روزرسانی پروفایل (با ذخیره lat و lng)
app.post('/api/update-profile', checkMongoConnection, upload.none(), async (req, res) => {
    const { userId, role, 'new-address': address, 'new-postal-code': postalCode, 'location-lat': lat, 'location-lng': lng, whatsapp, telegram, instagram, eitaa, rubika, bale, website, 'new-password': newPassword, 'confirm-new-password': confirmNewPassword, 'new-shop-name': shopName } = req.body;
    console.log('درخواست به‌روزرسانی پروفایل:', { userId, role, address, postalCode, lat, lng, shopName });
    try {
        if (!userId || !role) {
            return res.status(400).json({ message: 'userId و role لازم است' });
        }
        if (newPassword && newPassword !== confirmNewPassword) {
            return res.status(400).json({ message: 'رمز عبور جدید و تأیید رمز مطابقت ندارند' });
        }
        const usersCollection = db.collection('users');
        let user;
        if (role === 'shop_owner') {
            user = await usersCollection.findOne({ shopId: userId, role });
        } else {
            user = await usersCollection.findOne({ mobile: userId, role });
        }
        if (!user) {
            return res.status(404).json({ message: 'کاربر یافت نشد!' });
        }
        const updateData = {};
        if (address) updateData.address = address;
        if (postalCode) updateData.postalCode = postalCode;
        if (lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
            updateData.location = { lat: parseFloat(lat), lng: parseFloat(lng) };  // ذخیره لوکیشن
        }
        if (whatsapp) updateData.whatsapp = whatsapp;
        if (telegram) updateData.telegram = telegram;
        if (instagram) updateData.instagram = instagram;
        if (eitaa) updateData.eitaa = eitaa;
        if (rubika) updateData.rubika = rubika;
        if (bale) updateData.bale = bale;
        if (website) updateData.website = website;
        if (shopName) updateData.shopName = shopName;
        if (newPassword) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            updateData.password = hashedPassword;
        }
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: 'هیچ داده‌ای برای به‌روزرسانی ارائه نشده است' });
        }
        await usersCollection.updateOne({ _id: user._id }, { $set: updateData });
        console.log('پروفایل به‌روزرسانی شد:', updateData);
        res.json({ message: 'پروفایل با موفقیت به‌روزرسانی شد!' });
    } catch (error) {
        console.error('خطا در به‌روزرسانی پروفایل:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای گرفتن تصویر محصول
app.get('/api/image/:userId/:index', checkMongoConnection, async (req, res) => {
    const { userId, index } = req.params;
    console.log('درخواست /api/image:', { userId, index });
    try {
        if (!userId || isNaN(index)) {
            console.log('داده‌های ناقص:', { userId, index });
            return res.status(400).json({ message: 'userId و index معتبر لازم است' });
        }
        const productsCollection = db.collection('products');
        const products = await productsCollection.find({ userId, approved: true }).sort({ order: 1 }).toArray();
        if (products[index] && products[index].imageUrl) {
            res.redirect(products[index].imageUrl);
        } else {
            console.log('تصویر یافت نشد:', { userId, index });
            return res.status(404).json({ message: 'تصویر یافت نشد' });
        }
    } catch (error) {
        console.error('خطا در /api/image:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// روت برای خروج
app.post('/api/logout', checkMongoConnection, async (req, res) => {
    const { userId, role } = req.body;
    console.log('درخواست خروج دریافت شد:', { userId, role });
    try {
        if (!userId || !role) {
            console.log('userId یا role غایب است');
            return res.status(400).json({ message: 'userId و نقش لازم است' });
        }
        const usersCollection = db.collection('users');
        let user;
        if (role === 'shop_owner') {
            user = await usersCollection.findOne({ shopId: userId, role });
        } else {
            user = await usersCollection.findOne({ mobile: userId, role });
        }
        if (!user) {
            console.log('کاربر یافت نشد:', userId, role);
            return res.status(404).json({ message: 'کاربر یافت نشد' });
        }
        await usersCollection.updateOne(
            { _id: user._id },
            { $set: { verified: false } }
        );
        console.log('خروج موفق برای کاربر:', userId, role);
        res.json({ message: 'خروج با موفقیت انجام شد' });
    } catch (error) {
        console.error('خطا در خروج:', error.message, error.stack);
        res.status(500).json({ message: 'خطا در سرور', error: error.message });
    }
});

// سرو فایل‌های استاتیک
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing MongoDB connection...');
    if (mongoClient) {
        mongoClient.close().then(() => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

// راه‌اندازی سرور
connectMongoDB().then(() => {
    app.listen(port, () => {
        console.log(`The Server is Running at http://localhost:${port}`);
    });
}).catch(error => {
    console.error('Failed to start server due to MongoDB connection error:', error.message);
    process.exit(1);
});

// اطمینان از پاسخ JSON در خطاها
app.use((err, req, res, next) => {
    console.error('Server error:', err.message, err.stack);
    res.status(500).json({ message: 'خطا در سرور', error: err.message });
});