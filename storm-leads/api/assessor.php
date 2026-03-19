<?php
/**
 * Storm Lead Generator — Maricopa County Assessor API Proxy
 *
 * Proxies requests to the Maricopa County Assessor API to handle CORS
 * and normalize the response format for the frontend.
 *
 * Endpoints:
 *   ?action=search&q=<address>       — Search parcels by address
 *   ?action=parcel&apn=<number>      — Get parcel by APN
 *   ?action=bounds&south=&west=&north=&east= — Search parcels in bounding box
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Maricopa County Assessor API base URL
// Note: The public API requires a token. Contact AssessorDataSales@maricopa.gov
// For now, this proxy returns structured error messages when no token is configured.
define('ASSESSOR_API_BASE', 'https://api.mcassessor.maricopa.gov');
define('ASSESSOR_API_TOKEN', ''); // Set your API token here

$action = isset($_GET['action']) ? trim($_GET['action']) : '';

switch ($action) {
    case 'search':
        handleSearch();
        break;
    case 'parcel':
        handleParcel();
        break;
    case 'bounds':
        handleBounds();
        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action. Use: search, parcel, or bounds']);
        exit;
}

/**
 * Search parcels by address string
 */
function handleSearch() {
    $query = isset($_GET['q']) ? trim($_GET['q']) : '';
    if (empty($query)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing search query (q)']);
        return;
    }

    $url = ASSESSOR_API_BASE . '/v1/parcels?address=' . urlencode($query);
    $response = makeApiRequest($url);

    if ($response === null) {
        echo json_encode([
            'parcels' => [],
            'note' => 'Assessor API not configured. Set ASSESSOR_API_TOKEN in api/assessor.php'
        ]);
        return;
    }

    $parcels = normalizeParcels($response);
    echo json_encode(['parcels' => $parcels]);
}

/**
 * Get parcel details by APN
 */
function handleParcel() {
    $apn = isset($_GET['apn']) ? trim($_GET['apn']) : '';
    if (empty($apn)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing parcel number (apn)']);
        return;
    }

    // Sanitize APN — only digits and hyphens
    $apn = preg_replace('/[^0-9\-]/', '', $apn);

    $url = ASSESSOR_API_BASE . '/v1/parcels/' . urlencode($apn);
    $response = makeApiRequest($url);

    if ($response === null) {
        echo json_encode([
            'parcels' => [],
            'note' => 'Assessor API not configured. Set ASSESSOR_API_TOKEN in api/assessor.php'
        ]);
        return;
    }

    $parcels = normalizeParcels(is_array($response) ? $response : [$response]);
    echo json_encode(['parcels' => $parcels]);
}

/**
 * Search parcels within a bounding box
 * Note: The Maricopa Assessor API may not support bbox queries natively.
 * This would need to use the ArcGIS open data portal or a local parcel database.
 */
function handleBounds() {
    $south = isset($_GET['south']) ? floatval($_GET['south']) : 0;
    $west  = isset($_GET['west'])  ? floatval($_GET['west'])  : 0;
    $north = isset($_GET['north']) ? floatval($_GET['north']) : 0;
    $east  = isset($_GET['east'])  ? floatval($_GET['east'])  : 0;

    if ($south === 0.0 && $west === 0.0 && $north === 0.0 && $east === 0.0) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing bounding box parameters (south, west, north, east)']);
        return;
    }

    // For MVP: Use Maricopa County's ArcGIS Feature Service for spatial queries
    // This is the parcel boundaries layer from the open data portal
    $arcgisUrl = 'https://gis.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0/query'
        . '?geometry=' . urlencode($west . ',' . $south . ',' . $east . ',' . $north)
        . '&geometryType=esriGeometryEnvelope'
        . '&inSR=4326'
        . '&spatialRel=esriSpatialRelIntersects'
        . '&outFields=APN,OWNER,SITUS_ADDR,FCV,LAND_VALUE,IMPROV_VALUE,YEAR_BUILT,LIVING_AREA,USE_CODE'
        . '&outSR=4326'
        . '&f=json'
        . '&resultRecordCount=200';

    $response = makeRequest($arcgisUrl);

    if ($response === null) {
        // If ArcGIS is also unavailable, return empty with a note
        echo json_encode([
            'parcels' => [],
            'note' => 'Parcel spatial query unavailable. Configure assessor API or use demo mode.'
        ]);
        return;
    }

    $data = json_decode($response, true);
    if (!$data || !isset($data['features'])) {
        echo json_encode(['parcels' => [], 'note' => 'No parcel data returned']);
        return;
    }

    $parcels = [];
    foreach ($data['features'] as $feature) {
        $attrs = $feature['attributes'];
        $geom = isset($feature['geometry']) ? $feature['geometry'] : null;

        $parcels[] = [
            'apn'             => isset($attrs['APN']) ? $attrs['APN'] : '',
            'ownerName'       => isset($attrs['OWNER']) ? $attrs['OWNER'] : '',
            'propertyAddress' => isset($attrs['SITUS_ADDR']) ? $attrs['SITUS_ADDR'] : '',
            'assessedValue'   => isset($attrs['FCV']) ? floatval($attrs['FCV']) : 0,
            'landValue'       => isset($attrs['LAND_VALUE']) ? floatval($attrs['LAND_VALUE']) : 0,
            'improvementValue'=> isset($attrs['IMPROV_VALUE']) ? floatval($attrs['IMPROV_VALUE']) : 0,
            'yearBuilt'       => isset($attrs['YEAR_BUILT']) ? intval($attrs['YEAR_BUILT']) : 0,
            'sqft'            => isset($attrs['LIVING_AREA']) ? intval($attrs['LIVING_AREA']) : 0,
            'propertyType'    => isset($attrs['USE_CODE']) ? $attrs['USE_CODE'] : '',
            'lat'             => $geom ? ($geom['y'] ?? 0) : 0,
            'lng'             => $geom ? ($geom['x'] ?? 0) : 0
        ];
    }

    echo json_encode(['parcels' => $parcels]);
}

/**
 * Make authenticated request to Maricopa Assessor API
 */
function makeApiRequest($url) {
    if (empty(ASSESSOR_API_TOKEN)) {
        return null;
    }

    $headers = [
        'Authorization: Bearer ' . ASSESSOR_API_TOKEN,
        'Accept: application/json'
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || $response === false) {
        return null;
    }

    return json_decode($response, true);
}

/**
 * Make a generic HTTP request
 */
function makeRequest($url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || $response === false) {
        return null;
    }

    return $response;
}

/**
 * Normalize raw assessor API response
 */
function normalizeParcels($data) {
    if (!is_array($data)) return [];

    $result = [];
    foreach ($data as $raw) {
        $result[] = [
            'apn'             => $raw['parcel_number'] ?? $raw['ParcelNumber'] ?? '',
            'ownerName'       => $raw['owner_name'] ?? $raw['OwnerName'] ?? '',
            'ownerAddress'    => $raw['owner_address'] ?? $raw['OwnerMailingAddress'] ?? '',
            'propertyAddress' => $raw['property_address'] ?? $raw['SitusAddress'] ?? '',
            'propertyType'    => $raw['property_type'] ?? $raw['PropertyType'] ?? '',
            'assessedValue'   => floatval($raw['assessed_value'] ?? $raw['FullCashValue'] ?? 0),
            'landValue'       => floatval($raw['land_value'] ?? $raw['LandValue'] ?? 0),
            'improvementValue'=> floatval($raw['improvement_value'] ?? $raw['ImprovementValue'] ?? 0),
            'yearBuilt'       => intval($raw['year_built'] ?? $raw['YearBuilt'] ?? 0),
            'sqft'            => intval($raw['sqft'] ?? $raw['LivingArea'] ?? 0),
            'lat'             => floatval($raw['latitude'] ?? 0),
            'lng'             => floatval($raw['longitude'] ?? 0)
        ];
    }

    return $result;
}
