'use strict';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getAgeInDays(isoDateTime) {
  if (!isoDateTime) return null;

  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) return null;

  const now = new Date();
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThen = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.floor((startNow - startThen) / MS_PER_DAY);
}

function classifyFreshness(updatedAt) {
  const ageInDays = getAgeInDays(updatedAt);

  if (ageInDays == null) {
    return {
      level: 'unknown',
      label: 'Unbekannt',
      ageInDays: null,
    };
  }

  if (ageInDays <= 0) {
    return {
      level: 'very-fresh',
      label: 'Sehr aktuell',
      ageInDays,
    };
  }

  if (ageInDays <= 5) {
    return {
      level: 'acceptable',
      label: 'Geht gerade noch',
      ageInDays,
    };
  }

  return {
    level: 'stale',
    label: 'Veraltet',
    ageInDays,
  };
}

module.exports = {
  classifyFreshness,
  getAgeInDays,
};
