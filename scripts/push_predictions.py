"""
Push Quincy Quant's predictions from a locally-trained model into Lovable.

Usage:
    pip install requests
    python scripts/push_predictions.py

Replace `predict()` with your real sklearn / PyTorch model. The endpoint
upserts on (match_id, predictor), so re-running this overwrites prior picks.
"""

import random
import requests

# Stable preview URL (won't change if the project is renamed).
# Swap "-dev" out for the published URL once you publish.
ENDPOINT = (
    "https://project--2140653b-7389-4ba2-a831-55070ace4acf-dev.lovable.app"
    "/api/public/quant-predictions"
)

# In a real workflow you'd fetch the upcoming fixtures from your DB or a public
# Lovable endpoint. Hardcoded here for the example.
MATCHES = [
    {"id": 1, "home_team": "Argentina", "away_team": "Brazil"},
    {"id": 2, "home_team": "France", "away_team": "Germany"},
]


def predict(home: str, away: str) -> tuple[str, float]:
    """Replace with your trained logistic regression.

    Should return (pick, confidence) where pick in {"home", "draw", "away"}.
    """
    pick = random.choice(["home", "draw", "away"])
    confidence = round(random.uniform(0.35, 0.75), 2)
    return pick, confidence


def main() -> None:
    predictions = []
    for m in MATCHES:
        pick, conf = predict(m["home_team"], m["away_team"])
        predictions.append(
            {
                "match_id": m["id"],
                "pick": pick,
                "confidence": conf,
                "reasoning": f"local logreg: {m['home_team']} vs {m['away_team']}",
            }
        )

    res = requests.post(ENDPOINT, json={"predictions": predictions}, timeout=15)
    print(res.status_code, res.text)
    res.raise_for_status()


if __name__ == "__main__":
    main()
