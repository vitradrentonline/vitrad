require('dotenv').config();
const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const { ObjectId } = require('mongodb'); // برای کدهای قدیمی
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const http = require('http');
const { Server } = require('socket.io');

// ==========================================
// 1. تنظیمات و متغیرهای اصلی
// ==========================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const port = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI;

// متغیر سراسری برای دسترسی مستقیم به کالکشن‌ها (جهت سازگاری با کدهای قبلی)
let db;

// تنظیمات S3 (لیارا)
const s3Client = new S3Client({
    credentials: {
        accessKeyId: process.env.LIARA_ACCESS_KEY,
        secretAccessKey: process.env.LIARA_SECRET_KEY,
    },
    endpoint: process.env.LIARA_ENDPOINT,
    region: 'us-east-1',
    forcePathStyle: true
});
const bucketName = process.env.LIARA_BUCKET_NAME;

// تنظیمات ایمیل
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// تنظیمات آپلود
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 4 * 1024 * 1024 } });

// ==========================================
// 2. اتصال به دیتابیس
// ==========================================
async function connectToDatabase() {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 20000
        });
        console.log('✅ Connected to MongoDB via Mongoose');
        
        // دسترسی به درایور Native برای کدهای Legacy (کدهایی که با db.collection کار می‌کنند)
        db = mongoose.connection.db;

        // ایجاد ایندکس‌ها
        try {
            await db.collection('users').createIndex({ email: 1 }, { unique: true });
            await db.collection('users').createIndex({ mobile: 1 }, { unique: true });
            await db.collection('users').createIndex({ national_id: 1 }, { unique: true });
        } catch (e) { console.warn('⚠️ Indexes warning:', e.message); }

    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
}
connectToDatabase();

// ==========================================
// 3. مدل‌های Mongoose (تعریف اسکیماها)
// ==========================================
const userSchema = new mongoose.Schema({
    full_name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    mobile: { type: String, required: true, unique: true },
    national_id: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    province: String,
    city: String,
    tehran_area: String,
    referral_code: { type: String, unique: true },
    referred_by: String,
    referral_count: { type: Number, default: 0 },
    status: { type: Number, default: 0 },
    role: { type: String, enum: ['customer', 'seller', 'both'], default: 'customer' },
    profile_picture_url: String,
    user_identifier: String,
    resetToken: String,
    following_shops: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Shop' }],
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
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
    lat: Number,
    lng: Number,
    national_card_image: String,
    selfie_image: String,
    business_license_image: String,
    health_license_image: String,
    status: { type: String, default: 'pending' },
    shop_code: { type: String, unique: true },
    banner: String,
    logo_url: String,
    rating_average: { type: Number, default: 0 },
    rating_count: { type: Number, default: 0 },
    followers_count: { type: Number, default: 0 },
    work_experience: String,
    whatsapp: String,
    telegram: String,
    instagram: String,
    eitaa: String,
    rubika: String,
    bale: String,
    calls_enabled: { type: Boolean, default: false },
    call_windows: { type: Array, default: [] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
    shop_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    name: { type: String, required: true },
    description: String,
    image: String,
    instagram_link: String,
    priority: { type: Number, default: 0 },
    tags: [String],
    price: Number,
    discount_price: Number,
    created_at: { type: Date, default: Date.now }
});

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
    created_at: { type: Date, default: Date.now }
});
followSchema.index({ user_id: 1, shop_id: 1 }, { unique: true });

const reportSchema = new mongoose.Schema({
    reporter_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reported_item_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    report_type: { type: String, enum: ['shop', 'review', 'product'], required: true },
    reason: { type: String, required: true },
    description: String,
    status: { type: String, enum: ['pending', 'reviewed', 'resolved'], default: 'pending' },
}, { timestamps: true });

// ساخت مدل‌ها
const User = mongoose.model('User', userSchema);
const Shop = mongoose.model('Shop', shopSchema);
const Product = mongoose.model('Product', productSchema);
const Review = mongoose.model('Review', reviewSchema);
const Follow = mongoose.model('Follow', followSchema);
const Report = mongoose.model('Report', reportSchema);

// ==========================================
// 4. میدل‌ورها و توابع کمکی
// ==========================================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).json({});
    next();
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'frontend')));
app.use((req, res, next) => {
    if (!db) return res.status(503).json({ message: 'دیتابیس متصل نیست' });
    next();
});

async function uploadToS3(file, folderPath, customFileName = null) {
    let fileName;
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    if (customFileName) fileName = `${folderPath}/${customFileName}${path.extname(cleanName)}`;
    else fileName = `${folderPath}/${Date.now()}_${cleanName}`;
    try {
        const upload = new Upload({
            client: s3Client,
            params: { Bucket: bucketName, Key: fileName, Body: file.buffer, ContentType: file.mimetype },
        });
        const data = await upload.done();
        return data.Location;
    } catch (e) { console.error('S3 Upload Error:', e); throw e; }
}

async function deleteFromS3(fileUrl) {
    if (!fileUrl) return;
    try {
        const urlObj = new URL(fileUrl);
        let key = urlObj.pathname.substring(1); 
        if (key.startsWith(`${bucketName}/`)) key = key.replace(`${bucketName}/`, '');
        await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
    } catch (e) { console.error('S3 Delete Error:', e.message); }
}

async function generateUniqueUserId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
        result = '';
        for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        if (!(await db.collection('users').findOne({ user_identifier: result }))) isUnique = true;
        attempts++;
    }
    if (!isUnique) throw new Error('ID Gen Failed');
    return result;
}

async function generateOTP(email, type = 'register') {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiration = new Date(Date.now() + 5 * 60 * 1000);
    await db.collection('otps').updateOne({ email, type }, { $set: { otp, expiration, created_at: new Date() } }, { upsert: true });
    return otp;
}

function generateShopCode(length = 8) {
    let result = '';
    const chars = '0123456789';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

async function calculateShopScore(shop, dbInstance) {
    let score = 0;
    if (shop.banner && shop.banner.length > 5) score += 20;
    if (shop.shop_description && shop.shop_description.length > 50) score += 15;
    let socialLinksCount = 0;
    ['whatsapp', 'instagram', 'telegram', 'eitaa', 'bale', 'rubika'].forEach(soc => { if (shop[soc]) socialLinksCount++; });
    if (socialLinksCount >= 2) score += 15;
    if (shop.updated_at && new Date(shop.updated_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) score += 20;
    try {
        score += (await dbInstance.collection('products').countDocuments({ shop_id: shop._id })) * 2;
        const owner = await dbInstance.collection('users').findOne({ _id: shop.user_id });
        if (owner && owner.referral_count) score += owner.referral_count * 50;
    } catch (e) {}
    if (shop.rating_average && shop.rating_count) score += (shop.rating_average - 3) * shop.rating_count;
    return score;
}

// ==========================================
// 5. مسیرها (Routes)
// ==========================================

// --- Auth ---
app.post('/api/register-user', upload.none(), async (req, res) => {
    try {
        const { full_name, email, mobile, national_id, password, province, city, tehran_area, referral_code } = req.body;
        if (!full_name || !email || !mobile || !national_id || !password) return res.status(400).json({ message: 'فیلدها ناقص است' });
        if (await db.collection('users').findOne({ $or: [{ email }, { mobile }, { national_id }] })) {
            return res.status(400).json({ message: 'کاربر تکراری است' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const userIdentifier = await generateUniqueUserId(8);
        const newUser = {
            full_name, email, mobile, national_id, password_hash: hashedPassword,
            province, city, tehran_area, user_identifier: userIdentifier, role: 'customer', status: 0,
            referral_code: await generateUniqueUserId(6), referred_by: referral_code || null,
            referral_count: 0, created_at: new Date(), updated_at: new Date()
        };
        const result = await db.collection('users').insertOne(newUser);
        const otp = await generateOTP(email, 'register');
        await transporter.sendMail({ from: process.env.EMAIL_USER, to: email, subject: 'کد تایید ویتراد', text: `کد: ${otp}` });
        res.json({ success: true, user_id: result.insertedId.toString() });
    } catch (e) { res.status(500).json({ message: 'Server Error' }); }
});

app.post('/api/verify-otp', async (req, res) => {
    try {
        const { email, otp, type = 'register' } = req.body;
        const record = await db.collection('otps').findOne({ email, type, otp });
        if (!record || new Date() > record.expiration) return res.status(400).json({ message: 'کد نامعتبر' });

        if (type === 'register') {
            await db.collection('users').updateOne({ email }, { $set: { status: 1 } });
            const user = await db.collection('users').findOne({ email });
            await transporter.sendMail({ from: process.env.EMAIL_USER, to: email, subject: 'خوش آمدید', text: `شناسه: ${user.user_identifier}` });
        } else if (type === 'reset') {
            const token = Math.random().toString(36).substring(2);
            await db.collection('users').updateOne({ email }, { $set: { resetToken: token } });
            await db.collection('otps').deleteOne({ _id: record._id });
            return res.json({ success: true, resetToken: token });
        }
        await db.collection('otps').deleteOne({ _id: record._id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const user = await db.collection('users').findOne({ $or: [{ user_identifier: identifier }, { email: identifier }, { mobile: identifier }] });
        if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(400).json({ message: 'اطلاعات اشتباه' });
        if (user.status !== 1) return res.status(400).json({ message: 'حساب فعال نیست' });
        
        let shops = [];
        if (user.role !== 'customer') shops = await db.collection('shops').find({ user_id: user._id }).toArray();
        const { password_hash, ...safe } = user;
        res.json({ success: true, user: { ...safe, _id: safe._id.toString() }, shops: shops.map(s => ({ ...s, _id: s._id.toString() })) });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

// --- Shop Creation ---
app.post('/api/initiate-shop-creation', upload.fields([{name:'nationalCardImage'},{name:'selfieImage'},{name:'businessLicenseImage'},{name:'healthLicenseImage'}]), async (req, res) => {
    let tempId = null;
    try {
        const { user_id, shop_name } = req.body;
        if (!user_id || !req.files.nationalCardImage) return res.status(400).json({ message: 'ناقص' });
        
        const user = await db.collection('users').findOne({ _id: new ObjectId(user_id) });
        if(!user) return res.status(404).json({ message: 'کاربر نیست' });

        const shopCode = generateShopCode();
        const otp = Math.floor(100000 + Math.random()*900000).toString();
        
        const shopData = {
            ...req.body, user_id: new ObjectId(user_id), shop_code: shopCode, status: 'pending_upload',
            otp_info: { otp, expiration: new Date(Date.now()+600000) }, created_at: new Date()
        };
        try {
            const lat = parseFloat(req.body.latitude || req.body.lat), lng = parseFloat(req.body.longitude || req.body.lng);
            if(!isNaN(lat)) { shopData.lat=lat; shopData.lng=lng; shopData.location={type:'Point', coordinates:[lng, lat]}; }
        } catch(e){}

        const result = await db.collection('shops').insertOne(shopData);
        tempId = result.insertedId;

        const files = {};
        for(const k in req.files) files[k] = await uploadToS3(req.files[k][0], `documents/${user.national_id}/${shopCode}`, k.replace('Image',''));
        
        await db.collection('shops').updateOne({_id: tempId}, {$set: { status:'pending_verification', national_card_image:files.nationalCardImage, selfie_image:files.selfieImage, business_license_image:files.businessLicenseImage, health_license_image:files.healthLicenseImage||'' }});
        await transporter.sendMail({ from: process.env.EMAIL_USER, to: user.email, subject: 'کد تایید شاپ', text: otp });
        res.json({ success: true, shop_id: tempId.toString() });
    } catch(e) { 
        if(tempId) await db.collection('shops').deleteOne({_id:tempId});
        res.status(500).json({ message: 'Error' }); 
    }
});

app.post('/api/verify-shop-otp', async (req, res) => {
    try {
        const { shop_id, otp } = req.body;
        const shop = await db.collection('shops').findOne({ _id: new ObjectId(shop_id) });
        if(!shop || shop.otp_info.otp !== otp) return res.status(400).json({ message: 'نامعتبر' });

        const user = await db.collection('users').findOne({ _id: shop.user_id });
        await db.collection('shops').updateOne({ _id: new ObjectId(shop_id) }, { $set: { status: 'active' }, $unset: { otp_info: "" } });
        
        if(user && user.referred_by) {
            const ref = await db.collection('users').findOne({ referral_code: user.referred_by });
            if(ref) await db.collection('users').updateOne({ _id: ref._id }, { $inc: { referral_count: 1 } });
        }
        if(user.role === 'customer') await db.collection('users').updateOne({ _id: user._id }, { $set: { role: 'seller' } });
        res.json({ success: true, shop_code: shop.shop_code });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

// --- Shop Management ---
app.post('/api/shop/:shop_id/logo', upload.single('shopLogo'), async (req, res) => {
    try {
        const shop = await db.collection('shops').findOne({ _id: new ObjectId(req.params.shop_id) });
        const url = await uploadToS3(req.file, `shops/${shop.shop_code}`, 'logo');
        await db.collection('shops').updateOne({ _id: shop._id }, { $set: { logo_url: url } });
        res.json({ success: true, newImageUrl: url });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/upload-banner/:shop_id', upload.single('banner'), async (req, res) => {
    try {
        const shop = await db.collection('shops').findOne({ _id: new ObjectId(req.params.shop_id) });
        const url = await uploadToS3(req.file, `shops/${shop.shop_code}`, 'banner');
        await db.collection('shops').updateOne({ _id: shop._id }, { $set: { banner: url, banner_url: url } });
        res.json({ message: 'Uploaded', bannerUrl: url });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.put('/api/update-shop/:shop_id', async (req, res) => {
    try {
        const update = { updated_at: new Date() };
        const keys = ['description','phone','whatsapp','telegram','instagram','eitaa','rubika','bale','work_experience','address'];
        keys.forEach(k => { if(req.body[k]) update[k] = req.body[k]; });
        if(req.body.shop_description) update.shop_description = req.body.shop_description;
        if(req.body.shop_phone) update.shop_phone = req.body.shop_phone;
        if(req.body.calls_enabled !== undefined) update.calls_enabled = String(req.body.calls_enabled) === 'true';
        if(req.body.call_windows_json) try{ update.call_windows = JSON.parse(req.body.call_windows_json); }catch(e){}
        
        const lat = parseFloat(req.body.latitude || req.body.lat), lng = parseFloat(req.body.longitude || req.body.lng);
        if(!isNaN(lat)) { update.lat=lat; update.lng=lng; update.location={type:'Point', coordinates:[lng, lat]}; }

        await db.collection('shops').updateOne({ _id: new ObjectId(req.params.shop_id) }, { $set: update });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

// --- Products ---
app.post('/api/add-product/:shop_id', upload.single('image'), async (req, res) => {
    try {
        const shop = await db.collection('shops').findOne({ _id: new ObjectId(req.params.shop_id) });
        const url = await uploadToS3(req.file, `shops/${shop.shop_code}/products`);
        const priority = (await db.collection('products').countDocuments({ shop_id: shop._id })) + 1;
        await db.collection('products').insertOne({
            shop_id: shop._id, name: req.body.name, description: req.body.description,
            instagram_link: req.body.instagram_link, image: url, priority, created_at: new Date()
        });
        res.json({ message: 'Added' });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/get-products/:shop_id', async (req, res) => {
    try {
        const products = await db.collection('products').find({ shop_id: new ObjectId(req.params.shop_id) }).sort({ priority: 1 }).toArray();
        res.json(products);
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.delete('/api/product/:productId', async (req, res) => {
    try {
        const p = await db.collection('products').findOne({ _id: new ObjectId(req.params.productId) });
        if(p) { await deleteFromS3(p.image); await db.collection('products').deleteOne({ _id: p._id }); }
        res.json({ success: true });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.put('/api/product/:productId', async (req, res) => {
    try {
        await db.collection('products').updateOne({ _id: new ObjectId(req.params.productId) }, { $set: req.body });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.put('/api/products/reorder', async (req, res) => {
    try {
        const ops = req.body.orderedIds.map((id, i) => ({ updateOne: { filter: { _id: new ObjectId(id) }, update: { $set: { priority: i+1 } } } }));
        await db.collection('products').bulkWrite(ops);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

// --- Public APIs ---
app.get('/api/public-shops', async (req, res) => {
    try {
        const shops = await db.collection('shops').aggregate([
            { $match: { status: 'active' } },
            { $lookup: { from: 'products', localField: '_id', foreignField: 'shop_id', pipeline: [{$sort:{priority:1}},{$limit:3}], as: 'products' } }
        ]).toArray();
        res.json(shops);
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/shops/:shopId/details', async (req, res) => {
    try {
        const shop = await Shop.findById(req.params.shopId).lean();
        if(!shop) return res.status(404).json({ success: false });
        
        const productsCount = await Product.countDocuments({ shop_id: shop._id });
        const followers = shop.followers_count || await Follow.countDocuments({ shop_id: shop._id });
        
        res.json({ success: true, data: {
            id: shop._id, name: shop.shop_name, city: shop.city, description: shop.shop_description,
            logoUrl: shop.logo_url || shop.logo, bannerUrl: shop.banner || shop.banner_url,
            phone: shop.shop_phone, experience: shop.work_experience, address: shop.address,
            lat: shop.lat, lng: shop.lng, calls_enabled: !!shop.calls_enabled, call_windows: shop.call_windows || [],
            socials: { whatsapp: shop.whatsapp, telegram: shop.telegram, instagram: shop.instagram, eitaa: shop.eitaa, rubika: shop.rubika, bale: shop.bale },
            followers: followers, rating: shop.rating_average || 0, reviewCount: shop.rating_count || 0, productCount: productsCount
        }});
    } catch(e) { res.status(500).json({ success: false }); }
});

app.get('/api/shops/:shopId/products', async (req, res) => {
    try {
        const { search, sort } = req.query;
        let q = { shop_id: new ObjectId(req.params.shopId) };
        if(search) q.name = { $regex: search, $options: 'i' };
        let s = { priority: 1 };
        if(sort === 'newest') s = { created_at: -1 };
        const products = await Product.find(q).sort(s);
        res.json({ success: true, data: products });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.get('/api/shops/:shopId/reviews', async (req, res) => {
    try {
        const reviews = await Review.find({ shop_id: req.params.shopId }).populate('user_id', 'full_name profile_picture_url').sort({ createdAt: -1 });
        res.json({ success: true, data: reviews });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.post('/api/shops/:shopId/reviews', async (req, res) => {
    try {
        const { userId, rating, text } = req.body;
        if(await Review.findOne({ shop_id: req.params.shopId, user_id: userId })) return res.status(400).json({ success: false, message: 'تکراری' });
        await Review.create({ shop_id: req.params.shopId, user_id: userId, rating, text });
        
        const stats = await Review.aggregate([ { $match: { shop_id: new ObjectId(req.params.shopId) } }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } } ]);
        if(stats.length) await Shop.findByIdAndUpdate(req.params.shopId, { rating_average: stats[0].avg, rating_count: stats[0].count });
        
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.post('/api/shops/follow', async (req, res) => {
    try {
        const { userId, shopId } = req.body;
        const exists = await Follow.findOne({ user_id: userId, shop_id: shopId });
        if(exists) {
            await Follow.findByIdAndDelete(exists._id);
            await Shop.findByIdAndUpdate(shopId, { $inc: { followers_count: -1 } });
            res.json({ success: true, status: 'unfollowed', message: 'لغو شد' });
        } else {
            await Follow.create({ user_id: userId, shop_id: shopId });
            await Shop.findByIdAndUpdate(shopId, { $inc: { followers_count: 1 } });
            res.json({ success: true, status: 'followed', message: 'دنبال شد' });
        }
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/report', async (req, res) => {
    try {
        await Report.create(req.body);
        res.status(201).json({ success: true });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.get('/api/get-user-profile/:user_id', async (req, res) => {
    try {
        const user = await User.findById(req.params.user_id).select('-password_hash -resetToken');
        if(!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/user/profile-picture/:user_id', upload.single('profilePicture'), async (req, res) => {
    try {
        const user = await db.collection('users').findOne({ _id: new ObjectId(req.params.user_id) });
        const url = await uploadToS3(req.file, `users/${user.user_identifier}`, 'profile');
        await db.collection('users').updateOne({ _id: user._id }, { $set: { profile_picture_url: url } });
        res.json({ success: true, newImageUrl: url });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.put('/api/update-profile', async (req, res) => {
    try {
        const { user_id, new_password, ...data } = req.body;
        if(new_password) data.password_hash = await bcrypt.hash(new_password, 10);
        await db.collection('users').updateOne({ _id: new ObjectId(user_id) }, { $set: { ...data, updated_at: new Date() } });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/check-duplicates', async (req, res) => {
    try {
        const { email, mobile, national_id } = req.body;
        const dups = { email: !!(await User.findOne({email})), mobile: !!(await User.findOne({mobile})), national_id: !!(await User.findOne({national_id})) };
        res.json({ duplicates: dups });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/forgot-password', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if(user) {
            const otp = await generateOTP(req.body.email, 'reset');
            await transporter.sendMail({ from: process.env.EMAIL_USER, to: user.email, subject: 'بازیابی رمز', text: otp });
        }
        res.json({ success: true });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const user = await User.findOne({ resetToken: req.body.resetToken });
        if(!user) return res.status(400).json({ message: 'نامعتبر' });
        const hash = await bcrypt.hash(req.body.newPassword, 10);
        await User.findByIdAndUpdate(user._id, { password_hash: hash, resetToken: null });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/resend-reset-otp', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if(user) {
            const otp = await generateOTP(user.email, 'reset');
            await transporter.sendMail({ from: process.env.EMAIL_USER, to: user.email, subject: 'ارسال مجدد کد', text: otp });
        }
        res.json({ success: true });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/search-shops', async (req, res) => {
    try {
        const q = req.query.query;
        let shops = await Shop.find({ shop_name: { $regex: q, $options: 'i' } });
        if(!shops.length) {
            const p = await Product.find({ name: { $regex: q, $options: 'i' } });
            const ids = [...new Set(p.map(x=>x.shop_id))];
            shops = await Shop.find({ _id: { $in: ids } });
        }
        res.json(shops);
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/get-shops', async (req, res) => {
    try {
        const f = req.query.user_id ? { user_id: new ObjectId(req.query.user_id) } : {};
        const shops = await db.collection('shops').find(f).toArray();
        res.json(shops);
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/sorted-shops', async (req, res) => {
    try {
        const shops = await Shop.find({ status: 'active' }).lean();
        for(const s of shops) s.score = await calculateShopScore(s, db);
        shops.sort((a,b) => b.score - a.score); // مرتب سازی ساده بر اساس امتیاز
        res.json(shops);
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/filter-shops', async (req, res) => {
    try {
        const { activity, subActivity, province, city, sort } = req.query;
        let f = { status: 'active' };
        if(activity) f.activity_type = activity;
        if(subActivity) f.job_category = subActivity;
        if(province) f.province = province;
        if(city) f.city = city;
        let s = {};
        if(sort === 'name') s = { shop_name: 1 };
        else if(sort === 'date') s = { created_at: -1 };
        const shops = await Shop.find(f).sort(s);
        res.json(shops);
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/shops/:shopId/call-availability', async (req, res) => {
    try {
        const shop = await Shop.findById(req.params.shopId);
        res.json({ success: true, data: { enabled: !!shop.calls_enabled, within: true } });
    } catch(e) { res.status(500).json({ success: false }); }
});

// ==========================================
// API جدید: دریافت جزئیات محصول + اطلاعات فروشگاه
// ==========================================
app.get('/api/product-details/:productId', async (req, res) => {
    try {
        // استفاده از ObjectId برای کوئری دقیق
        const { ObjectId } = require('mongoose').Types; 
        const { productId } = req.params;
        
        if (!ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'شناسه محصول نامعتبر است.' });
        }

        // ۱. پیدا کردن محصول
        const product = await Product.findById(productId).lean();
        if (!product) {
            return res.status(404).json({ success: false, message: 'محصول یافت نشد.' });
        }

        // ۲. پیدا کردن فروشگاه مرتبط
        const shop = await Shop.findById(product.shop_id).lean();
        
        // ۳. ترکیب داده‌ها
        const result = {
            ...product,
            shop_info: shop ? {
                id: shop._id,
                name: shop.shop_name,
                city: shop.city,
                province: shop.province,
                logo: shop.logo_url || shop.logo,
                score: shop.rating_average || 0,
                username: shop.user_identifier
            } : null
        };

        res.json({ success: true, data: result });

    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).json({ success: false, message: 'خطای سرور' });
    }
});

// ==========================================
// 6. Socket.IO & Start (سرور در انتها روشن می‌شود)
// ==========================================
io.on('connection', (socket) => {
    socket.on('join', ({ roomId }) => { socket.join(roomId); socket.to(roomId).emit('peer-joined'); });
    socket.on('offer', (d) => socket.to(d.roomId).emit('offer', d));
    socket.on('answer', (d) => socket.to(d.roomId).emit('answer', d));
    socket.on('ice-candidate', (d) => socket.to(d.roomId).emit('ice-candidate', d));
});

server.listen(port, () => {
    console.log(`🚀 Server running on ${port}`);
});