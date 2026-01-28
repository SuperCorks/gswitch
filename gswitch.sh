#!/bin/bash
# https://github.com/SuperCorks/gswitch

account="$1"

# Define paths
gcloud_config_path="$HOME/.config/gcloud/application_default_credentials.json"
app_default_credentials_path="$HOME/.config/gcloud/application_default_credentials_${account}.json"

# Check if account argument is provided
if [ -z "$account" ]; then
    echo "❌ Error: No configuration name provided."
    echo "Usage: gswitch <account>"
    exit 1
fi

# Get available configurations
available_configs=$(gcloud config configurations list --format="value(name)")

# Validate the account exists
if ! echo "$available_configs" | grep -qx "$account"; then
    echo "❌ Error: Configuration '$account' does not exist."
    echo "Available configurations: $(echo $available_configs | tr '\n' ' ')"
    echo "Usage: gswitch <account>"
    exit 1
fi

# Activate the configuration
gcloud config configurations activate "$account"
echo "✅ Switched to account: $account"

# Check if application-default credentials exist
if [ ! -f "$app_default_credentials_path" ]; then
    echo "⚠️ Warning: Application-default credentials file is missing for '$account'."
    echo "Run the following command to generate it:"
    echo "gcloud auth application-default login --account=\$(gcloud config get-value account)"
else
    cp "$app_default_credentials_path" "$gcloud_config_path"
    echo "✅ Application-default credentials updated."
fi

# Get the current project
current_project=$(gcloud config get-value project --quiet 2>/dev/null)

# Get available project IDs
projects=$(gcloud projects list --format="value(projectId)" 2>/dev/null)
project_list=$(echo "$projects" | tr '\n' ', ' | sed 's/,$//')

# Print the information
echo "🌍 Current Project: $current_project"
echo "📜 Available Projects: $project_list"


# TO ADD AN ACCOUNT:
# e.g. named 'sim' with my personal email
# > gcloud auth login --account=simoncorcos.ing@gmail.com
# > gcloud config configurations create sim
# > gcloud config configurations activate sim
# > gcloud config set account simoncorcos.ing@gmail.com
# > gcloud auth application-default login --account=simoncorcos.ing@gmail.com
# > cp "$HOME/.config/gcloud/application_default_credentials.json" "$HOME/.config/gcloud/application_default_credentials_sim.json"
# > gswitch sim
