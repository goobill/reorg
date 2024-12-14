const { app } = require('@azure/functions');
const { MongoClient, ServerApiVersion } = require('mongodb');

app.http('metrics', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const name = request.query.get('name') || (await request.text()) || 'world';

        return { body: `Hello, ${name}!` };
    },
});

// app.http('metrics', {
//     // route: 'metrics',
//     methods: ['GET'],
//     authLevel: 'anonymous',
//     handler: async (request, context) => {
//         try {
//             const uri = process.env["MONGODB_ATLAS_URI"];

//             // Create a MongoClient with a MongoClientOptions object to set the Stable API version
//             const client = new MongoClient(uri, {
//                 serverApi: {
//                     version: ServerApiVersion.v1,
//                     strict: true,
//                     deprecationErrors: true,
//                 }
//             });

//             // Connect the client to the server	(optional starting in v4.7)
//             await client.connect();
            
//             const db = client.db("reorg");
//             const collection = db.collection("metrics");

//             // Calculate the datetime for one week ago
//             const oneWeekAgo = new Date();
//             oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

//             // Query to fetch records from the last week, sorted by datetime in descending order
//             const query = { datetime: { $gte: oneWeekAgo } };
//             const options = {
//                 sort: { datetime: -1 }, // Sort descending
//             };

//             const results = await collection.find(query, options).toArray();

//             return { status: 200, jsonBody: results };
//         } catch (e) {
//             context.log.error(`Error: ${e.message}`)
//             return { body: e.message };
//         } finally {
//             // Ensures that the client will close when you finish/error
//             await client.close();
//         }
//     }
// });
