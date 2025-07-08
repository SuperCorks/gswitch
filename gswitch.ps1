param (
    [string]$account
)

# Define paths
$gcloudConfigPath = "$env:APPDATA\gcloud\application_default_credentials.json"
$appDefaultCredentialsPath = "$env:APPDATA\gcloud\application_default_credentials_$account.json"

# Get available configurations
$availableConfigs = gcloud config configurations list --format="value(name)"

# Validate the account exists
if ($availableConfigs -notcontains $account) {
    Write-Host "❌ Error: Configuration '$account' does not exist." -ForegroundColor Red
    Write-Host "Available configurations: $availableConfigs"
    Write-Host "Usage: .\switch-gcp-account.ps1 hop or .\switch-gcp-account.ps1 rk"
    exit 1
}

# Activate the configuration
gcloud config configurations activate $account
Write-Host "✅ Switched to account: $account"

# Check if application-default credentials exist
if (-Not (Test-Path $appDefaultCredentialsPath)) {
    Write-Host "⚠️ Warning: Application-default credentials file is missing for '$account'." -ForegroundColor Yellow
    Write-Host "Run the following command to generate it:"
    Write-Host "gcloud auth application-default login --account=$(gcloud config get-value account)" -ForegroundColor Cyan
} else {
    Copy-Item $appDefaultCredentialsPath $gcloudConfigPath -Force
    Write-Host "✅ Application-default credentials updated."
}

# Get the current project
$currentProject = gcloud config get-value project --quiet

# Get available project IDs
$projects = gcloud projects list --format="value(projectId)"
$projectList = $projects -join ", "

# Print the information
Write-Host "🌍 Current Project: $currentProject"
Write-Host "📜 Available Projects: $projectList"


# TO ADD AN ACCOUNT:
# e.g. named 'sim' with my personal email
# > gcloud auth login --account=simoncorcos.ing@gmail.com
# > gcloud config configurations create sim
# > gcloud config configurations activate sim
# > gcloud config set account simoncorcos.ing@gmail.com
# > gcloud auth application-default login --account=simoncorcos.ing@gmail.com
# > Copy-Item "$env:APPDATA\gcloud\application_default_credentials.json" "$env:APPDATA\gcloud\application_default_credentials_sim.json"
# > gswitch sim