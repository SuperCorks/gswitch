# gswitch

A CLI tool to seamlessly switch between Google Cloud configurations and update application default credentials.

## Installation

### Using npx (no installation required)
```bash
npx gswitch [account]
```

### Global Installation
Install globally to use the `gswitch` command anywhere:

```bash
npm install -g .
# Or if published to npm
# npm install -g gswitch
```

## Usage

**Interactive Mode:**
Run without arguments to select from available configurations:
```bash
gswitch
```

**Direct Switch:**
Switch directly by providing the configuration name:
```bash
gswitch personal
gswitch work
```

## How it works
When you switch accounts, `gswitch` automatically:
1. Activates the specified gcloud configuration
2. Displays spinner while switching
3. Updates your `application_default_credentials.json` by copying from `application_default_credentials_<account>.json`
4. Displays the current project and other available projects

## Adding a new account for gswitch

The easiest way to add a new account is with the `new` command:

```bash
gswitch new
# Or with arguments:
gswitch new personal user@example.com
```

This will guide you through the entire setup process automatically.
