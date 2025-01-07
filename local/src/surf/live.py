import os
import json
from datetime import (
    datetime, 
    timedelta,
    timezone
)
import random
import time
import pandas as pd
import requests

def get_next_weekend():
    today = datetime.now()
    # Calculate days until next Saturday (5) and Sunday (6) respectively
    days_until_friday = (4 - today.weekday()) % 7
    days_until_saturday = (5 - today.weekday()) % 7
    days_until_sunday = (6 - today.weekday()) % 7
    # Calculate and format the dates
    next_friday = (today + timedelta(days=days_until_friday)).strftime("%Y-%m-%d")
    next_saturday = (today + timedelta(days=days_until_saturday)).strftime("%Y-%m-%d")
    next_sunday = (today + timedelta(days=days_until_sunday)).strftime("%Y-%m-%d")
    # Return as a list
    return [next_friday, next_saturday, next_sunday]

def normalize_closeness_to_var(df, column_name, variable_to_compare):
    # Compute closeness rank
    df[f'closeness_rank'] = abs(df[column_name] - variable_to_compare)
    
    # Find the maximum closeness rank
    max_value = df[column_name].max()
    
    # Handle the case where max_value is zero (all values are equal to variable_to_compare)
    if max_value == 0:
        df[f'normalized_closeness_{column_name}'] = 1  # All values get the max score
    else:
        # Normalize closeness
        df[f'normalized_closeness_{column_name}'] = 1 - (df[f'closeness_rank'] / max_value)
    
    # Drop the temporary column
    df = df.drop('closeness_rank', axis=1)
    return df

def get_data_path():
    current_folder = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(current_folder, "../../data")

def get_distances_path():
    return os.path.join(get_data_path(), "dist.csv")

def surf_the_web(id, param_type):
    sleep_duration = random.uniform(2, 10)
    time.sleep(sleep_duration)
    
    if param_type == "wave":
        url = f"https://services.surfline.com/kbyg/spots/forecasts/wave?spotId={id}&days=5&intervalHours=1&cacheEnabled=true&units%5BswellHeight%5D=FT&units%5BwaveHeight%5D=FT"
    elif param_type == "wind":
        url = f"https://services.surfline.com/kbyg/spots/forecasts/wind?spotId={id}&days=5&intervalHours=1&corrected=false&cacheEnabled=true&units%5BwindSpeed%5D=MPH"
    elif param_type == "sunlight":
        url = f"https://services.surfline.com/kbyg/spots/forecasts/sunlight?spotId={id}&days=16&intervalHours=1"
    elif param_type == "rating":
        url = f"https://services.surfline.com/kbyg/spots/forecasts/rating?spotId={id}&days=5&intervalHours=1&cacheEnabled=true"
    
    response = requests.get(url)

    if response.status_code == 200:
        json_object = response.json()
        return json_object
    else:
        time.sleep(3)
        return {
            "wave": [],
            "wind": [],
            "sunlight": [],
            "rating": []
        }
        # raise Exception(response)

def unix_time_convert(unix):
    return datetime.fromtimestamp(unix, tz=timezone.utc)

def extract(id):
    wave_response = surf_the_web(id, 'wave')

    wave_info = []  # Assuming this is defined somewhere above your code

    for wave in wave_response["data"]["wave"]:
        spot_id = id
        surf = wave.get("surf", {})
        swells = wave.get("swells", [])
        swell_period = -1

        # Find the swell with the maximum impact if swells exist
        if swells:
            max_impact_swell = max(swells, key=lambda swell: swell.get("impact", 0))
            swell_period = max_impact_swell.get("period", -1)

        timestamp = unix_time_convert(wave.get("timestamp", 0))

        # Pull min and max wave sizes from the raw data
        raw = surf.get("raw", {})
        min_wave_size = raw.get("min", 0)  # Default to 0 if 'min' key is missing
        max_wave_size = raw.get("max", 0)  # Default to 0 if 'max' key is missing


        wave_info_dict = {
            'spot_id': spot_id,
            'timestamp': timestamp,
            'min_wave_size': min_wave_size,
            'max_wave_size': max_wave_size,
            'swell_period': swell_period
        }
        wave_info.append(wave_info_dict)


    wind_response = surf_the_web(id, 'wind')
    wind_info = []

    for wind in wind_response["data"]["wind"]:
        spot_id = id
        timestamp = unix_time_convert(wind["timestamp"])
        speed = wind["speed"]
        direction = wind["direction"]
        direction_type = wind["directionType"]
        wind_info_dict = {
            'spot_id': spot_id,
            'timestamp': timestamp,
            'wind_speed': speed,
            'wind_direction': direction,
            'wind_type': direction_type
        }
        wind_info.append(wind_info_dict)

    sun_response = surf_the_web(id, 'sunlight')
    sun_info = []

    for sun in sun_response["data"]["sunlight"]:
        spot_id = id
        timestamp = unix_time_convert(sun["dawn"])
        date = timestamp.date()
        dawn = unix_time_convert(sun["dawn"])
        sunrise = unix_time_convert(sun["sunrise"])
        sunset = unix_time_convert(sun["sunset"])
        dusk = unix_time_convert(sun["dusk"])
        sun_info_dict = {
            'spot_id': spot_id,
            'date': date,
            'dawn': dawn,
            'sunrise': sunrise,
            'sunset': sunset,
            'dusk': dusk
        }
        sun_info.append(sun_info_dict)

    wave_df = pd.DataFrame(wave_info)
    wind_df = pd.DataFrame(wind_info)
    sun_df = pd.DataFrame(sun_info)

    result_df = pd.merge(wave_df, wind_df, on=["spot_id", "timestamp"], how="left")
    result_df['date'] = result_df["timestamp"].dt.date
    result_df = pd.merge(result_df, sun_df, on=["spot_id", "date"], how="left")
    result_df = result_df.drop(columns=["date"])

    return result_df

def process():
    try:
        # Parameters
        # DIST_TRAVEL_LIMIT_HRS = 2
        TARGET_DATE = get_next_weekend()
        MIN_WAVE_SIZE = 2.5
        MAX_WAVE_SIZE = 3.5
        SWELL_PERIOD = 15
        IDEAL_DURATION = 1.25
        MAX_DURATION = 3

        # Fetch Surf Spot Data
        SURFLINE_URL = (
            'https://services.surfline.com/kbyg/mapview'
            '?south=48.90805939965008&west=-8.920898437500002&north=52.67638208083924&east=0.7580566406250001&'
        )

        response = requests.get(SURFLINE_URL)
        if response.status_code == 200:
            resp_data = response.json()
            spots = [
                {
                    "spot_id": spot["_id"],
                    "spot_name": spot["name"],
                    "sub_region": spot["subregion"]["name"],
                    "lat": spot["lat"],
                    "lon": spot["lon"],
                }
                for spot in resp_data["data"]["spots"]
            ]
        else:
            raise RuntimeError(f"Failed to fetch surf spot data: {response.status_code}")

        # Convert spots to DataFrame
        spots_df = pd.DataFrame(spots)

        # Filter to Relevant Subregions
        INTEREST_SUBREGIONS = [
            'Gower', 'North Cornwall', 'North Devon', 'Severn Estuary',
            'South Devon', 'South Cornwall', 'South Pembrokeshire',
            'Southern England West', 'Southern England East', 'West Cornwall',
        ]
        spots_df = spots_df[spots_df["sub_region"].isin(INTEREST_SUBREGIONS)]

        # Load Pre-calculated Distances
        distance_data = pd.read_csv(get_distances_path())
        distance_data['duration_hours'] = round(distance_data['duration_hours'], 1)

        # Filter distances based on MAX_DURATION
        filtered_distances_df = distance_data[distance_data["duration_hours"] < MAX_DURATION]

        # Merge the DataFrames, keeping all columns from spots_df and only 'duration_hours' from distance_data
        filtered_spots_df = pd.merge(
            spots_df,
            filtered_distances_df[['spot_id', 'duration_hours']],  # Only include 'spot_id' and 'duration_hours'
            on="spot_id",  # Key for the join
            how="inner"    # Use 'inner' join to keep only matching rows
        )
        
        # Fetch Surf Data
        surf_data = pd.DataFrame()
        for spot_id in filtered_spots_df["spot_id"]:
            spot_info = extract(spot_id)
            surf_data = pd.concat([surf_data, spot_info], ignore_index=True)

        # Merge and Filter by Time Range
        merged_data = pd.merge(filtered_spots_df, surf_data, on="spot_id", how="left")
        merged_data["timestamp"] = pd.to_datetime(merged_data["timestamp"])
        filtered_data = merged_data[
            (merged_data["timestamp"] >= merged_data["dawn"])
            & (merged_data["timestamp"] <= merged_data["dusk"])
            & (merged_data["swell_period"] > 0)
            & (merged_data["min_wave_size"] > 0)
        ]
        
        # Filter by Target Date
        date_filtered_data = filtered_data[
            filtered_data["timestamp"].dt.strftime("%Y-%m-%d").isin(TARGET_DATE)
        ]
        
        # Bucket Wind Speeds
        BIN_EDGES = [0, 13, 16, 20, float("inf")]
        BIN_LABELS = ["0-12mph", "13-15mph", "16-20mph", "20+mph"]
        date_filtered_data["wind_speed_bucket"] = pd.cut(
            date_filtered_data["wind_speed"], bins=BIN_EDGES, labels=BIN_LABELS, right=False
        )

        # One-Hot Encode Categorical Features
        COLUMNS_TO_ENCODE = ["wind_type", "wind_speed_bucket"]
        encoded_df = pd.get_dummies(date_filtered_data[COLUMNS_TO_ENCODE], prefix=COLUMNS_TO_ENCODE)
        processed_data = pd.concat(
            [date_filtered_data.drop(COLUMNS_TO_ENCODE, axis=1), encoded_df], axis=1
        )
        
        # Normalize Data
        processed_data = normalize_closeness_to_var(processed_data, "swell_period", SWELL_PERIOD)
        processed_data = normalize_closeness_to_var(processed_data, "min_wave_size", MIN_WAVE_SIZE)
        processed_data = normalize_closeness_to_var(processed_data, "max_wave_size", MAX_WAVE_SIZE)
        processed_data = normalize_closeness_to_var(processed_data, "duration_hours", IDEAL_DURATION)
        
        # Calculate Weighted Scores
        FEATURE_IMPORTANCE = {
            "wind_type_Cross-shore": 3,
            "wind_type_Offshore": 1,
            "wind_type_Onshore": 8,
            "wind_speed_bucket_0-12mph": 1,
            "wind_speed_bucket_13-15mph": 1,
            "wind_speed_bucket_16-20mph": 6,
            "wind_speed_bucket_20+mph": 8,
            "normalized_values_swell_period": 1,
            "normalized_closeness_min_wave_size": 1,
            "normalized_closeness_max_wave_size": 1,
            "normalized_values_duration_hours": 3,
        }

        valid_columns = [col for col in FEATURE_IMPORTANCE if col in processed_data]
        processed_data["weighted_sum"] = sum(
            (6 - FEATURE_IMPORTANCE[col]) * processed_data[col] for col in valid_columns
        )

        # Assuming `processed_data` is your DataFrame
        # Convert `timestamp` column to datetime if not already done
        processed_data['timestamp'] = pd.to_datetime(processed_data['timestamp'])

        # Extract the date part
        processed_data['date'] = processed_data['timestamp'].dt.date

        # Rank the rows based on `weighted_sum` within each date partition
        processed_data['rank'] = processed_data.groupby('date')['weighted_sum'].rank(ascending=False, method='dense')

        # Filter the top 3 for each date
        top = processed_data[processed_data['rank'] < 4]

        # Sort the final output by date and rank
        top = top.sort_values(by=['date', 'rank']).reset_index(drop=True)

        if "wind_type_Offshore" not in top.columns:
            top['wind_type_Offshore'] = False
        if "wind_type_Onshore" not in top.columns:
            top['wind_type_Onshore'] = False
        if "wind_type_Cross-shore" not in top.columns:
            top['wind_type_Cross-shore'] = False

        final_columns = [
            'spot_name', 
            'sub_region', 
            'timestamp', 
            'duration_hours', 
            'min_wave_size', 
            'max_wave_size', 
            'swell_period', 
            'wind_speed', 
            'dawn', 
            'sunrise', 
            'sunset', 
            'dusk', 
            'wind_type_Cross-shore', 
            'wind_type_Offshore', 
            'wind_type_Onshore', 
            'rank', 
            'weighted_sum'
        ]

        return pd.DataFrame(top[final_columns]).to_numpy()
    except Exception as error:
        raise error
