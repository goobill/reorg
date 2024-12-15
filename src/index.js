const { app } = require('@azure/functions');
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env["MONGODB_ATLAS_URI"];
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const getData = async (col_name) => {
    const db = client.db("reorg");
    const collection = db.collection(col_name);

    // Calculate the datetime for one week ago
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 5);

    // Query to fetch records from the last week, sorted by datetime in descending order
    const query = { datetime: { $gte: oneWeekAgo } };
    const options = {
        sort: { datetime: -1 }, // Sort descending
    };

    return await collection.find(query, options).toArray();
}

app.http('metrics', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            context.res = {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "https://reorg.goobill.com",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type"
                }
            };
            return;
        }
    
        try {
            await client.connect();
            
            const metrics = await getData("metrics")
            const weather = await getData("weather")
            const response = {
                "metrics": metrics,
                "weather": weather
            }

            return { 
                jsonBody: response,
                headers: {
                    "Access-Control-Allow-Origin": "https://reorg.goobill.com",
                }
            };
        } catch (e) {
            context.log.error(`Error: ${e.message}`)
            return { 
                jsonBody: [],
                headers: {
                    "Access-Control-Allow-Origin": "https://reorg.goobill.com",
                } 
            };
        } finally {
            // Ensures that the client will close when you finish/error
            await client.close();
        }
    }
});
