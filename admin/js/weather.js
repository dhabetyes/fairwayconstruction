/**
 * Storm Lead Generator — NWS Weather API Module
 *
 * Fetches severe weather alerts from the National Weather Service API.
 * Returns GeoJSON features with storm polygons.
 */
var WeatherService = (function() {
  'use strict';

  var headers = {
    'Accept': 'application/geo+json',
    'User-Agent': StormConfig.nwsUserAgent
  };

  /**
   * Fetch active alerts for Arizona (or a specific zone/area)
   */
  function fetchActiveAlerts() {
    var url = StormConfig.nwsBaseUrl + '/alerts/active?area=AZ';
    return _fetchAlerts(url);
  }

  /**
   * Fetch alerts within a time range
   * NWS API keeps alerts for the last 7 days
   */
  function fetchAlertsByTimeRange(range) {
    var now = new Date();
    var start;

    switch (range) {
      case 'active':
        return fetchActiveAlerts();
      case '24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '72h':
        start = new Date(now.getTime() - 72 * 60 * 60 * 1000);
        break;
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    var url = StormConfig.nwsBaseUrl + '/alerts?area=AZ&start=' +
      start.toISOString();
    return _fetchAlerts(url);
  }

  /**
   * Core fetch + filter logic
   */
  function _fetchAlerts(url) {
    return fetch(url, { headers: headers })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('NWS API returned ' + response.status);
        }
        return response.json();
      })
      .then(function(geojson) {
        // Filter to events containing any relevant keyword
        var features = (geojson.features || []).filter(function(f) {
          var event = (f.properties.event || '').toLowerCase();
          return StormConfig.relevantKeywords.some(function(kw) {
            return event.indexOf(kw) !== -1;
          });
        });

        return features.map(function(f) {
          return _normalizeAlert(f);
        });
      });
  }

  /**
   * Normalize an NWS alert feature into a consistent shape
   */
  function _normalizeAlert(feature) {
    var props = feature.properties;
    var severity = (props.severity || 'unknown').toLowerCase();
    var parameters = props.parameters || {};

    // Extract hail and wind info from parameters
    var hailSize = null;
    var windSpeed = null;

    if (parameters.hailSize) {
      hailSize = parseFloat(parameters.hailSize[0]);
    }
    if (parameters.windGust) {
      windSpeed = parseFloat(parameters.windGust[0]);
    }
    // Also check maxHailSize and maxWindGust
    if (!hailSize && parameters.maxHailSize) {
      hailSize = parseFloat(parameters.maxHailSize[0]);
    }
    if (!windSpeed && parameters.maxWindGust) {
      windSpeed = parseFloat(parameters.maxWindGust[0]);
    }

    return {
      id: feature.id || props.id,
      type: 'storm-alert',
      geometry: feature.geometry,
      properties: {
        event: props.event,
        headline: props.headline,
        description: props.description,
        severity: severity,
        certainty: props.certainty,
        urgency: props.urgency,
        onset: props.onset,
        expires: props.expires,
        effective: props.effective,
        senderName: props.senderName,
        areaDesc: props.areaDesc,
        hailSize: hailSize,
        windSpeed: windSpeed,
        instruction: props.instruction
      }
    };
  }

  /**
   * Get the severity rank for sorting (higher = more severe)
   */
  function severityRank(severity) {
    var ranks = { extreme: 4, severe: 3, moderate: 2, minor: 1, unknown: 0 };
    return ranks[severity] || 0;
  }

  /**
   * Filter alerts by severity threshold
   */
  function filterBySeverity(alerts, minSeverity) {
    if (minSeverity === 'all') return alerts;
    var minRank = severityRank(minSeverity);
    return alerts.filter(function(a) {
      return severityRank(a.properties.severity) >= minRank;
    });
  }

  /**
   * Filter alerts by event type keyword
   */
  function filterByEventType(alerts, eventTypes) {
    if (!eventTypes || eventTypes.length === 0) return alerts;
    return alerts.filter(function(a) {
      var event = (a.properties.event || '').toLowerCase();
      return eventTypes.some(function(kw) {
        return event.indexOf(kw) !== -1;
      });
    });
  }

  /**
   * Format a date string for display
   */
  function formatAlertTime(isoString) {
    if (!isoString) return 'N/A';
    var d = new Date(isoString);
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric'
    }) + ' ' + d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit'
    });
  }

  return {
    fetchActiveAlerts: fetchActiveAlerts,
    fetchAlertsByTimeRange: fetchAlertsByTimeRange,
    filterBySeverity: filterBySeverity,
    filterByEventType: filterByEventType,
    severityRank: severityRank,
    formatAlertTime: formatAlertTime
  };
})();
