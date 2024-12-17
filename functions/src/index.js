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

const getData = async (col_name, filters) => {
    const db = client.db("reorg");
    const collection = db.collection(col_name);

    // Calculate the datetime for one week ago
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 5);

    // Start with the base query that filters records from the last week
    const query = { datetime: { $gte: oneWeekAgo } };

    // Apply filters dynamically if provided
    if (filters && typeof filters === 'object') {
        Object.keys(filters).forEach(key => {
            query[key] = filters[key];
        });
    }

    // Options for sorting and excluding fields
    const options = {
        sort: { datetime: -1 }, // Sort descending
        projection: { _id: 0, unix: 0 } // Exclude _id and unix fields
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
            const surf = await getData("surf", {"rank": 1})
            const response = {
                "metrics": metrics,
                "weather": weather,
                "surf": surf,
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
