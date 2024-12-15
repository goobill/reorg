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
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            await client.connect();
            
            const metrics = await getData("metrics")
            const weather = await getData("weather")
            const response = {
                "metrics": metrics,
                "weather": weather
            }

            return { jsonBody: response };
        } catch (e) {
            context.log.error(`Error: ${e.message}`)
            return { jsonBody: [] };
        } finally {
            // Ensures that the client will close when you finish/error
            await client.close();
        }
    }
});
