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
```

This guides you through the entire setup process:
- Login with the new account
- Create and activate a gcloud configuration
- Set up application default credentials

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
