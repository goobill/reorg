import time
import board
import adafruit_dht

def process():
    # Initial the dht device, with data pin connected to:
    dhtDevice = adafruit_dht.DHT11(board.D4)
    temperature_c = 0.0
    humidity = 0.0
    count = 0
    max_retry = 10

    try:
        while (temperature_c == 0 or humidity == 0) and count < max_retry:
            count += 1
            try:
                temperature_c = dhtDevice.temperature
                humidity = dhtDevice.humidity
            except Exception as error:
                # Errors happen fairly often, DHT's are hard to read, just keep going
                print(error.args[0])
                time.sleep(2.0)
                continue
    finally:
        dhtDevice.exit()
        
    return [[temperature_c, humidity]]