import time
import board
import adafruit_dht

def process():
    # Initial the dht device, with data pin connected to:
    dhtDevice = adafruit_dht.DHT11(board.D4)
    temperature_c = 0.0
    humidity = 0.0
    count = 0

    while temperature_c == 0 and humidity == 0 and count < 5:
        count += 1
        try:
            temperature_c = dhtDevice.temperature
            humidity = dhtDevice.humidity
        except RuntimeError as error:
            # Errors happen fairly often, DHT's are hard to read, just keep going
            print(error.args[0])
            time.sleep(1.0)
            continue
        except Exception as error:
            dhtDevice.exit()
            return [[]]
        
    return [[temperature_c, humidity]]