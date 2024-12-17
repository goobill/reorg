from utils.mongo import write_data
from surf.live import process

if __name__ == "__main__":
    service = "surf"
    schema = [
        "spot_name", 
        "sub_region", 
        "duration_hours", 
        "timestamp", 
        "min_wave_size", 
        "max_wave_size", 
        "swell_period", 
        "wind_speed", 
        "dawn",	
        "sunrise",	
        "sunset", 
        "dusk",	
        "wind_type_Cross-shore", 
        "wind_type_Offshore", 
        "wind_type_Onshore", 
        "rank", 
        "weighted_sum"
    ]

    data = process()

    if len(data) > 0:
        write_data(service, data, schema, overwrite=True)