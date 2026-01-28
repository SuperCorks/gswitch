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

To set up a new account (e.g., 'personal') so it works with `gswitch`:

1.  **Login with the new account:**
    ```bash
    gcloud auth login --account=user@example.com
    ```

2.  **Create and activate a new configuration:**
    ```bash
    gcloud config configurations create personal
    gcloud config configurations activate personal
    gcloud config set account user@example.com
    ```

3.  **Generate application default credentials:**
    ```bash
    gcloud auth application-default login --account=user@example.com
    ```

4.  **Save the credentials for gswitch:**
    Rename the generated credentials file to match your configuration name:
    ```bash
    mv ~/.config/gcloud/application_default_credentials.json ~/.config/gcloud/application_default_credentials_personal.json
    ```

Now you can use `gswitch personal` or select it from the interactive list.
