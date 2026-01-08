import time
import random
import requests

# The base URL of your Django server
BASE = "http://127.0.0.1:8000"

# List of tokens for your 3 devices
# You can get these from your Django Admin or the 'device_token' field in the database
DEVICE_TOKENS = [
    "6bd7474e0b4447d19184da8081f5642b",  # Device 1
    "309adaebd7bd44869bac7bd373df27cf",              # Device 2
    "a9e42ef6890d41caa63e7b53777b8ee2"               # Device 3
]

def send_telemetry(token, device_index):
    """Generates and sends mock data for a specific device."""
    try:
        # Realistic values
        v = random.uniform(220, 240)
        
        # Varying the current slightly based on device index to differentiate them on graphs
        if device_index == 0: # E.g., Fridge (Constant but lower)
            i = random.uniform(0.5, 1.5)
        elif device_index == 1: # E.g., AC (High load)
            i = random.uniform(5.0, 10.0)
        else: # E.g., Lights/Fans (Varying)
            i = random.uniform(1.0, 3.0)
            
        p = v * i 
        # Simulated tiny energy increment for the 2-second interval
        e = p / (1000.0 * 1800.0) 

        payload = {
            "voltage": round(v, 2),
            "current": round(i, 2),
            "power": round(p, 2),
            "energy_kwh": round(e, 6)
        }

        r = requests.post(
            f"{BASE}/api/telemetry/upload/",
            headers={
                "X-DEVICE-TOKEN": token, 
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=5,
        )
        
        print(f"[Device {device_index + 1}] Status: {r.status_code} | Power: {payload['power']}W")
        
    except Exception as e:
        print(f"[Device {device_index + 1}] Error: {e}")

if __name__ == "__main__":
    print(f"Starting simulation for {len(DEVICE_TOKENS)} devices...")
    
    while True:
        for idx, token in enumerate(DEVICE_TOKENS):
            # We skip if the token hasn't been replaced yet
            if "REPLACE" in token:
                continue
                
            send_telemetry(token, idx)
            
        # Wait before the next round of updates
        print("-" * 30)
        time.sleep(2)