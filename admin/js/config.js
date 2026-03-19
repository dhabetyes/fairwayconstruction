/**
 * Storm Lead Generator — Configuration
 */
var StormConfig = (function() {
  'use strict';

  return {
    // Phoenix metro center
    defaultCenter: [33.4484, -112.0740],
    defaultZoom: 10,

    // Maricopa County FIPS
    stateFips: '04',
    countyFips: '013',

    // NWS API
    nwsBaseUrl: 'https://api.weather.gov',
    nwsUserAgent: '(FairwayConstructionStormLeads, info@fairwayconstructionaz.com)',

    // Census API
    censusBaseUrl: 'https://api.census.gov/data',
    censusDataset: '2023/acs/acs5', // 5-year ACS estimates
    censusIncomeVar: 'B19013_001E', // Median household income
    censusIncomeMargin: 'B19013_001M', // Margin of error
    censusPopVar: 'B01001_001E', // Total population

    // Maricopa Assessor API
    assessorBaseUrl: 'api/assessor.php', // Local proxy

    // Map tiles — CartoDB dark matter (free, no key)
    tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',

    // Scoring weights
    scoring: {
      stormSeverityWeight: 0.3,
      incomeWeight: 0.25,
      propertyValueWeight: 0.25,
      ownerOccupiedWeight: 0.2
    },

    // Income tier thresholds
    incomeTiers: {
      low: 50000,
      medium: 75000,
      high: 100000,
      veryHigh: 150000
    },

    // Storm polygon colors by severity
    severityColors: {
      extreme: '#ff5c5c',
      severe: '#ffb84d',
      moderate: '#4f8cff',
      minor: '#4ade80',
      unknown: '#8b90a8'
    },

    // Keywords matched against NWS event names (case-insensitive)
    relevantKeywords: ['wind', 'hail', 'storm', 'thunderstorm', 'tornado'],

    // Hail size thresholds (inches)
    hailThresholds: {
      minor: 0.75,
      moderate: 1.0,
      severe: 1.5,
      destructive: 2.0
    }
  };
})();
