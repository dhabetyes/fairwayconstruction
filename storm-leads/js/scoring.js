/**
 * Storm Lead Generator — Lead Scoring & Export Module
 *
 * Scores parcels based on storm severity, income, property value, and ownership.
 * Generates ranked lead lists for canvassing routes.
 */
var ScoringService = (function() {
  'use strict';

  /**
   * Score a single parcel lead (0-100 scale)
   */
  function scoreParcel(parcel, stormAlert, tractIncome) {
    var weights = StormConfig.scoring;
    var scores = {};

    // Storm severity score (0-100)
    scores.storm = _stormScore(stormAlert);

    // Income score (0-100, based on tract median)
    scores.income = _incomeScore(tractIncome);

    // Property value score (0-100)
    scores.propertyValue = _propertyValueScore(parcel.assessedValue);

    // Owner-occupied bonus (0 or 100)
    scores.ownerOccupied = parcel.isOwnerOccupied ? 100 : 0;

    // Weighted total
    var total = Math.round(
      scores.storm * weights.stormSeverityWeight +
      scores.income * weights.incomeWeight +
      scores.propertyValue * weights.propertyValueWeight +
      scores.ownerOccupied * weights.ownerOccupiedWeight
    );

    return {
      total: Math.min(100, Math.max(0, total)),
      breakdown: scores
    };
  }

  function _stormScore(alert) {
    if (!alert) return 50;
    var sev = (alert.properties || alert).severity;
    var rank = WeatherService.severityRank(sev);
    // 0-4 rank -> 0-100 score
    var score = rank * 25;

    // Bonus for hail (very relevant to roofing)
    var hail = (alert.properties || alert).hailSize;
    if (hail) {
      if (hail >= 2.0) score += 25;
      else if (hail >= 1.5) score += 20;
      else if (hail >= 1.0) score += 15;
      else if (hail >= 0.75) score += 10;
    }

    // Bonus for high wind
    var wind = (alert.properties || alert).windSpeed;
    if (wind) {
      if (wind >= 80) score += 20;
      else if (wind >= 70) score += 15;
      else if (wind >= 60) score += 10;
    }

    return Math.min(100, score);
  }

  function _incomeScore(income) {
    if (!income || income <= 0) return 25;
    // Scale: $50k = 0, $200k+ = 100
    var normalized = (income - 50000) / 150000;
    return Math.round(Math.min(100, Math.max(0, normalized * 100)));
  }

  function _propertyValueScore(value) {
    if (!value || value <= 0) return 25;
    // Scale: $150k = 0, $800k+ = 100
    var normalized = (value - 150000) / 650000;
    return Math.round(Math.min(100, Math.max(0, normalized * 100)));
  }

  /**
   * Score and rank an array of parcels
   * Returns sorted array (highest score first) with score data attached
   */
  function rankParcels(parcels, stormAlert, incomeData) {
    var scored = parcels.map(function(parcel) {
      // Find the income for this parcel's tract (if available)
      var tractIncome = _findTractIncome(parcel, incomeData);

      var score = scoreParcel(parcel, stormAlert, tractIncome);
      return {
        parcel: parcel,
        score: score,
        tractIncome: tractIncome
      };
    });

    // Sort by total score descending
    scored.sort(function(a, b) {
      return b.score.total - a.score.total;
    });

    return scored;
  }

  /**
   * Try to match a parcel to a Census tract income value
   */
  function _findTractIncome(parcel, incomeData) {
    // In a full implementation, we'd do point-in-polygon against tract boundaries.
    // For MVP, we use a simpler approach: return the nearest tract or average.
    if (!incomeData) return null;

    var tracts = Object.values(incomeData);
    if (tracts.length === 0) return null;

    // Return average income of all matching tracts as a rough estimate
    var total = 0;
    var count = 0;
    for (var i = 0; i < tracts.length; i++) {
      if (tracts[i].income > 0) {
        total += tracts[i].income;
        count++;
      }
    }
    return count > 0 ? Math.round(total / count) : null;
  }

  /**
   * Get score tier label
   */
  function getScoreTier(score) {
    if (score >= 75) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  /**
   * Get score color for map markers
   */
  function getScoreColor(score) {
    if (score >= 75) return '#4ade80';  // green
    if (score >= 50) return '#ffb84d';  // orange
    return '#ff5c5c';                    // red
  }

  /**
   * Export scored leads as CSV
   */
  function exportCsv(scoredParcels, stormAlert) {
    var headers = [
      'Rank', 'Score', 'Address', 'Owner Name', 'Owner Occupied',
      'Assessed Value', 'Year Built', 'SqFt', 'Property Type',
      'Storm Score', 'Income Score', 'Value Score', 'APN',
      'Storm Event', 'Storm Severity', 'Latitude', 'Longitude'
    ];

    var stormEvent = stormAlert ? stormAlert.properties.event : 'N/A';
    var stormSeverity = stormAlert ? stormAlert.properties.severity : 'N/A';

    var rows = scoredParcels.map(function(item, idx) {
      var p = item.parcel;
      var s = item.score;
      return [
        idx + 1,
        s.total,
        _csvEscape(p.propertyAddress),
        _csvEscape(p.ownerName),
        p.isOwnerOccupied ? 'Yes' : 'No',
        p.assessedValue,
        p.yearBuilt,
        p.sqft,
        _csvEscape(p.propertyType),
        s.breakdown.storm,
        s.breakdown.income,
        s.breakdown.propertyValue,
        _csvEscape(p.apn),
        _csvEscape(stormEvent),
        _csvEscape(stormSeverity),
        p.lat,
        p.lng
      ].join(',');
    });

    var csv = headers.join(',') + '\n' + rows.join('\n');
    return csv;
  }

  /**
   * Trigger CSV download in the browser
   */
  function downloadCsv(csvContent, filename) {
    if (!filename) {
      filename = 'storm-leads-' + new Date().toISOString().slice(0, 10) + '.csv';
    }
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function _csvEscape(str) {
    if (str == null) return '';
    str = String(str);
    if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  return {
    scoreParcel: scoreParcel,
    rankParcels: rankParcels,
    getScoreTier: getScoreTier,
    getScoreColor: getScoreColor,
    exportCsv: exportCsv,
    downloadCsv: downloadCsv
  };
})();
