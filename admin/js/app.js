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
    displayedTracts: [],
    isLoading: false,
    censusLoaded: false,
    useDemoData: false
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
    dom.summaryModal = document.getElementById('summaryModal');
    dom.summaryModalOverlay = document.getElementById('summaryModalOverlay');
    dom.summaryModalTitle = document.getElementById('summaryModalTitle');
    dom.summaryModalBody = document.getElementById('summaryModalBody');
    dom.summaryModalClose = document.getElementById('summaryModalClose');
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

    // Stat tile click handlers
    dom.summaryModalClose.addEventListener('click', _closeModal);
    dom.summaryModalOverlay.addEventListener('click', function(e) {
      if (e.target === dom.summaryModalOverlay) _closeModal();
    });

    document.getElementById('statAlerts').parentElement.addEventListener('click', function() {
      _openModal('Storm Alerts', _buildAlertsModal());
    });
    document.getElementById('statTracts').parentElement.addEventListener('click', function() {
      _openModal('Census Tracts — Income Overview', _buildTractsModal());
    });
    document.getElementById('statParcels').parentElement.addEventListener('click', function() {
      _openModal('Parcels Analyzed', _buildParcelsModal());
    });
    document.getElementById('statLeads').parentElement.addEventListener('click', function() {
      _openModal('Top Leads by Score', _buildLeadsModal());
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
        _setStatus('loading', 'Resolving zone boundaries…');
        return WeatherService.resolveZoneGeometries(alerts);
      })
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
      state.displayedTracts = matchingTracts;
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

  function _openModal(title, html) {
    if (!html) return;
    dom.summaryModalTitle.textContent = title;
    dom.summaryModalBody.innerHTML = html;
    dom.summaryModalOverlay.classList.add('open');
  }

  function _closeModal() {
    dom.summaryModalOverlay.classList.remove('open');
  }

  function _buildAlertsModal() {
    if (!state.filteredAlerts.length) return '<p class="modal-empty">No alerts loaded. Fetch storm data first.</p>';
    var zoneBased = state.filteredAlerts.filter(function(a) { return a.properties.isZoneBased; }).length;
    var html = '<p class="modal-meta">' + state.filteredAlerts.length + ' alert(s) — ' +
      zoneBased + ' zone-based, ' + (state.filteredAlerts.length - zoneBased) + ' polygon</p>';
    html += '<table class="modal-table"><thead><tr>' +
      '<th>Event</th><th>Severity</th><th>Onset</th><th>Area</th>' +
      '</tr></thead><tbody>';
    state.filteredAlerts.forEach(function(a) {
      var p = a.properties;
      html += '<tr>';
      html += '<td>' + _escapeHtml(p.event) + (p.isZoneBased ? ' <span class="zone-tag">zone</span>' : '') + '</td>';
      html += '<td><span class="severity-badge severity-' + p.severity + '">' + p.severity + '</span></td>';
      html += '<td>' + WeatherService.formatAlertTime(p.onset) + '</td>';
      html += '<td class="muted">' + _escapeHtml((p.areaDesc || '').substring(0, 80)) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function _buildTractsModal() {
    if (!state.displayedTracts.length) return '<p class="modal-empty">No tract data. Analyze a storm first.</p>';
    var sorted = state.displayedTracts.slice().sort(function(a, b) { return b.income - a.income; });
    var html = '<p class="modal-meta">' + sorted.length + ' tracts within storm area above income threshold</p>';
    html += '<table class="modal-table"><thead><tr>' +
      '<th>Tract</th><th>Median Income</th><th>Population</th>' +
      '</tr></thead><tbody>';
    sorted.slice(0, 20).forEach(function(t) {
      html += '<tr>';
      html += '<td>' + _escapeHtml(t.tractId) + '</td>';
      html += '<td>' + CensusService.formatIncome(t.income) + '</td>';
      html += '<td>' + (t.population ? t.population.toLocaleString() : '—') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function _buildParcelsModal() {
    if (!state.scoredParcels.length) return '<p class="modal-empty">No parcels. Analyze a storm first.</p>';
    var parcels = state.scoredParcels.map(function(s) { return s.parcel; });
    var avgValue = Math.round(parcels.reduce(function(sum, p) { return sum + (p.assessedValue || 0); }, 0) / parcels.length);
    var ownerPct = Math.round(parcels.filter(function(p) { return p.isOwnerOccupied; }).length / parcels.length * 100);
    var html = '<div class="modal-stats-row">';
    html += '<div class="modal-stat"><span class="modal-stat-val">' + parcels.length + '</span><span class="modal-stat-lbl">Total Parcels</span></div>';
    html += '<div class="modal-stat"><span class="modal-stat-val">' + ParcelService.formatValue(avgValue) + '</span><span class="modal-stat-lbl">Avg Assessed Value</span></div>';
    html += '<div class="modal-stat"><span class="modal-stat-val">' + ownerPct + '%</span><span class="modal-stat-lbl">Owner-Occupied</span></div>';
    html += '</div>';
    html += '<table class="modal-table"><thead><tr>' +
      '<th>Address</th><th>Value</th><th>Owner</th><th>Score</th>' +
      '</tr></thead><tbody>';
    state.scoredParcels.slice(0, 15).forEach(function(s) {
      html += '<tr>';
      html += '<td>' + _escapeHtml(s.parcel.propertyAddress.split(',')[0]) + '</td>';
      html += '<td>' + ParcelService.formatValue(s.parcel.assessedValue) + '</td>';
      html += '<td class="muted">' + _escapeHtml(s.parcel.ownerName || '—') + '</td>';
      html += '<td><strong style="color:' + ScoringService.getScoreColor(s.score.total) + '">' + s.score.total + '</strong></td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function _buildLeadsModal() {
    var leads = state.scoredParcels.filter(function(s) { return s.score.total >= 50; });
    if (!leads.length) return '<p class="modal-empty">No leads scored 50+. Analyze a storm first.</p>';
    leads = leads.slice().sort(function(a, b) { return b.score.total - a.score.total; });
    var html = '<p class="modal-meta">' + leads.length + ' leads scored 50 or above — sorted by score</p>';
    html += '<table class="modal-table"><thead><tr>' +
      '<th>Address</th><th>Score</th><th>Assessed Value</th><th>Owner</th>' +
      '</tr></thead><tbody>';
    leads.slice(0, 20).forEach(function(s) {
      html += '<tr>';
      html += '<td>' + _escapeHtml(s.parcel.propertyAddress.split(',')[0]) + '</td>';
      html += '<td><strong style="color:' + ScoringService.getScoreColor(s.score.total) + '">' + s.score.total + '/100</strong></td>';
      html += '<td>' + ParcelService.formatValue(s.parcel.assessedValue) + '</td>';
      html += '<td class="muted">' + _escapeHtml(s.parcel.ownerName || '—') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
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
