'use strict';

function selectTopSignalLabels(weightedSignals) {
  return weightedSignals
    .filter(item => item.weight > 0 && Number.isFinite(item.score))
    .map(item => ({
      ...item,
      contribution: item.weight * item.score,
    }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
    .map(item => item.label);
}

function buildRationale({ profile, trendScore, momentum20Score, momentum60Score, momentum120Score, rsiScore, breakoutScore }) {
  const weightedSignals = [
    { label: 'Trendstruktur', weight: profile.weights.trend || 0, score: trendScore },
    { label: '1-Monats-Momentum', weight: profile.weights.momentum20 || 0, score: momentum20Score },
    { label: '3-Monats-Momentum', weight: profile.weights.momentum60 || 0, score: momentum60Score },
    { label: '6-Monats-Momentum', weight: profile.weights.momentum120 || 0, score: momentum120Score },
    { label: 'RSI-Regime', weight: profile.weights.rsi || 0, score: rsiScore },
    { label: 'Naehe zum 60T-Hoch', weight: profile.weights.breakout || 0, score: breakoutScore },
  ];

  const labels = selectTopSignalLabels(weightedSignals);
  if (labels.length === 0) {
    return 'Keine klare technische Begruendung verfuegbar.';
  }

  return `${profile.label}: staerkste Treiber sind ${labels.join(' und ')}.`;
}

function buildSellRationale({
  sellProfile,
  trendScore,
  momentum20Score,
  momentum60Score,
  momentum120Score,
  rsiScore,
  breakdownScore,
}) {
  const weightedSignals = [
    { label: 'Abwaertstrend', weight: sellProfile.weights.trend || 0, score: trendScore },
    { label: 'Schwaches 1M-Momentum', weight: sellProfile.weights.momentum20 || 0, score: momentum20Score },
    { label: 'Schwaches 3M-Momentum', weight: sellProfile.weights.momentum60 || 0, score: momentum60Score },
    { label: 'Schwaches 6M-Momentum', weight: sellProfile.weights.momentum120 || 0, score: momentum120Score },
    { label: 'Bearishes RSI-Regime', weight: sellProfile.weights.rsi || 0, score: rsiScore },
    { label: 'Abstand zum 60T-Hoch', weight: sellProfile.weights.breakdown || 0, score: breakdownScore },
  ];

  const labels = selectTopSignalLabels(weightedSignals);
  if (labels.length === 0) {
    return 'Keine klare technische Begruendung verfuegbar.';
  }

  return `Verkaufskandidat: staerkste Treiber sind ${labels.join(' und ')}.`;
}

module.exports = {
  buildRationale,
  buildSellRationale,
};
