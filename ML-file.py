import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

df = pd.read_csv("safe_route_data.csv")

X = df.drop(columns=["risk", "lat", "lon"])
Y = df["risk"]

X_train, X_test, Y_train, Y_test = train_test_split(
    X, Y, test_size=0.2, random_state=0
)

model = RandomForestClassifier(n_estimators=100, random_state=0)
model.fit(X_train, Y_train)

prediction = model.predict(X_test)

accuracy = accuracy_score(Y_test, prediction) * 100
print("Accuracy:", accuracy)

# probability (important)
proba = model.predict_proba(X_test)
print("Sample risk probabilities:", proba[:5])
import joblib

joblib.dump(model, "risk_model.pkl")