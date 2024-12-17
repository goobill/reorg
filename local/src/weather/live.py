import os
import requests

def process():
    api_key = os.getenv("WEATHER_API_KEY")
    location = "51.454514, -2.587910"
    url = f"https://api.tomorrow.io/v4/weather/realtime?location={location}&apikey={api_key}"
    headers = {"accept": "application/json"}
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        data = response.json()
        values = data["data"]["values"]

        humidity = values["humidity"]
        precipitation_probability = values["precipitationProbability"]
        rain_intensity = values["rainIntensity"]
        temperature = values["temperature"]
        temperature_apparent = values["temperatureApparent"]
        uv_index = values["uvIndex"]
        wind_speed = values["windSpeed"]

        return [
            [
                humidity,
                precipitation_probability,
                rain_intensity,
                temperature,
                temperature_apparent,
                uv_index,
                wind_speed,
            ]
        ]
    else:
        return [[]]
