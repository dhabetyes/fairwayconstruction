/**
 * Storm Lead Generator — Main Application
 *
 * Orchestrates storm detection, income overlay, parcel lookup, and lead scoring.
 */
(function() {
  'use strict';

  // Application state
  var state = {
    alerts: [],
    filteredAlerts: [],
    stormLayers: [],
    selectedAlert: null,
    incomeData: null,
    tractBoundaries: null,
    scoredParcels: [],
    isLoading: false,
    censusLoaded: false,
    useDemoData: true // Use demo parcels until assessor proxy is configured
  };

  // DOM references
  var dom = {};

  /**
   * Initialize the application
   */
  function init() {
    _cacheDom();
    MapManager.init();
    _bindEvents();
    _setStatus('loading', 'Loading Census data…');

    // Pre-load Census income data and tract boundaries
    Promise.all([
      CensusService.fetchIncomeData(),
      CensusService.fetchTractBoundaries()
    ])
    .then(function(results) {
      state.incomeData = results[0];
      state.tractBoundaries = results[1];
      state.censusLoaded = true;

      var tractCount = Object.keys(state.incomeData).length;
      _setStatus('active', 'Ready — ' + tractCount + ' tracts loaded');
      _showToast('Census data loaded: ' + tractCount + ' tracts in Maricopa County', 'success');
    })
    .catch(function(err) {
      console.error('Census data load failed:', err);
      _setStatus('error', 'Census data unavailable');
      _showToast('Could not load Census data. Income overlay will be disabled.', 'error');
    });
  }

  function _cacheDom() {
    dom.fetchBtn = document.getElementById('fetchAlerts');
    dom.timeRange = document.getElementById('timeRange');
    dom.severityFilter = document.getElementById('severityFilter');
    dom.eventFilter = document.getElementById('eventFilter');
    dom.incomeThreshold = document.getElementById('incomeThreshold');
    dom.propertyValueMin = document.getElementById('propertyValueMin');
    dom.ownerOccupiedOnly = document.getElementById('ownerOccupiedOnly');
    dom.showIncomeOverlay = document.getElementById('showIncomeOverlay');
    dom.exportBtn = document.getElementById('exportCsv');
    dom.sidebarToggle = document.getElementById('sidebarToggle');
    dom.sidebar = document.getElementById('sidebar');
    dom.statusDot = document.querySelector('.status-dot');
    dom.statusText = document.querySelector('.status-text');
    dom.statAlerts = document.getElementById('statAlerts');
    dom.statTracts = document.getElementById('statTracts');
    dom.statParcels = document.getElementById('statParcels');
    dom.statLeads = document.getElementById('statLeads');
    dom.leadPanel = document.getElementById('leadPanel');
    dom.leadPanelTitle = document.getElementById('leadPanelTitle');
    dom.leadPanelBody = document.getElementById('leadPanelBody');
    dom.leadPanelClose = document.getElementById('leadPanelClose');
    dom.alertList = document.getElementById('alertList');
  }

  function _bindEvents() {
    dom.fetchBtn.addEventListener('click', _handleFetchAlerts);
    dom.exportBtn.addEventListener('click', _handleExport);
    dom.showIncomeOverlay.addEventListener('change', function() {
      MapManager.toggleIncomeOverlay(this.checked);
    });
    dom.sidebarToggle.addEventListener('click', function() {
      dom.sidebar.classList.toggle('open');
    });
    dom.leadPanelClose.addEventListener('click', function() {
      dom.leadPanel.classList.remove('open');
    });
    dom.leadPanel.querySelector('.lead-panel-header').addEventListener('click', function(e) {
      if (e.target === dom.leadPanelClose) return;
      dom.leadPanel.classList.toggle('open');
    });

    // Delegate click for "Analyze This Storm" buttons in popups
    document.addEventListener('click', function(e) {
      if (e.target.classList.contains('analyze-storm-btn')) {
        var alertId = e.target.getAttribute('data-alert-id');
        _analyzeStorm(alertId);
      }
    });
  }

  /**
   * Fetch storm alerts from NWS
   */
  function _handleFetchAlerts() {
    var range = dom.timeRange.value;
    var severity = dom.severityFilter.value;
    var eventTypes = Array.from(dom.eventFilter.querySelectorAll('input[type="checkbox"]:checked'))
      .map(function(cb) { return cb.value; });

    _setStatus('loading', 'Fetching storm data…');
    dom.fetchBtn.disabled = true;
    MapManager.clearAll();

    WeatherService.fetchAlertsByTimeRange(range)
      .then(function(alerts) {
        state.alerts = alerts;

        // Apply filters
        var filtered = WeatherService.filterBySeverity(alerts, severity);
        filtered = WeatherService.filterByEventType(filtered, eventTypes);
        state.filteredAlerts = filtered;

        // Update stats
        dom.statAlerts.textContent = filtered.length;

        if (filtered.length === 0) {
          _setStatus('active', 'No matching alerts found');
          _showToast(
            'No ' + severity + ' alerts found for the last ' + range +
            '. Try broadening your filters.', 'error'
          );
          dom.fetchBtn.disabled = false;
          return;
        }

        // Add to map
        state.stormLayers = MapManager.addStormAlerts(filtered);
        _buildAlertList(filtered);

        // Show income overlay if Census data is loaded
        if (state.censusLoaded && dom.showIncomeOverlay.checked) {
          _showIncomeForBounds(MapManager.getMap().getBounds());
        }

        _setStatus('active', filtered.length + ' alert(s) displayed');
        _showToast(filtered.length + ' storm alert(s) loaded. Click a polygon to analyze.', 'success');
        dom.fetchBtn.disabled = false;
      })
      .catch(function(err) {
        console.error('Alert fetch failed:', err);
        _setStatus('error', 'Fetch failed');
        _showToast('Could not fetch storm alerts: ' + err.message, 'error');
        dom.fetchBtn.disabled = false;
      });
  }

  /**
   * Analyze a specific storm polygon — the core workflow
   */
  function _analyzeStorm(alertId) {
    var alert = state.filteredAlerts.find(function(a) { return a.id === alertId; });
    if (!alert) return;

    state.selectedAlert = alert;
    _setStatus('loading', 'Analyzing storm impact…');

    var bounds = MapManager.getAlertBounds(alert);
    if (!bounds) {
      _showToast('Could not determine storm boundaries.', 'error');
      return;
    }

    // Close the popup
    MapManager.getMap().closePopup();

    // Step 1: Show income overlay for the storm area
    var incomeThreshold = parseInt(dom.incomeThreshold.value, 10) || 0;
    var matchingTracts = [];

    if (state.censusLoaded) {
      matchingTracts = CensusService.getTractsInBounds(bounds, incomeThreshold);
      MapManager.addIncomeOverlay(matchingTracts);
      dom.statTracts.textContent = matchingTracts.length;
    }

    // Step 2: Get parcels in the storm area
    _fetchParcelsForBounds(bounds, alert, matchingTracts);
  }

  /**
   * Fetch and score parcels within storm bounds
   */
  function _fetchParcelsForBounds(bounds, alert, tracts) {
    var minPropertyValue = parseInt(dom.propertyValueMin.value, 10) || 0;
    var ownerOccupiedOnly = dom.ownerOccupiedOnly.checked;

    // Try real assessor API first, fall back to demo data
    var parcelPromise;
    if (state.useDemoData) {
      // Generate demo data centered on the storm area
      var parcels = ParcelService.generateDemoParcels(bounds, 80);
      parcelPromise = Promise.resolve(parcels);
    } else {
      parcelPromise = ParcelService.searchInBounds(bounds)
        .catch(function(err) {
          console.warn('Assessor API unavailable, using demo data:', err);
          return ParcelService.generateDemoParcels(bounds, 80);
        });
    }

    parcelPromise.then(function(parcels) {
      // Filter by property value
      if (minPropertyValue > 0) {
        parcels = parcels.filter(function(p) {
          return p.assessedValue >= minPropertyValue;
        });
      }

      // Filter by owner-occupied
      if (ownerOccupiedOnly) {
        parcels = parcels.filter(function(p) {
          return p.isOwnerOccupied;
        });
      }

      dom.statParcels.textContent = parcels.length;

      // Step 3: Score and rank
      var scored = ScoringService.rankParcels(parcels, alert, state.incomeData);
      state.scoredParcels = scored;

      // Count high-quality leads (score >= 50)
      var leadCount = scored.filter(function(s) { return s.score.total >= 50; }).length;
      dom.statLeads.textContent = leadCount;

      // Add markers to map
      MapManager.addParcelMarkers(scored, _handleParcelClick);

      // Enable export
      dom.exportBtn.disabled = scored.length === 0;

      _setStatus('active', parcels.length + ' parcels scored, ' + leadCount + ' leads');
      _showToast(
        'Analysis complete: ' + leadCount + ' high-value leads identified from ' +
        parcels.length + ' parcels.',
        'success'
      );
    });
  }

  /**
   * Show income overlay for current map bounds
   */
  function _showIncomeForBounds(bounds) {
    if (!state.censusLoaded) return;
    var incomeThreshold = parseInt(dom.incomeThreshold.value, 10) || 0;
    var tracts = CensusService.getTractsInBounds(bounds, incomeThreshold);
    MapManager.addIncomeOverlay(tracts);
    dom.statTracts.textContent = tracts.length;
  }

  /**
   * Handle click on a parcel marker
   */
  function _handleParcelClick(scoredParcel) {
    var parcel = scoredParcel.parcel;
    var score = scoredParcel.score;
    var tier = ScoringService.getScoreTier(score.total);

    MapManager.highlightParcel(parcel);

    dom.leadPanelTitle.textContent = parcel.propertyAddress.split(',')[0] || 'Parcel Details';
    dom.leadPanelBody.innerHTML = _buildLeadDetail(parcel, score, tier, scoredParcel.tractIncome);
    dom.leadPanel.classList.add('open');
  }

  /**
   * Build lead detail HTML for the panel
   */
  function _buildLeadDetail(parcel, score, tier, tractIncome) {
    var html = '<div class="lead-detail">';

    // Score
    html += '<div class="lead-field full-width">';
    html += '<span class="lead-field-label">Lead Score</span>';
    html += '<div class="lead-score score-' + tier + '">';
    html += '<strong style="font-size:20px;color:' + ScoringService.getScoreColor(score.total) + '">' +
      score.total + '/100</strong>';
    html += '<div class="score-bar"><div class="score-fill" style="width:' + score.total + '%"></div></div>';
    html += '</div>';
    html += '</div>';

    // Address
    html += _field('Address', parcel.propertyAddress, true);

    // Owner
    html += _field('Owner', parcel.ownerName);
    html += _field('Owner Occupied', parcel.isOwnerOccupied ? 'Yes' : 'No (likely rental)');

    // Property details
    html += _field('Assessed Value', ParcelService.formatValue(parcel.assessedValue));
    html += _field('Year Built', parcel.yearBuilt || 'N/A');
    html += _field('Sq Ft', parcel.sqft ? parcel.sqft.toLocaleString() : 'N/A');
    html += _field('Property Type', parcel.propertyType || 'N/A');
    html += _field('APN', parcel.apn);

    // Tract income
    if (tractIncome) {
      html += _field('Tract Median Income', CensusService.formatIncome(tractIncome));
    }

    // Score breakdown
    html += '<div class="lead-field full-width" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">';
    html += '<span class="lead-field-label">Score Breakdown</span>';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">';
    html += 'Storm: ' + score.breakdown.storm + ' | ';
    html += 'Income: ' + score.breakdown.income + ' | ';
    html += 'Value: ' + score.breakdown.propertyValue + ' | ';
    html += 'Owner: ' + score.breakdown.ownerOccupied;
    html += '</div></div>';

    html += '</div>';
    return html;
  }

  function _field(label, value, fullWidth) {
    return '<div class="lead-field' + (fullWidth ? ' full-width' : '') + '">' +
      '<span class="lead-field-label">' + label + '</span>' +
      '<span class="lead-field-value">' + _escapeHtml(String(value)) + '</span>' +
      '</div>';
  }

  /**
   * Build alert list in sidebar
   */
  function _buildAlertList(alerts) {
    var html = '';
    alerts.forEach(function(alert) {
      var p = alert.properties;
      html += '<div class="alert-item" data-alert-id="' + _escapeHtml(alert.id) + '">';
      html += '<div class="alert-item-header">';
      html += '<span class="alert-item-title">' + _escapeHtml(p.event) + '</span>';
      html += '<span class="severity-badge severity-' + p.severity + '">' + p.severity + '</span>';
      html += '</div>';
      html += '<div class="alert-item-time">' + WeatherService.formatAlertTime(p.onset) + '</div>';
      if (p.areaDesc) {
        html += '<div class="alert-item-desc">' + _escapeHtml(p.areaDesc.substring(0, 100)) + '</div>';
      }
      html += '</div>';
    });
    dom.alertList.innerHTML = html;

    // Bind click events on alert items
    var items = dom.alertList.querySelectorAll('.alert-item');
    items.forEach(function(item) {
      item.addEventListener('click', function() {
        var alertId = this.getAttribute('data-alert-id');
        _analyzeStorm(alertId);
      });
    });
  }

  /**
   * Handle CSV export
   */
  function _handleExport() {
    if (state.scoredParcels.length === 0) return;

    var csv = ScoringService.exportCsv(state.scoredParcels, state.selectedAlert);

    var alertName = state.selectedAlert
      ? state.selectedAlert.properties.event.replace(/\s+/g, '-').toLowerCase()
      : 'storm';
    var filename = 'leads-' + alertName + '-' + new Date().toISOString().slice(0, 10) + '.csv';

    ScoringService.downloadCsv(csv, filename);
    _showToast('Exported ' + state.scoredParcels.length + ' leads to ' + filename, 'success');
  }

  /**
   * Set status indicator
   */
  function _setStatus(type, text) {
    dom.statusDot.className = 'status-dot ' + type;
    dom.statusText.textContent = text;
  }

  /**
   * Show a toast notification
   */
  function _showToast(message, type) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function() { toast.remove(); }, 300);
    }, 4000);
  }

  function _escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
