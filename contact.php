<?php
/**
 * Fairway Construction LLC — contact.php
 * Receives estimate form POST, sends email via PHP mail().
 * Designed for GoDaddy shared hosting (PHP mail() supported natively).
 */

header('Content-Type: application/json');

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
    exit;
}

// --- Sanitize inputs ---
function clean($value) {
    return htmlspecialchars(strip_tags(trim($value)), ENT_QUOTES, 'UTF-8');
}

$name        = clean($_POST['full-name']    ?? '');
$phone       = clean($_POST['phone']        ?? '');
$email       = clean($_POST['email']        ?? '');
$serviceType = clean($_POST['service-type'] ?? '');
$message     = clean($_POST['message']      ?? '');

// --- Validate required fields ---
if (empty($name) || empty($phone) || empty($serviceType)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Please fill in all required fields.']);
    exit;
}

// --- Build email ---
$to      = 'info@fairwayconstructionaz.com';
$subject = 'New Estimate Request from ' . $name;

$body  = "You have a new estimate request from the Fairway Construction LLC website.\n\n";
$body .= "Name:         " . $name . "\n";
$body .= "Phone:        " . $phone . "\n";
$body .= "Email:        " . ($email ?: 'Not provided') . "\n";
$body .= "Service Type: " . $serviceType . "\n\n";
$body .= "Message:\n" . ($message ?: 'No message provided.') . "\n";

$headers  = "From: Website <noreply@fairwayconstructionaz.com>\r\n";
if (!empty($email)) {
    $headers .= "Reply-To: " . $email . "\r\n";
}
$headers .= "X-Mailer: PHP/" . phpversion();

// --- Send ---
$sent = mail($to, $subject, $body, $headers);

if ($sent) {
    echo json_encode(['success' => true]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to send message. Please call us directly at (602) 890-5941.']);
}
