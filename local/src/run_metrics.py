from utils.mongo import write_data
from metrics.live import process

if __name__ == "__main__":
    service = "metrics"
    schema = ["temperature_c", "humidity"]

    data = process()

    if len(data) > 0:
        write_data(service, data, schema)