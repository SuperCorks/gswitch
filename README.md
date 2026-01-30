# gswitch

A CLI tool to seamlessly switch between Google Cloud configurations and update application default credentials.

## Installation

### Using npx (no installation required)
```bash
npx gswitch
```

### Global Installation
```bash
npm install -g gswitch
```

## Usage

### Switch accounts
```bash
# Interactive mode - select from available configurations
gswitch

# Direct switch by configuration name
gswitch personal
```

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

## How it works

When you switch accounts, `gswitch` automatically:
1. Activates the specified gcloud configuration
2. Updates your `application_default_credentials.json` by copying from `application_default_credentials_<account>.json`
3. Displays the current project and available projects
