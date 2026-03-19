/**
 * Storm Lead Generator — Census/ACS Income Data Module
 *
 * Fetches median household income by tract from the Census ACS API.
 * Uses the TIGERweb service for tract boundary GeoJSON.
 */
var CensusService = (function() {
  'use strict';

  // Cache for tract income data
  var _incomeData = null;
  var _tractGeoJson = null;

  /**
   * Fetch median household income for all tracts in Maricopa County
   * Returns: { "tractId": { income: number, population: number } }
   */
  function fetchIncomeData() {
    if (_incomeData) {
      return Promise.resolve(_incomeData);
    }

    var url = StormConfig.censusBaseUrl + '/' + StormConfig.censusDataset +
      '?get=' + StormConfig.censusIncomeVar + ',' + StormConfig.censusPopVar + ',NAME' +
      '&for=tract:*' +
      '&in=state:' + StormConfig.stateFips +
      '+county:' + StormConfig.countyFips;

    return fetch(url)
      .then(function(response) {
        if (!response.ok) throw new Error('Census API returned ' + response.status);
        return response.json();
      })
      .then(function(data) {
        // First row is headers, rest is data
        var headers = data[0];
        var incomeIdx = headers.indexOf(StormConfig.censusIncomeVar);
        var popIdx = headers.indexOf(StormConfig.censusPopVar);
        var tractIdx = headers.indexOf('tract');

        var result = {};
        for (var i = 1; i < data.length; i++) {
          var row = data[i];
          var tractId = row[tractIdx];
          var income = parseInt(row[incomeIdx], 10);
          var pop = parseInt(row[popIdx], 10);

          if (!isNaN(income) && income > 0) {
            result[tractId] = {
              income: income,
              population: pop,
              name: row[headers.indexOf('NAME')] || '',
              tractId: tractId,
              fullFips: StormConfig.stateFips + StormConfig.countyFips + tractId
            };
          }
        }

        _incomeData = result;
        return result;
      });
  }

  /**
   * Fetch tract boundary GeoJSON from TIGERweb
   * Uses the ACS tract boundaries WMS/feature service
   */
  function fetchTractBoundaries() {
    if (_tractGeoJson) {
      return Promise.resolve(_tractGeoJson);
    }

    // TIGERweb REST service for Census Tracts
    // We query for Maricopa County tracts using the FIPS filter
    var url = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2023/MapServer/8/query' +
      '?where=STATE%3D%27' + StormConfig.stateFips + '%27+AND+COUNTY%3D%27' + StormConfig.countyFips + '%27' +
      '&outFields=TRACT,GEOID,BASENAME,AREALAND' +
      '&outSR=4326' +
      '&f=geojson' +
      '&returnGeometry=true';

    return fetch(url)
      .then(function(response) {
        if (!response.ok) throw new Error('TIGERweb returned ' + response.status);
        return response.json();
      })
      .then(function(geojson) {
        _tractGeoJson = geojson;
        return geojson;
      });
  }

  /**
   * Get income tier for a given income value
   */
  function getIncomeTier(income) {
    var tiers = StormConfig.incomeTiers;
    if (income >= tiers.veryHigh) return 'very-high';
    if (income >= tiers.high) return 'high';
    if (income >= tiers.medium) return 'medium';
    return 'low';
  }

  /**
   * Color for income tier (map overlay)
   */
  function getIncomeColor(income) {
    var tier = getIncomeTier(income);
    var colors = {
      'very-high': '#ffd700',
      'high': '#4ade80',
      'medium': '#4f8cff',
      'low': '#2e3348'
    };
    return colors[tier] || colors.low;
  }

  /**
   * Opacity for income tier
   */
  function getIncomeOpacity(income) {
    var tier = getIncomeTier(income);
    var opacities = {
      'very-high': 0.3,
      'high': 0.22,
      'medium': 0.15,
      'low': 0.05
    };
    return opacities[tier] || 0.05;
  }

  /**
   * Format income as currency
   */
  function formatIncome(income) {
    if (!income || income <= 0) return 'N/A';
    return '$' + income.toLocaleString('en-US');
  }

  /**
   * Get tracts that intersect with a given polygon (bounding box check)
   * Uses Leaflet's latLngBounds for a fast bbox intersection test.
   * Full polygon intersection would require Turf.js — bbox is sufficient for MVP.
   */
  function getTractsInBounds(bounds, incomeThreshold) {
    if (!_tractGeoJson || !_incomeData) {
      return [];
    }

    var results = [];
    var features = _tractGeoJson.features || [];

    for (var i = 0; i < features.length; i++) {
      var feature = features[i];
      var tractId = feature.properties.TRACT;
      var incomeInfo = _incomeData[tractId];

      if (!incomeInfo) continue;
      if (incomeThreshold && incomeInfo.income < incomeThreshold) continue;

      // Check if any point of the tract is within the bounds
      var coords = _extractCoords(feature.geometry);
      var intersects = coords.some(function(coord) {
        return bounds.contains([coord[1], coord[0]]);
      });

      if (intersects) {
        results.push({
          feature: feature,
          income: incomeInfo.income,
          population: incomeInfo.population,
          tractId: tractId,
          tier: getIncomeTier(incomeInfo.income)
        });
      }
    }

    return results;
  }

  /**
   * Extract flat coordinate array from GeoJSON geometry
   */
  function _extractCoords(geometry) {
    if (!geometry || !geometry.coordinates) return [];

    if (geometry.type === 'Polygon') {
      return geometry.coordinates[0]; // outer ring
    } else if (geometry.type === 'MultiPolygon') {
      var coords = [];
      for (var i = 0; i < geometry.coordinates.length; i++) {
        coords = coords.concat(geometry.coordinates[i][0]);
      }
      return coords;
    }
    return [];
  }

  return {
    fetchIncomeData: fetchIncomeData,
    fetchTractBoundaries: fetchTractBoundaries,
    getIncomeTier: getIncomeTier,
    getIncomeColor: getIncomeColor,
    getIncomeOpacity: getIncomeOpacity,
    formatIncome: formatIncome,
    getTractsInBounds: getTractsInBounds
  };
})();
