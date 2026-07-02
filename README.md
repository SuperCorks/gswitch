# gswitch

A CLI tool to seamlessly switch between Google Cloud configurations and update application default credentials.

## Installation

### Using npx (no installation required)
```bash
npx @supercorks/gswitch
```

### Global Installation
```bash
npm install -g @supercorks/gswitch
gswitch
```

## Usage

### Switch accounts
```bash
# Interactive mode - select from available configurations
gswitch

# Direct switch by configuration name
gswitch personal
```

After switching, `gswitch` prints the configuration alias and the active account email, plus the current project.

### List configurations
```bash
gswitch list
# or
gswitch ls
```

Shows all configurations with their associated email addresses.

### Add a new account
```bash
gswitch new
# Or with arguments:
gswitch new personal user@example.com
gswitch new personal user@example.com --private
gswitch new personal user@example.com --scopes=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/cloud-platform
gswitch new personal user@example.com --gmail --calendar --drive
gswitch new personal user@example.com --gmail --drive --client-id-file=~/.config/gws/client_secret.json
```

This guides you through the entire setup process:
- Create the gcloud configuration if it does not already exist
- Activate the target configuration before starting OAuth
- Log in with the selected account
- Set up application default credentials
- Save the ADC file under the configuration name for future switching
- Log in to `gws` when the Google Workspace CLI is installed
- Save `gws` credentials under the configuration name for future switching
- Re-activate the target configuration when setup completes
- Restore the live ADC file so application-default commands work immediately

Use `--private` to run both OAuth steps with `gcloud --no-launch-browser` and open the emitted auth URL in a Google Chrome incognito window.

Use `--scopes` to pass a comma-separated scope list to `gcloud auth application-default login`. `gcloud auth login` does not support that flag, so `gswitch` only applies custom scopes to the ADC step.

Use the helper flags to add common Google Workspace permissions to both ADC and `gws auth login`:
- `--gmail` adds Gmail read/write email access
- `--calendar` adds Google Calendar read/write access
- `--drive` adds Google Drive, Google Docs, and Google Sheets read/write access

When any helper flag is used, `gswitch` also includes the default Google Cloud ADC scope so the resulting ADC file still works for Google Cloud SDK workflows.

If the `gws` command is installed, `gswitch new` runs `gws auth login` with identity scopes plus any requested helper or custom scopes, then saves any `~/.config/gws/credentials.enc` or `~/.config/gws/credentials.json` file under the configuration name. Later `gswitch <account>` calls restore those saved `gws` credentials when available. If `gws` is not installed, setup continues normally.

Google blocks the default ADC OAuth client when you request Workspace scopes such as Drive, Gmail, Docs, Sheets, or Calendar. If you use those scopes, create a Desktop OAuth client in Google Cloud Console, enable the relevant APIs, and either save the downloaded JSON to `~/.config/gws/client_secret.json` or pass it with `--client-id-file`. `gswitch` uses that client for `gcloud auth application-default login`, and passes its client ID and secret to `gws auth login`.

Running `gswitch new` on an existing configuration will refresh the credentials without recreating the configuration.

### Switch projects
```bash
gswitch project
```

Interactively select a project from your available GCP projects. The current project is highlighted in the list, and projects show their organization name in parentheses when available.

## How it works

When you switch accounts, `gswitch` automatically:
1. Activates the specified gcloud configuration
2. Updates your `application_default_credentials.json` by copying from `application_default_credentials_<account>.json`
3. Displays the current project and suggests `gswitch project` to change it

If the saved ADC file for that configuration is missing, `gswitch` will show a warning and the exact `gcloud` command to regenerate it.
