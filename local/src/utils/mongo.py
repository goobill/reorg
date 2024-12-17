import os
import time
from datetime import datetime
from pymongo import MongoClient

def write_data(collection_name, data, schema, overwrite=False):
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017/")
    client = MongoClient(mongo_url)
    db = client["reorg"]
    collection = db[collection_name]

    def format_row(row):
        clean_row = dict(zip(schema, row))
        clean_row["unix"] = time.time()
        clean_row["datetime"] = datetime.now()
        return clean_row
    
    documents = [format_row(row) for row in data]

    if overwrite:
        collection.drop()

    result = collection.insert_many(documents)

    client.close()
    
    return result.inserted_ids
