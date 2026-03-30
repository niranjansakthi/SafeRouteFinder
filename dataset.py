import numpy as np
import pandas as pd

# number of samples
n = 3000

# generate features
lat = np.random.uniform(10.9, 11.1, n)  # around Tamil Nadu region
lon = np.random.uniform(78.5, 78.7, n)

time_of_day = np.random.randint(0, 24, n)  # 0–23 hours
lighting = np.random.uniform(0, 1, n)      # 0 (dark) → 1 (bright)
crowd = np.random.uniform(0, 1, n)         # 0 (empty) → 1 (crowded)
crime = np.random.uniform(0, 1, n)         # 0 (safe) → 1 (danger)
weather = np.random.uniform(0, 1, n)       # 0 (clear) → 1 (bad)

# generate risk based on logic
risk = []
for i in range(n):
    if (
        crime[i] > 0.6 or
        (time_of_day[i] > 20 and lighting[i] < 0.4) or
        (crowd[i] < 0.3 and crime[i] > 0.5)
    ):
        risk.append(1)
    else:
        risk.append(0)

# create dataframe
df = pd.DataFrame({
    "lat": lat,
    "lon": lon,
    "time": time_of_day,
    "lighting": lighting,
    "crowd": crowd,
    "crime": crime,
    "weather": weather,
    "risk": risk
})

# save to CSV
df.to_csv("safe_route_data.csv", index=False)

print("Dataset generated successfully!")