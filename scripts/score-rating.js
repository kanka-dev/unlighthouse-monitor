// Lighthouse classifies the displayed category score on a 0–100 scale.
const ratings = {
  good: { emoji: "🟢", color: "#15803d", label: "90–100" },
  average: { emoji: "🟠", color: "#b45309", label: "50–89" },
  poor: { emoji: "🔴", color: "#b91c1c", label: "0–49" },
  missing: { emoji: "⚪", color: "#6b7280", label: "no data" },
};

function scoreRating(score) {
  if (score == null) return ratings.missing;
  if (score >= 90) return ratings.good;
  if (score >= 50) return ratings.average;
  return ratings.poor;
}

module.exports = { ratings, scoreRating };
