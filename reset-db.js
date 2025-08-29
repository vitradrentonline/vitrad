const { MongoClient } = require('mongodb');

// رشته اتصال به دیتابیس شما
const mongoUri = 'mongodb://root:1gJu5w36FQqkhKXORWKyZ0l0@chogolisa.liara.cloud:33240/my-app?authSource=admin&replicaSet=rs0&directConnection=true';

const collectionsToReset = ['users', 'shops', 'products', 'otps', 'ratings'];

async function resetDatabase() {
    let client;
    try {
        client = await MongoClient.connect(mongoUri, {
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 20000
        });
        console.log('✅ Connected to MongoDB for reset operation.');
        
        // ✅ تغییر اصلی اینجاست. از دیتابیس پیش‌فرض در رشته اتصال استفاده می‌کنیم.
        const db = client.db();

        console.log(`Starting to drop collections in "${db.databaseName}" database...`);

        for (const collectionName of collectionsToReset) {
            try {
                await db.collection(collectionName).drop();
                console.log(`  - Collection '${collectionName}' dropped successfully.`);
            } catch (error) {
                if (error.codeName === 'NamespaceNotFound') {
                    console.log(`  - Collection '${collectionName}' did not exist, skipping.`);
                } else {
                    throw error;
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

// اجرای اسکریپت
resetDatabase();