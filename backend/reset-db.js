require('dotenv').config(); // خواندن فایل .env
const { MongoClient } = require('mongodb');

// خواندن آدرس دیتابیس از فایل امن .env
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
    console.error('❌ MONGODB_URI is not defined in .env file');
    process.exit(1);
}

const collectionsToReset = ['users', 'shops', 'products', 'otps', 'ratings', 'follows', 'rentonline', 'reviews', 'reports'];

async function resetDatabase() {
    let client;
    try {
        client = await MongoClient.connect(mongoUri, {
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 20000
        });
        console.log('✅ Connected to MongoDB for reset operation.');
        
        const db = client.db(); // استفاده از دیتابیس پیش‌فرض موجود در کانکشن استرینگ

        console.log(`Starting to drop collections in "${db.databaseName}" database...`);

        for (const collectionName of collectionsToReset) {
            try {
                await db.collection(collectionName).drop();
                console.log(`  - Collection '${collectionName}' dropped successfully.`);
            } catch (error) {
                if (error.codeName === 'NamespaceNotFound') {
                    console.log(`  - Collection '${collectionName}' did not exist, skipping.`);
                } else {
                    console.warn(`  ⚠️ Error dropping '${collectionName}':`, error.message);
                }
            }
        }

        console.log('✅ Database reset completed successfully!');

    } catch (error) {
        console.error('❌ Error resetting database:', error.message);
    } finally {
        if (client) {
            await client.close();
            console.log('🔌 MongoDB connection closed.');
        }
    }
}

resetDatabase();