# MoneyWise Native Windows fullstack server - server.ps1
$port = 3000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "====================================================" -ForegroundColor Cyan
    Write-Host "  MoneyWise Native Windows Backend Engine Active!" -ForegroundColor Green
    Write-Host "  Local App Link:   http://localhost:$port/" -ForegroundColor Yellow
    Write-Host "  Admin Statistics: http://localhost:$port/admin.html" -ForegroundColor Yellow
    Write-Host "  Press Ctrl+C in this terminal to stop the server." -ForegroundColor Red
    Write-Host "====================================================" -ForegroundColor Cyan
} catch {
    Write-Host "Error starting server: $_" -ForegroundColor Red
    Exit
}

$dbFile = Join-Path $PSScriptRoot "database.json"

# Load environment variables from .env file if it exists
$envFile = Join-Path $PSScriptRoot ".env"
$gitHubToken = $null
$gitHubRepo = "darshkeshav18/Money_wise"
$gitHubBranch = "main"
$gitHubDbPath = "database.json"

if (Test-Path $envFile) {
    try {
        Get-Content $envFile | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#")) {
                $parts = $line.Split("=", 2)
                if ($parts.Length -eq 2) {
                    $key = $parts[0].Trim()
                    $val = $parts[1].Trim()
                    if ($key -eq "GITHUB_TOKEN") { $gitHubToken = $val }
                    if ($key -eq "GITHUB_REPO") { $gitHubRepo = $val }
                    if ($key -eq "GITHUB_BRANCH") { $gitHubBranch = $val }
                }
            }
        }
    } catch {
        Write-Host "Error reading .env: $_" -ForegroundColor Red
    }
}

$isGitHubConfigured = ($null -ne $gitHubToken) -and ($gitHubToken -ne "your_personal_access_token_here") -and ($gitHubToken -ne "")
if ($isGitHubConfigured) {
    Write-Host "GitHub database backend enabled targeting repo: $gitHubRepo (Branch: $gitHubBranch)" -ForegroundColor Green
} else {
    Write-Host "GitHub database backend disabled. Using local database.json storage." -ForegroundColor Yellow
}

# Initialize local JSON database (fallback)
if (-not (Test-Path $dbFile)) {
    $initialDb = @{
        users = @()
        userData = @{}
    }
    $initialDb | ConvertTo-Json -Depth 100 | Out-File $dbFile -Encoding utf8
}

$gitDbCache = $null
$gitDbSha = $null
$lastGitFetchTime = 0

function Read-Database {
    global $gitDbCache, $gitDbSha, $lastGitFetchTime

    if ($isGitHubConfigured) {
        $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        if ($null -ne $gitDbCache -and ($now - $lastGitFetchTime -lt 3000)) {
            return $gitDbCache
        }

        try {
            $url = "https://api.github.com/repos/$gitHubRepo/contents/$gitHubDbPath?ref=$gitHubBranch"
            $headers = @{
                "Authorization" = "token $gitHubToken"
                "Accept" = "application/vnd.github.v3+json"
                "User-Agent" = "MoneyWise-App"
            }
            $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
            $gitDbSha = $response.sha
            
            $base64 = $response.content.Replace("`n", "").Replace("`r", "")
            $decodedBytes = [System.Convert]::FromBase64String($base64)
            $decodedText = [System.Text.Encoding]::UTF8.GetString($decodedBytes)
            $db = $decodedText | ConvertFrom-Json
            
            $gitDbCache = $db
            $lastGitFetchTime = $now
            return $db
        } catch {
            if ($_.Exception.Response.StatusCode -eq 404) {
                $initialDb = @{ users = @(); userData = @{} }
                Write-Database $initialDb
                return $initialDb
            }
            Write-Host "Error reading database from GitHub, falling back: $_" -ForegroundColor Red
            if ($null -ne $gitDbCache) { return $gitDbCache }
        }
    }

    try {
        $raw = Get-Content $dbFile -Raw -ErrorAction Stop
        return $raw | ConvertFrom-Json
    } catch {
        return @{ users = @(); userData = @{} }
    }
}

function Write-Database ($db) {
    global $gitDbCache, $gitDbSha, $lastGitFetchTime

    if ($isGitHubConfigured) {
        try {
            $headers = @{
                "Authorization" = "token $gitHubToken"
                "Accept" = "application/vnd.github.v3+json"
                "User-Agent" = "MoneyWise-App"
            }

            if ($null -eq $gitDbSha) {
                try {
                    $url = "https://api.github.com/repos/$gitHubRepo/contents/$gitHubDbPath?ref=$gitHubBranch"
                    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
                    $gitDbSha = $res.sha
                } catch {}
            }

            $json = $db | ConvertTo-Json -Depth 100
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $base64 = [System.Convert]::ToBase64String($bytes)

            $body = @{
                message = "Update database.json from MoneyWise PowerShell API"
                content = $base64
                branch = $gitHubBranch
            }
            if ($null -ne $gitDbSha) {
                $body.sha = $gitDbSha
            }

            $url = "https://api.github.com/repos/$gitHubRepo/contents/$gitHubDbPath"
            $bodyJson = $body | ConvertTo-Json -Depth 100
            
            $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Put -Body $bodyJson -ContentType "application/json"
            $gitDbSha = $res.content.sha
            $gitDbCache = $db
            $lastGitFetchTime = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            return
        } catch {
            Write-Host "Error writing database to GitHub: $_" -ForegroundColor Red
        }
    }

    try {
        $db | ConvertTo-Json -Depth 100 | Out-File $dbFile -Encoding utf8
    } catch {
        Write-Host "Error saving database to local disk: $_" -ForegroundColor Red
    }
}

function Hash-Password ($password) {
    $hasher = [System.Security.Cryptography.HashAlgorithm]::Create("SHA256")
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($password)
    $hashBytes = $hasher.ComputeHash($bytes)
    return [System.BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()
}

function Set-ObjectProperty ($obj, $propertyName, $propertyValue) {
    if ($null -eq $obj) { return }
    if ($obj -is [System.Collections.IDictionary]) {
        $obj[$propertyName] = $propertyValue
    } else {
        if ($obj.PSObject.Properties[$propertyName]) {
            $obj.$propertyName = $propertyValue
        } else {
            $obj | Add-Member -MemberType NoteProperty -Name $propertyName -Value $propertyValue -Force
        }
    }
}

# Request handler loop
while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    # Enable CORS
    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")

    if ($request.HttpMethod -eq "OPTIONS") {
        $response.StatusCode = 200
        $response.Close()
        continue
    }

    $urlPath = $request.Url.AbsolutePath
    Write-Host "$($request.HttpMethod) $urlPath" -ForegroundColor White

    # API Routing
    if ($urlPath.StartsWith("/api/")) {
        $response.ContentType = "application/json"
        
        # Read body helper
        $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
        $body = $reader.ReadToEnd()
        $reader.Close()

        $db = Read-Database

        if ($urlPath -eq "/api/auth/register" -and $request.HttpMethod -eq "POST") {
            try {
                $payload = $body | ConvertFrom-Json
                $username = $payload.username
                $email = $payload.email
                $password = $payload.password

                if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) {
                    $response.StatusCode = 400
                    $res = @{ error = "Username and password are required" }
                } else {
                    $lowerUsername = $username.ToLower().Trim()
                    
                    # Search users list
                    $exists = $null
                    if ($db.users) {
                        $exists = $db.users | Where-Object { $_.username.ToLower() -eq $lowerUsername }
                    }
                    
                    if ($exists) {
                        $response.StatusCode = 400
                        $res = @{ error = "Username already registered" }
                    } else {
                        # Create new user
                        $newUser = @{
                            id = [Guid]::NewGuid().ToString().Substring(0, 8)
                            username = $username.Trim()
                            email = if ($email) { $email.Trim() } else { "" }
                            passwordHash = Hash-Password $password
                            createdAt = (Get-Date).ToString("o")
                        }
                        
                        # Add user to list
                        if ($null -eq $db.users) {
                            $db.users = @($newUser)
                        } else {
                            $db.users += $newUser
                        }
                        
                        # Initialize details
                        if ($null -eq $db.userData) {
                            $db.userData = @{}
                        }
                        Set-ObjectProperty $db.userData $lowerUsername @{
                            profile = $null
                            expenses = @()
                            subscriptions = @()
                            goals = @()
                            preferences = @{
                                notifications = @{ overspend = $true; renewal = $true; goals = $true }
                                darkMode = $true
                            }
                        }
                        
                        Write-Database $db
                        $response.StatusCode = 201
                        $res = @{ success = $true; username = $newUser.username }
                    }
                }
            } catch {
                $response.StatusCode = 500
                $res = @{ error = "Internal server error during registration: $_" }
            }
            $json = $res | ConvertTo-Json
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        elseif ($urlPath -eq "/api/auth/login" -and $request.HttpMethod -eq "POST") {
            try {
                $payload = $body | ConvertFrom-Json
                $username = $payload.username
                $password = $payload.password

                if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) {
                    $response.StatusCode = 400
                    $res = @{ error = "Username and password are required" }
                } else {
                    $lowerUsername = $username.ToLower().Trim()
                    $user = $null
                    if ($db.users) {
                        $user = $db.users | Where-Object { $_.username.ToLower() -eq $lowerUsername }
                    }
                    $passHash = Hash-Password $password

                    if ($null -eq $user -or $user.passwordHash -ne $passHash) {
                        $response.StatusCode = 401
                        $res = @{ error = "Invalid username or password" }
                    } else {
                        $response.StatusCode = 200
                        $res = @{ success = $true; username = $user.username }
                    }
                }
            } catch {
                $response.StatusCode = 500
                $res = @{ error = "Internal server error: $_" }
            }
            $json = $res | ConvertTo-Json
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        elseif ($urlPath -eq "/api/user/data" -and $request.HttpMethod -eq "GET") {
            $authHeader = $request.Headers["Authorization"]
            if ([string]::IsNullOrWhiteSpace($authHeader) -or -not $authHeader.StartsWith("Bearer ")) {
                $response.StatusCode = 401
                $res = @{ error = "Unauthorized access" }
            } else {
                $username = $authHeader.Substring(7).ToLower().Trim()
                $data = $db.userData.$username
                if ($null -eq $data) {
                    $response.StatusCode = 404
                    $res = @{ error = "User data not found" }
                } else {
                    $response.StatusCode = 200
                    $res = $data
                }
            }
            $json = $res | ConvertTo-Json -Depth 100
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        elseif ($urlPath -eq "/api/user/data" -and $request.HttpMethod -eq "POST") {
            $authHeader = $request.Headers["Authorization"]
            if ([string]::IsNullOrWhiteSpace($authHeader) -or -not $authHeader.StartsWith("Bearer ")) {
                $response.StatusCode = 401
                $res = @{ error = "Unauthorized access" }
            } else {
                $username = $authHeader.Substring(7).ToLower().Trim()
                try {
                    $payload = $body | ConvertFrom-Json
                    
                    if ($null -eq $db.userData) {
                        $db.userData = @{}
                    }
                    if ($null -eq $db.userData.$username) {
                        Set-ObjectProperty $db.userData $username @{}
                    }

                    $userObj = $db.userData.$username
                    # Overwrite fields if they exist in payload
                    if ($null -ne $payload.profile) { Set-ObjectProperty $userObj "profile" $payload.profile }
                    if ($null -ne $payload.expenses) { Set-ObjectProperty $userObj "expenses" $payload.expenses }
                    if ($null -ne $payload.subscriptions) { Set-ObjectProperty $userObj "subscriptions" $payload.subscriptions }
                    if ($null -ne $payload.goals) { Set-ObjectProperty $userObj "goals" $payload.goals }
                    if ($null -ne $payload.preferences) { Set-ObjectProperty $userObj "preferences" $payload.preferences }

                    Write-Database $db
                    $response.StatusCode = 200
                    $res = @{ success = $true; message = "Data synced" }
                } catch {
                    $response.StatusCode = 500
                    $res = @{ error = "Sync error: $_" }
                }
            }
            $json = $res | ConvertTo-Json
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        elseif ($urlPath -eq "/api/admin/analytics" -and $request.HttpMethod -eq "GET") {
            $totalIncome = 0
            $activeUsersCount = 0
            if ($db.users) {
                $activeUsersCount = $db.users.Length
            }
            $professionCounts = @{}
            $totalSavingsValuation = 0
            $totalExpensesLogged = 0
            $categorySpent = @{}

            if ($db.userData) {
                $usernames = $db.userData.psobject.properties.name
                foreach ($username in $usernames) {
                    $data = $db.userData.$username
                    if ($null -ne $data -and $null -ne $data.profile) {
                        $totalIncome += [double]$data.profile.income
                        $prof = $data.profile.profession
                        if (-not $prof) { $prof = "Salaried" }
                        $professionCounts[$prof] = [int]$professionCounts[$prof] + 1

                        if ($null -ne $data.expenses) {
                            foreach ($exp in $data.expenses) {
                                if ($exp.bucket -eq "Savings") {
                                    $totalSavingsValuation += [double]$exp.amount
                                } else {
                                    $totalExpensesLogged += [double]$exp.amount
                                    $cat = $exp.category
                                    if (-not $cat) { $cat = "Uncategorized" }
                                    $categorySpent[$cat] = [double]$categorySpent[$cat] + [double]$exp.amount
                                }
                            }
                        }
                    }
                }
            }

            $avgIncome = if ($activeUsersCount -gt 0) { [Math]::Round($totalIncome / $activeUsersCount) } else { 0 }
            
            # Format top categories list
            $topCats = @()
            foreach ($key in $categorySpent.Keys) {
                $topCats += [PSCustomObject]@{
                    category = $key
                    amount = $categorySpent[$key]
                }
            }
            $topCatsSorted = @()
            if ($topCats) {
                $topCatsSorted = $topCats | Sort-Object amount -Descending | Select-Object -First 5
            }

            $res = @{
                totalUsers = $activeUsersCount
                avgIncome = $avgIncome
                totalExpenses = $totalExpensesLogged
                totalSavings = $totalSavingsValuation
                professionSplit = $professionCounts
                topCategories = $topCatsSorted
            }

            $json = $res | ConvertTo-Json -Depth 100
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        else {
            $response.StatusCode = 404
            $res = @{ error = "Route not found" }
            $json = $res | ConvertTo-Json
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        $response.Close()
        continue
    }

    # Static File Server Routing
    $cleanPath = $urlPath.Replace("/", "\").TrimStart("\")
    if ([string]::IsNullOrEmpty($cleanPath)) {
        $cleanPath = "index.html"
    }

    $filePath = Join-Path $PSScriptRoot $cleanPath
    
    # Fallback to index.html for Single Page App client-side routing
    if (-not (Test-Path $filePath) -or (Test-Path $filePath -PathType Container)) {
        $filePath = Join-Path $PSScriptRoot "index.html"
    }

    if (Test-Path $filePath) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = switch ($ext) {
            ".html" { "text/html" }
            ".css"  { "text/css" }
            ".js"   { "application/javascript" }
            ".png"  { "image/png" }
            ".jpg"  { "image/jpeg" }
            ".svg"  { "image/svg+xml" }
            default { "application/octet-stream" }
        }

        $response.ContentType = $contentType
        $response.StatusCode = 200

        try {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            $response.StatusCode = 500
            $errMsg = [System.Text.Encoding]::UTF8.GetBytes("Error reading file: $_")
            $response.OutputStream.Write($errMsg, 0, $errMsg.Length)
        }
    } else {
        $response.StatusCode = 404
        $notFoundMsg = [System.Text.Encoding]::UTF8.GetBytes("File not found")
        $response.OutputStream.Write($notFoundMsg, 0, $notFoundMsg.Length)
    }

    $response.Close()
}
