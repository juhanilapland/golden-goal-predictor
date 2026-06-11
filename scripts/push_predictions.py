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
# Swap "-dev" for the production URL (remove "-dev") once you publish.
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


def predict(home: str, away: str) -> tuple[str, float, dict[str, float]]:
    """Replace with your trained logistic regression.

    Should return (pick, confidence, probs) where:
      - pick   in {"home", "draw", "away"}
      - confidence is the probability of the chosen pick (0-1)
      - probs  is {"home": p1, "draw": p2, "away": p3} summing to ~1.0
    """
    # Example stub — replace with real model output
    probs = {
        "home": round(random.uniform(0.2, 0.6), 4),
        "draw": round(random.uniform(0.15, 0.35), 4),
        "away": round(random.uniform(0.2, 0.6), 4),
    }
    # Normalise so they sum to exactly 1.0
    total = sum(probs.values())
    probs = {k: round(v / total, 4) for k, v in probs.items()}

    pick = max(probs, key=probs.get)  # type: ignore[arg-type]
    confidence = probs[pick]
    return pick, confidence, probs


def main() -> None:
    predictions = []
    for m in MATCHES:
        pick, conf, probs = predict(m["home_team"], m["away_team"])
        predictions.append(
            {
                "match_id": m["id"],
                "pick": pick,
                "confidence": conf,
                "prob_home": probs["home"],
                "prob_draw": probs["draw"],
                "prob_away": probs["away"],
                "reasoning": f"local logreg: {m['home_team']} vs {m['away_team']}",
            }
        )

    res = requests.post(ENDPOINT, json={"predictions": predictions}, timeout=15)
    print(res.status_code, res.text)
    res.raise_for_status()


if __name__ == "__main__":
    main()
