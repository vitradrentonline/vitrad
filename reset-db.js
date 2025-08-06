const { MongoClient } = require('mongodb');

const mongoUri = 'mongodb+srv://amir:Amir1381@cluster0.1ahamnk.mongodb.net/asn?retryWrites=true&w=majority&appName=Cluster0';

async function resetDatabase() {
    let client;
    try {
        client = await MongoClient.connect(mongoUri, {
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 20000
        });
        console.log('Connected to MongoDB');
        const db = client.db('asn');

        // پاک کردن کلکسیون‌های users و products
        await db.collection('users').deleteMany({});
        await db.collection('products').deleteMany({});
        console.log('All data in users and products collections deleted');
    } catch (error) {
        console.error('Error resetting database:', error.message);
    } finally {
        if (client) {
            await client.close();
            console.log('MongoDB connection closed');
        }
    }
}

resetDatabase();