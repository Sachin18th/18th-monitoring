# KPI Monitoring Platform - COMPREHENSIVE SYSTEM AUDIT (Handoff Version)

$baseUrl = "http://127.0.0.1:4000/api/v1"

function Request {
    param($method, $path, $token = $null, $body = $null)
    $headers = @{ "Accept" = "application/json" }
    if ($token) { $headers["session-token"] = $token }
    
    $params = @{
        Method      = $method
        Uri         = "$baseUrl$path"
        Headers     = $headers
        ContentType = "application/json"
        ErrorAction = "Stop"
        UseBasicParsing = $true
        TimeoutSec  = 10
    }
    if ($body -ne $null -and $method -ne "GET") { $params.Body = $body }

    try {
        return Invoke-WebRequest @params
    } catch {
        return $_.Exception.Response
    }
}

function Get-Token($email, $pwd) {
    $body = @{ email = $email; password = $pwd } | ConvertTo-Json
    $r = Request "POST" "/auth/login" $null $body
    if ($r.StatusCode -eq 200) {
        return (Read-RawBody $r).token
    }
    return $null
}

function Read-RawBody($r) {
    return $r.Content | ConvertFrom-Json
}

Write-Host "`n--- PLATFORM INTEGRITY AUDIT STARTING ---`n" -Cyan

# 1. ACQUIRE TOKENS
$superToken = Get-Token "superadmin@monitor.io" "password123"
$adminToken = Get-Token "admin@store001.com" "password123"
$custToken  = Get-Token "viewer@store001.com" "password123"

if (-not ($superToken -and $adminToken -and $custToken)) {
    Write-Host "CRITICAL: Failed to establish test sessions. Is the server running?" -ForegroundColor Red
    Exit 1
}

$results = @()

# ─── SECTION 1: ROLE-BASED ACCESS CONTROL (RBAC) ───
Write-Host "[SEC 1] Validating RBAC & Multi-Tenant Isolation..." -Yellow

# 1.1 Super Admin Portfolio Access
$r = Request "GET" "/projects" $superToken
$results += ($r.StatusCode -eq 200)
Write-Host "  - Super Admin: Load all projects -> $($r.StatusCode)"

# 1.2 Admin Project Scoping
$r = Request "GET" "/dashboard/summaries?siteId=store_001" $adminToken
$results += ($r.StatusCode -eq 200)
Write-Host "  - Admin: Access assigned project (store_001) -> $($r.StatusCode)"

$r = Request "GET" "/dashboard/summaries?siteId=store_003" $adminToken
$results += ($r.StatusCode -eq 403)
Write-Host "  - Admin: Access forbidden project (store_003) -> $($r.StatusCode) (Expected 403)"

# 1.3 Customer Write Protection
$r = Request "POST" "/simulate" $custToken "{}"
$results += ($r.StatusCode -eq 403)
Write-Host "  - Customer: Attempt simulation (Mutation) -> $($r.StatusCode) (Expected 403)"

# ─── SECTION 2: MONITORING PIPELINE E2E ───
Write-Host "`n[SEC 2] Validating Monitoring Pipeline (E2E)..." -Yellow

# 2.1 Ingest Production Data
$payload = @{
    siteId = "store_001"
    events = @(
        @{ eventId = [guid]::NewGuid(); eventType = "click"; siteId = "store_001"; timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ"); sessionId = "s1"; userId = "u1"; metadata = @{ elementId = "test-btn" } }
    )
} | ConvertTo-Json
$r = Request "POST" "/i/browser" $null $payload
$results += ($r.StatusCode -eq 200)
Write-Host "  - Ingestion: Post browser event batch -> $($r.StatusCode)"

# Wait for processing
Start-Sleep -Seconds 2

# 2.2 Verify Metrics Aggregate
$r = Request "GET" "/dashboard/summaries?siteId=store_001" $superToken
$metrics = Read-RawBody $r
$activeUsers = ($metrics | Where-Object { $_.kpiName -eq "activeUsers" }).value
$results += ($activeUsers -ge 1)
Write-Host "  - Processor: Active Users KPI updated -> $activeUsers"

# ─── SECTION 3: ALERT ENGINE VALIDATION ───
Write-Host "`n[SEC 3] Validating Alert Lifecycle..." -Yellow

# 3.1 Trigger SLA Breach (Slow Page Load)
$slowPayload = @{
    siteId = "store_001"
    events = @(
        @{ eventId = [guid]::NewGuid(); eventType = "page_view"; siteId = "store_001"; timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ"); sessionId = "s-slow"; userId = "u1"; metadata = @{ loadTime = 9000; url = "/checkout" } }
    )
} | ConvertTo-Json
$r = Request "POST" "/i/browser" $null $slowPayload
Write-Host "  - Alerting: Dispatched slow page_view (9000ms)"

Start-Sleep -Seconds 2

# 3.2 Verify Alert Record
$r = Request "GET" "/dashboard/alerts?siteId=store_001" $superToken
$alerts = Read-RawBody $r
$breach = ($alerts | Where-Object { $_.kpiName -eq "pageLoadTime" -and $_.status -eq "active" })
$results += ($breach -ne $null)
if ($breach) {
    Write-Host "  - Alert Engine: Critical Alert identified! -> $($breach.message)" -ForegroundColor Green
} else {
    Write-Host "  - Alert Engine: FAILED to identify breach." -ForegroundColor Red
}

# ─── FINAL RESULT ───
Write-Host "`n--- AUDIT COMPLETE ---"
$pass = ($results | Where-Object { $_ -eq $true }).Count
$total = $results.Count
Write-Host "Final Integrity Score: $pass / $total" -Cyan
if ($pass -eq $total) {
    Write-Host "PLATFORM IS PRODUCTION READY" -ForegroundColor Green
    Exit 0
} else {
    Write-Host "SYSTEM INTEGRITY COMPROMISED" -ForegroundColor Red
    Exit 1
}
