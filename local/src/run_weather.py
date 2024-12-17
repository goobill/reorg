from utils.mongo import write_data
from weather.live import process

if __name__ == "__main__":
    service = "weather"
    schema = [
        "humidity",
        "precipitation_probability",
        "rain_intensity",
        "temperature",
        "temperature_apparent",
        "uv_index",
        "wind_speed",
    ]

    data = process()

    if len(data) > 0:
        write_data(service, data, schema)