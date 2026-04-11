'use strict';

function getStartIdxForLookback(totalLength, minValidIdx, lookbackDays) {
  if (lookbackDays == null || lookbackDays <= 0) {
    return null;
  }
  return Math.max(minValidIdx, totalLength - lookbackDays - 1);
}

module.exports = {
  getStartIdxForLookback,
};
