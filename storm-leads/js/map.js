/**
 * Storm Lead Generator — Map Module
 *
 * Manages the Leaflet map, storm polygon layers, income overlay, and parcel markers.
 */
var MapManager = (function() {
  'use strict';

  var _map = null;
  var _layers = {
    storms: null,
    income: null,
    parcels: null,
    selected: null
  };
  var _legend = null;

  /**
   * Initialize the Leaflet map
   */
  function init() {
    _map = L.map('map', {
      center: StormConfig.defaultCenter,
      zoom: StormConfig.defaultZoom,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer(StormConfig.tileUrl, {
      attribution: StormConfig.tileAttribution,
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(_map);

    // Initialize layer groups
    _layers.storms = L.layerGroup().addTo(_map);
    _layers.income = L.layerGroup().addTo(_map);
    _layers.parcels = L.layerGroup().addTo(_map);
    _layers.selected = L.layerGroup().addTo(_map);

    // Add income legend
    _addLegend();

    return _map;
  }

  /**
   * Get the map instance
   */
  function getMap() {
    return _map;
  }

  /**
   * Add storm alert polygons to the map
   * Returns an array of layer references for interaction
   */
  function addStormAlerts(alerts) {
    _layers.storms.clearLayers();
    var layerRefs = [];

    alerts.forEach(function(alert) {
      if (!alert.geometry) return;

      var severity = alert.properties.severity;
      var color = StormConfig.severityColors[severity] || StormConfig.severityColors.unknown;

      var geoJsonLayer = L.geoJSON(alert.geometry, {
        style: {
          color: color,
          weight: 2,
          opacity: 0.8,
          fillColor: color,
          fillOpacity: 0.15,
          dashArray: severity === 'extreme' ? null : '5, 5'
        }
      });

      // Bind popup with storm details
      var popupHtml = _buildStormPopup(alert);
      geoJsonLayer.bindPopup(popupHtml, {
        maxWidth: 300,
        className: 'storm-popup-wrapper'
      });

      // Store alert ref on the layer for click handling
      geoJsonLayer._stormAlert = alert;

      geoJsonLayer.addTo(_layers.storms);
      layerRefs.push({ layer: geoJsonLayer, alert: alert });
    });

    // Fit map to storm bounds if there are alerts
    if (layerRefs.length > 0) {
      var allBounds = _layers.storms.getBounds();
      if (allBounds.isValid()) {
        _map.fitBounds(allBounds, { padding: [40, 40] });
      }
    }

    return layerRefs;
  }

  /**
   * Build HTML popup for a storm alert
   */
  function _buildStormPopup(alert) {
    var p = alert.properties;
    var severityClass = 'severity-' + p.severity;

    var html = '<div class="storm-popup">';
    html += '<h4>' + _escapeHtml(p.event) + '</h4>';
    html += '<span class="severity-badge ' + severityClass + '">' + p.severity + '</span>';
    html += '<div class="storm-meta">';

    if (p.hailSize) {
      html += '<span><strong>Hail:</strong> ' + p.hailSize + ' in</span>';
    }
    if (p.windSpeed) {
      html += '<span><strong>Wind:</strong> ' + p.windSpeed + ' mph</span>';
    }
    if (p.onset) {
      html += '<span><strong>Onset:</strong> ' + WeatherService.formatAlertTime(p.onset) + '</span>';
    }
    if (p.expires) {
      html += '<span><strong>Expires:</strong> ' + WeatherService.formatAlertTime(p.expires) + '</span>';
    }
    if (p.areaDesc) {
      html += '<span><strong>Area:</strong> ' + _escapeHtml(p.areaDesc.substring(0, 120)) + '</span>';
    }

    html += '</div>';
    html += '<div class="storm-action">';
    html += '<button class="btn btn-primary btn-sm analyze-storm-btn" data-alert-id="' +
      _escapeHtml(alert.id) + '">Analyze This Storm</button>';
    html += '</div>';
    html += '</div>';

    return html;
  }

  /**
   * Add Census tract income overlay to the map
   */
  function addIncomeOverlay(tracts) {
    _layers.income.clearLayers();

    tracts.forEach(function(tract) {
      if (!tract.feature || !tract.feature.geometry) return;

      var color = CensusService.getIncomeColor(tract.income);
      var opacity = CensusService.getIncomeOpacity(tract.income);

      var layer = L.geoJSON(tract.feature, {
        style: {
          color: color,
          weight: 1,
          opacity: 0.4,
          fillColor: color,
          fillOpacity: opacity
        }
      });

      layer.bindTooltip(
        '<strong>' + CensusService.formatIncome(tract.income) + '</strong> median income<br>' +
        'Tract ' + tract.tractId,
        { sticky: true, className: 'income-tooltip' }
      );

      layer.addTo(_layers.income);
    });
  }

  /**
   * Toggle income overlay visibility
   */
  function toggleIncomeOverlay(visible) {
    if (visible) {
      _map.addLayer(_layers.income);
    } else {
      _map.removeLayer(_layers.income);
    }
  }

  /**
   * Add scored parcel markers to the map
   */
  function addParcelMarkers(scoredParcels, onClickCallback) {
    _layers.parcels.clearLayers();

    scoredParcels.forEach(function(item) {
      var parcel = item.parcel;
      var score = item.score;

      if (!parcel.lat || !parcel.lng) return;

      var color = ScoringService.getScoreColor(score.total);
      var radius = _markerRadius(score.total);

      var marker = L.circleMarker([parcel.lat, parcel.lng], {
        radius: radius,
        fillColor: color,
        color: color,
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.6
      });

      marker.bindTooltip(
        '<strong>Score: ' + score.total + '</strong><br>' +
        _escapeHtml(parcel.propertyAddress.split(',')[0]) + '<br>' +
        ParcelService.formatValue(parcel.assessedValue),
        { className: 'parcel-tooltip' }
      );

      if (onClickCallback) {
        marker.on('click', function() {
          onClickCallback(item);
        });
      }

      marker.addTo(_layers.parcels);
    });
  }

  /**
   * Highlight a selected parcel
   */
  function highlightParcel(parcel) {
    _layers.selected.clearLayers();

    if (!parcel || !parcel.lat || !parcel.lng) return;

    L.circleMarker([parcel.lat, parcel.lng], {
      radius: 12,
      fillColor: '#fff',
      color: '#4f8cff',
      weight: 3,
      opacity: 1,
      fillOpacity: 0.3
    }).addTo(_layers.selected);
  }

  /**
   * Get bounds of a storm alert polygon
   */
  function getAlertBounds(alert) {
    if (!alert.geometry) return null;
    var layer = L.geoJSON(alert.geometry);
    return layer.getBounds();
  }

  /**
   * Clear all layers
   */
  function clearAll() {
    _layers.storms.clearLayers();
    _layers.income.clearLayers();
    _layers.parcels.clearLayers();
    _layers.selected.clearLayers();
  }

  /**
   * Clear parcel markers only
   */
  function clearParcels() {
    _layers.parcels.clearLayers();
    _layers.selected.clearLayers();
  }

  function _markerRadius(score) {
    if (score >= 75) return 8;
    if (score >= 50) return 6;
    return 5;
  }

  function _addLegend() {
    _legend = L.control({ position: 'bottomright' });
    _legend.onAdd = function() {
      var div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML =
        '<h4>Income Overlay</h4>' +
        '<div class="legend-item"><span class="legend-swatch" style="background:#ffd700;opacity:0.6"></span> $150k+</div>' +
        '<div class="legend-item"><span class="legend-swatch" style="background:#4ade80;opacity:0.5"></span> $100k–$150k</div>' +
        '<div class="legend-item"><span class="legend-swatch" style="background:#4f8cff;opacity:0.4"></span> $75k–$100k</div>' +
        '<div class="legend-item"><span class="legend-swatch" style="background:#2e3348;opacity:0.3"></span> &lt; $75k</div>' +
        '<h4 style="margin-top:8px">Lead Score</h4>' +
        '<div class="legend-item"><span class="legend-swatch" style="background:#4ade80;border-radius:50%"></span> High (75+)</div>' +
        '<div class="legend-item"><span class="legend-swatch" style="background:#ffb84d;border-radius:50%"></span> Medium (50-74)</div>' +
        '<div class="legend-item"><span class="legend-swatch" style="background:#ff5c5c;border-radius:50%"></span> Low (&lt;50)</div>';
      return div;
    };
    _legend.addTo(_map);
  }

  function _escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init: init,
    getMap: getMap,
    addStormAlerts: addStormAlerts,
    addIncomeOverlay: addIncomeOverlay,
    toggleIncomeOverlay: toggleIncomeOverlay,
    addParcelMarkers: addParcelMarkers,
    highlightParcel: highlightParcel,
    getAlertBounds: getAlertBounds,
    clearAll: clearAll,
    clearParcels: clearParcels
  };
})();
