# KPI Monitoring Dashboard - Centralized RBAC Validation Script (v4)

$baseUrl = "http://127.0.0.1:4000/api/v1"

function Test-Endpoint {
    param($method, $path, $token, $body = $null, $expectedCode = 200)
    
    $headers = @{}
    if ($token) { $headers["session-token"] = $token }
    
    $statusCode = 0
    try {
        $params = @{
            Method      = $method
            Uri         = "$baseUrl$path"
            Headers     = $headers
            ContentType = "application/json"
            ErrorAction = "Stop"
            UseBasicParsing = $true
            TimeoutSec  = 10
        }

        # Only add body for non-GET requests or if explicitly provided
        if ($body -ne $null -and $method -ne "GET") {
            $params.Body = $body
        }

        $resp = Invoke-WebRequest @params
        $statusCode = [int]$resp.StatusCode
    } catch {
        if ($_.Exception.Response -ne $null -and $_.Exception.Response.StatusCode -ne $null) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        } else {
            Write-Host "Connection Error on ${path}: $($_.Exception.Message)" -ForegroundColor Gray
            $statusCode = 0
        }
    }

    if ($statusCode -eq $expectedCode) {
        Write-Host "[PASS] $method $path -> $statusCode (Expected $expectedCode)" -ForegroundColor Green
        return $true
    } else {
        Write-Host "[FAIL] $method $path -> $statusCode (Expected $expectedCode)" -ForegroundColor Red
        return $false
    }
}

function Get-Token {
    param($email, $password)
    $body = @{ email = $email; password = $password } | ConvertTo-Json
    try {
        $resp = Invoke-RestMethod -Method POST -Uri "$baseUrl/auth/login" -ContentType "application/json" -Body $body -UseBasicParsing
        return $resp.token
    } catch {
        Write-Host "CRITICAL: Login failed for $email" -ForegroundColor Red
        return $null
    }
}

Write-Host "`n--- KPI MONITORING RBAC AUDIT ---`n" -Cyan

# 1. AUTHENTICATION
$superToken = Get-Token "superadmin@monitor.io" "password123"
$adminToken = Get-Token "admin@store001.com" "password123"
$custToken  = Get-Token "viewer@store001.com" "password123"

if (-not ($superToken -and $adminToken -and $custToken)) {
    Write-Host "ABORTING: Sessions not established." -ForegroundColor Red
    Exit 1
}

$results = @()

# ─── SUPER ADMIN VALIDATION ───
Write-Host "`n[ROLE: SUPER_ADMIN]`n" -Yellow
$results += Test-Endpoint "GET"  "/projects" $superToken 200
$results += Test-Endpoint "GET"  "/dashboard/summaries?siteId=store_001" $superToken 200
$results += Test-Endpoint "GET"  "/config/store_001" $superToken 200
$results += Test-Endpoint "POST" "/simulate" $superToken "{}" 200
$results += Test-Endpoint "GET"  "/admin/projects/store_001/customers" $superToken 200

# ─── ADMIN VALIDATION ───
Write-Host "`n[ROLE: ADMIN]`n" -Yellow
$results += Test-Endpoint "GET"  "/dashboard/summaries?siteId=store_001" $adminToken 200
$results += Test-Endpoint "GET"  "/config/store_001" $adminToken 200
$results += Test-Endpoint "POST" "/simulate" $adminToken "{}" 200
$results += Test-Endpoint "GET"  "/dashboard/summaries?siteId=store_003" $adminToken -expectedCode 403

# ─── CUSTOMER VALIDATION ───
Write-Host "`n[ROLE: CUSTOMER]`n" -Yellow
$results += Test-Endpoint "GET"  "/dashboard/summaries?siteId=store_001" $custToken 200
$results += Test-Endpoint "GET"  "/config/store_001" $custToken -expectedCode 403
$results += Test-Endpoint "POST" "/simulate" $custToken "{}" -expectedCode 403
$results += Test-Endpoint "GET"  "/admin/projects/store_001/customers" $custToken -expectedCode 403
$results += Test-Endpoint "PATCH" "/admin/customers/viewer@store001.com/status" $custToken '{"status":"inactive"}' -expectedCode 403

# ─── ANONYMOUS VALIDATION ───
Write-Host "`n[ROLE: ANONYMOUS]`n" -Yellow
$results += Test-Endpoint "GET"  "/projects" $null -expectedCode 401
$results += Test-Endpoint "GET"  "/config/store_001" $null -expectedCode 401

Write-Host "`n--- AUDIT SUMMARY ---"
$passCount = ($results | Where-Object { $_ -eq $true }).Count
$total = $results.Count
Write-Host "Consistency Check: $passCount / $total" -Cyan
if ($passCount -eq $total) { 
    Write-Host "SECURITY POSTURE: HARDENED" -ForegroundColor Green
    Exit 0 
} else { 
    Write-Host "SECURITY POSTURE: BREACHED" -ForegroundColor Red
    Exit 1 
}
