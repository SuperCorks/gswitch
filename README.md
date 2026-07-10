# gswitch

A CLI tool for fast, isolated Google account contexts across `gcloud`, Application Default Credentials, Google client libraries, and `gws`.

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

This global mode updates the active `gcloud`, ADC, and `gws` credential slots for interactive use. For agents and concurrent scripts, prefer the isolated commands below.

### Run commands in an isolated account
```bash
gswitch run rk -- gcloud projects list
gswitch run rk -- gws drive files list --params '{"pageSize": 10}'
gswitch run sim -- node scripts/sync-drive.js
```

`gswitch run` does not activate a global configuration or overwrite the live ADC and `gws` files. It scopes the selected account to the child process with:

- `CLOUDSDK_ACTIVE_CONFIG_NAME`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `GOOGLE_WORKSPACE_CLI_CONFIG_DIR`
- `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE` when the profile does not have a legacy dedicated `gws` credential

This allows different agents and scripts to use different Google accounts concurrently.

### Open an isolated shell
```bash
gswitch shell rk
```

Commands launched inside the shell inherit the selected account context. Exit the shell to return to the parent environment.

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
gswitch new personal user@example.com --gmail --drive --client-id-file=/path/to/client_secret.json
```

This guides you through the entire setup process:
- Create the gcloud configuration if it does not already exist
- Activate the target configuration before starting OAuth
- Log in with the selected account
- Set up application default credentials
- Save ADC under `~/.config/gswitch/profiles/<name>/adc.json`
- Configure `gws` to reuse the same ADC instead of running another OAuth flow
- Re-activate the target configuration when setup completes
- Restore the live ADC file so application-default commands work immediately

Use `--private` to run both OAuth steps with `gcloud --no-launch-browser` and open the emitted auth URL in a Google Chrome incognito window.

Use `--scopes` to pass a comma-separated scope list to `gcloud auth application-default login`. `gcloud auth login` does not support that flag, so `gswitch` only applies custom scopes to the ADC step. When custom scopes are requested, `gswitch` also adds `openid` and the Google account email scope so gcloud can verify that the browser returned the requested account.

Use the helper flags to add common Google Workspace permissions to the shared ADC used by Google client libraries and `gws`:
- `--gmail` adds Gmail read/write email access
- `--calendar` adds Google Calendar read/write access
- `--drive` adds Google Drive, Google Docs, and Google Sheets read/write access

When any helper flag is used, `gswitch` also includes the default Google Cloud ADC scope so the resulting ADC file still works for Google Cloud SDK workflows.

If `gws` is installed, `gswitch new` marks the profile to use its ADC directly. Scoped commands point `gws` at `adc.json` instead of duplicating the credential. This avoids a third browser login and keeps Google Cloud libraries and Workspace commands on the same account and scope grant.

Profiles imported from older `gswitch` versions retain their dedicated encrypted `gws` credential for compatibility and rollback. Refreshing one with `gswitch new <name> <email> --gmail --calendar --drive` consolidates it onto the new shared ADC model without deleting the encrypted profile copy.

Google blocks the default ADC OAuth client when you request Workspace scopes such as Drive, Gmail, Docs, Sheets, or Calendar. Published `gswitch` packages temporarily bundle the verified GTM Manager Desktop OAuth client, including the installed-app `client_secret` required by `gcloud auth application-default login`. The client is injected from a protected GitHub Actions environment during release and is not stored in the source repository. This fallback will be replaced by the dedicated `gswitch` client after Google verifies it.

`gswitch` still prefers `~/.config/gswitch/google-oauth-client.json` when present. To use a different OAuth client explicitly, pass a Desktop client JSON with `--client-id-file`. The resulting ADC contains the client information and refresh token needed by both Google client libraries and `gws`.

Maintainers publish by updating the package version and pushing the matching `v<version>` tag. The publish workflow tests the tagged commit, injects `GSWITCH_OAUTH_CLIENT_JSON`, verifies the package contents, and authenticates to npm through trusted publishing with short-lived OIDC credentials.

Desktop OAuth client configuration is distributed app identity, not a user credential. The package never includes user access tokens, refresh tokens, ADC files, or `gws` credentials.

Running `gswitch new` on an existing configuration will refresh the credentials without recreating the configuration.

### Switch projects
```bash
gswitch project
```

Interactively select a project from your available GCP projects. The current project is highlighted in the list, and projects show their organization name in parentheses when available.

## How it works

Account profiles live under `~/.config/gswitch/profiles/<name>/`. Existing ADC and `gws` snapshots from older releases are imported into this directory the first time a profile is used; the legacy files are left in place as rollback copies.

When you switch accounts globally, `gswitch` automatically:
1. Activates the specified gcloud configuration
2. Restores the profile ADC to the standard `application_default_credentials.json` location
3. Points the global `gws` slot at shared ADC or restores a legacy encrypted `gws` credential
4. Displays the current project and suggests `gswitch project` to change it

`gswitch run` and `gswitch shell` leave all three global slots untouched and select the profile only through child-process environment variables.

ADC is an OAuth refresh-token credential stored as plaintext JSON with file mode `600`. Scoped mode reads the profile ADC directly. Global compatibility mode also copies it to `~/.config/gws/credentials.json` so bare `gws` commands work outside an isolated shell. While shared ADC is active, `gswitch` moves a legacy global `client_secret.json` to `client_secret.json.gswitch-disabled` so it cannot override the ADC quota project; switching to a legacy encrypted profile restores it. Encrypted legacy profile credentials remain available as rollback data.
