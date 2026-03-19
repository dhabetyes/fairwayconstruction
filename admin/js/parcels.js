/**
 * Storm Lead Generator — Parcel/Assessor Data Module
 *
 * Queries Maricopa County Assessor data for parcels within storm-affected areas.
 * Uses a PHP proxy (api/assessor.php) to handle CORS and API auth.
 */
var ParcelService = (function() {
  'use strict';

  /**
   * Search parcels by address (via proxy)
   */
  function searchByAddress(address) {
    return _proxyRequest('search', { q: address });
  }

  /**
   * Get parcel details by parcel number (APN)
   */
  function getParcelByApn(apn) {
    return _proxyRequest('parcel', { apn: apn });
  }

  /**
   * Search parcels within a bounding box
   * Returns an array of normalized parcel objects
   */
  function searchInBounds(bounds) {
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();
    return _proxyRequest('bounds', {
      south: sw.lat,
      west: sw.lng,
      north: ne.lat,
      east: ne.lng
    });
  }

  /**
   * Search parcels within a polygon (array of [lat, lng] points)
   */
  function searchInPolygon(polygonCoords) {
    return _proxyRequest('polygon', {
      coords: JSON.stringify(polygonCoords)
    });
  }

  /**
   * Core proxy request handler
   */
  function _proxyRequest(action, params) {
    var queryParts = ['action=' + encodeURIComponent(action)];
    for (var key in params) {
      if (params.hasOwnProperty(key)) {
        queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
      }
    }

    var url = StormConfig.assessorBaseUrl + '?' + queryParts.join('&');

    return fetch(url)
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Assessor proxy returned ' + response.status);
        }
        return response.json();
      })
      .then(function(data) {
        if (data.error) {
          throw new Error(data.error);
        }
        return data.parcels || data;
      });
  }

  /**
   * Determine if a parcel is likely owner-occupied
   * Heuristic: if the owner's mailing address matches the property address
   */
  function isOwnerOccupied(parcel) {
    if (!parcel.ownerAddress || !parcel.propertyAddress) return false;

    // Normalize addresses for comparison
    var ownerAddr = _normalizeAddress(parcel.ownerAddress);
    var propAddr = _normalizeAddress(parcel.propertyAddress);

    // If they share the same street number and name, likely owner-occupied
    return ownerAddr === propAddr;
  }

  /**
   * Normalize an address string for comparison
   */
  function _normalizeAddress(addr) {
    return addr
      .toUpperCase()
      .replace(/[.,#]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\b(STREET|ST|AVENUE|AVE|DRIVE|DR|ROAD|RD|BOULEVARD|BLVD|LANE|LN|COURT|CT|PLACE|PL)\b/g, function(m) {
        var abbrevs = {
          STREET: 'ST', AVENUE: 'AVE', DRIVE: 'DR', ROAD: 'RD',
          BOULEVARD: 'BLVD', LANE: 'LN', COURT: 'CT', PLACE: 'PL',
          ST: 'ST', AVE: 'AVE', DR: 'DR', RD: 'RD',
          BLVD: 'BLVD', LN: 'LN', CT: 'CT', PL: 'PL'
        };
        return abbrevs[m] || m;
      })
      .trim();
  }

  /**
   * Normalize raw assessor API response into a standard parcel object
   */
  function normalizeParcel(raw) {
    return {
      apn: raw.parcel_number || raw.apn || raw.ParcelNumber || '',
      ownerName: raw.owner_name || raw.OwnerName || raw.owner || '',
      ownerAddress: raw.owner_address || raw.OwnerMailingAddress || '',
      propertyAddress: raw.property_address || raw.SitusAddress || raw.address || '',
      propertyType: raw.property_type || raw.PropertyType || raw.use_code || '',
      assessedValue: parseFloat(raw.assessed_value || raw.FullCashValue || raw.value || 0),
      landValue: parseFloat(raw.land_value || raw.LandValue || 0),
      improvementValue: parseFloat(raw.improvement_value || raw.ImprovementValue || 0),
      yearBuilt: parseInt(raw.year_built || raw.YearBuilt || 0, 10),
      sqft: parseInt(raw.sqft || raw.LivingArea || raw.building_sqft || 0, 10),
      lat: parseFloat(raw.latitude || raw.lat || 0),
      lng: parseFloat(raw.longitude || raw.lng || raw.lon || 0),
      isOwnerOccupied: false // Set after address comparison
    };
  }

  /**
   * Format property value as currency
   */
  function formatValue(value) {
    if (!value || value <= 0) return 'N/A';
    return '$' + Math.round(value).toLocaleString('en-US');
  }

  /**
   * Generate mock parcel data for demo/testing when the assessor API is unavailable.
   * Creates realistic-looking parcels within the given bounds.
   */
  function generateDemoParcels(bounds, count) {
    count = count || 50;
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();
    var parcels = [];

    var streetNames = [
      'Glendale Ave', 'Camelback Rd', 'Indian School Rd', 'Thomas Rd',
      'McDowell Rd', 'Bethany Home Rd', 'Northern Ave', 'Dunlap Ave',
      'Peoria Ave', 'Cactus Rd', 'Thunderbird Rd', 'Bell Rd',
      'Greenway Rd', 'Beardsley Rd', 'Union Hills Dr', 'Pinnacle Peak Rd'
    ];

    var firstNames = [
      'James', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph',
      'Maria', 'Jennifer', 'Linda', 'Patricia', 'Elizabeth', 'Susan', 'Karen'
    ];

    var lastNames = [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
      'Davis', 'Rodriguez', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore'
    ];

    for (var i = 0; i < count; i++) {
      var lat = sw.lat + Math.random() * (ne.lat - sw.lat);
      var lng = sw.lng + Math.random() * (ne.lng - sw.lng);
      var streetNum = Math.floor(1000 + Math.random() * 30000);
      var direction = Math.random() > 0.5 ? 'W' : 'E';
      var street = streetNames[Math.floor(Math.random() * streetNames.length)];
      var address = streetNum + ' ' + direction + ' ' + street;
      var firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      var lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      var isLlc = Math.random() < 0.15;
      var ownerOccupied = !isLlc && Math.random() > 0.25;
      var value = Math.floor(200000 + Math.random() * 600000);

      parcels.push({
        apn: '5' + String(Math.floor(10000000 + Math.random() * 89999999)),
        ownerName: isLlc
          ? lastName.toUpperCase() + ' PROPERTIES LLC'
          : firstName + ' ' + lastName,
        ownerAddress: ownerOccupied ? address + ', Phoenix, AZ' : (Math.floor(1000 + Math.random() * 9000) + ' N Other St, Phoenix, AZ'),
        propertyAddress: address + ', Phoenix, AZ 85021',
        propertyType: Math.random() > 0.1 ? 'Single Family' : 'Multi-Family',
        assessedValue: value,
        landValue: Math.floor(value * 0.3),
        improvementValue: Math.floor(value * 0.7),
        yearBuilt: Math.floor(1970 + Math.random() * 50),
        sqft: Math.floor(1200 + Math.random() * 2500),
        lat: lat,
        lng: lng,
        isOwnerOccupied: ownerOccupied
      });
    }

    return parcels;
  }

  return {
    searchByAddress: searchByAddress,
    getParcelByApn: getParcelByApn,
    searchInBounds: searchInBounds,
    searchInPolygon: searchInPolygon,
    isOwnerOccupied: isOwnerOccupied,
    normalizeParcel: normalizeParcel,
    formatValue: formatValue,
    generateDemoParcels: generateDemoParcels
  };
})();
