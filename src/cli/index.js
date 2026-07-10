import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ui } from '../lib/ui.js';
import { gcloud } from '../lib/gcloud.js';
import { gws } from '../lib/gws.js';
import { accountContext } from '../lib/accountContext.js';
import { resolveLoginScopes, usesWorkspaceScopes } from '../lib/oauthScopes.js';
import { select, input } from '@inquirer/prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json
const pkgPath = path.join(__dirname, '../../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const productionGoogleOAuthClientFile = path.join(__dirname, '../config/google-oauth-client.json');
const localGoogleOAuthClientFile = path.join(os.homedir(), '.config/gswitch/google-oauth-client.json');

function isUserCancellation(error) {
  // Check by error name since ExitPromptError may not be directly importable
  return error?.name === 'ExitPromptError';
}

export async function run() {
  const program = new Command();

  program
    .name('gswitch')
    .description('Switch Google Cloud configurations and application default credentials')
    .version(pkg.version)
    .argument('[account]', 'The configuration name to switch to')
    .addHelpText('after', `
${chalk.bold('EXAMPLES')}
  ${chalk.dim('# Switch to "personal" configuration')}
  $ gswitch personal

  ${chalk.dim('# Select configuration interactively')}
  $ gswitch

  ${chalk.dim('# Add a new account')}
  $ gswitch new
  $ gswitch new personal user@example.com --gmail --calendar --drive

${chalk.bold('HOW TO ADD AN ACCOUNT')}
  ${chalk.cyan('gswitch new [name] [email]')}

  This will guide you through the setup process:
  - Login with the new account
  - Create and activate a gcloud configuration
  - Set up application default credentials
`)
    .action(switchAccount);

  program
    .command('new')
    .description('Create a new gcloud configuration and set up credentials')
    .argument('[name]', 'Name of the new configuration')
    .argument('[email]', 'Email address for the account')
    .option('--private', 'Open OAuth URLs in a Chrome incognito window')
    .option('--scopes <scopes>', 'Comma-separated OAuth scopes to pass to application-default login')
    .option('--client-id-file <path>', 'Desktop OAuth client JSON for application-default login')
    .option('--gmail', 'Add Gmail read/write scopes to the shared account credential')
    .option('--calendar', 'Add Google Calendar read/write scopes to the shared account credential')
    .option('--drive', 'Add Drive, Google Docs, and Google Sheets read/write scopes to the shared account credential')
    .action((name, email, options) => createAccount(name, email, options));

  program
    .command('run')
    .description('Run a command with an isolated Google account context')
    .argument('<account>', 'Configuration name to use')
    .argument('<command...>', 'Command and arguments to run after --')
    .allowUnknownOption(true)
    .action(async (account, command) => {
      process.exitCode = await runInAccount(account, command);
    });

  program
    .command('shell')
    .description('Open an interactive shell with an isolated Google account context')
    .argument('<account>', 'Configuration name to use')
    .action(async account => {
      process.exitCode = await openAccountShell(account);
    });

  program
    .command('project')
    .description('Interactively select and set the active project')
    .action(selectProject);

  program
    .command('list')
    .alias('ls')
    .description('List all available gcloud configurations')
    .action(listConfigurations);

  await program.parseAsync(process.argv);
}

async function listConfigurations() {
    const spinner = ui.spinner('Loading configurations...').start();
    try {
        const configs = await gcloud.getConfigurationsWithAccounts();
        const activeConfig = await gcloud.getActiveConfiguration();
        spinner.stop();

        if (configs.length === 0) {
            console.log(ui.warn('No gcloud configurations found.'));
            return;
        }

        console.log(ui.bold('Available Configurations:'));
        configs.forEach(({ name, account }) => {
            const accountInfo = account ? ui.dim(` (${account})`) : '';
            if (name === activeConfig) {
                console.log(ui.success(`  • ${name}`) + accountInfo + ui.success(' [current]'));
            } else {
                console.log(`  • ${name}${accountInfo}`);
            }
        });

    } catch (error) {
        spinner.fail('Failed to load configurations');
        throw error;
    }
}

export async function createAccount(name, email, options = {}) {
    try {
        if (!name) {
            name = await input({ message: 'Enter new configuration name:' });
        }
        
        if (!email) {
            email = await input({ message: 'Enter email for the account:' });
        }
    } catch (error) {
        if (isUserCancellation(error)) {
            process.exit(0);
        }
        throw error;
    }

    try {
        const scopes = resolveLoginScopes(options);
        const clientIdFile = await resolveClientIdFile(options.clientIdFile, scopes);
        const normalizedOptions = {
            ...options,
            scopes,
            clientIdFile
        };

        // Check if configuration already exists
        const configExists = await gcloud.configurationExists(name);
        if (configExists) {
            console.log(ui.info(`\nConfiguration '${name}' already exists. Refreshing credentials for ${email}...\n`));
        } else {
            console.log(ui.info(`\nSetting up new configuration '${name}' for ${email}...\n`));
        }

        // 1. Create Configuration (only if it doesn't exist)
        if (!configExists) {
            console.log(ui.bold(`\n1. Creating configuration '${name}'...`));
            await gcloud.createConfiguration(name);
        } else {
            console.log(ui.bold(`\n1. Configuration '${name}' already exists, skipping creation...`));
        }

        // 2. Activate the target config before auth mutates account settings.
        console.log(ui.bold(`\n2. Activating configuration '${name}'...`));
        await gcloud.activateConfiguration(name);

        // 3. Login
        console.log(ui.bold('\n3. Logging in...'));
        const gcloudLoginOptions = configExists
            ? { ...normalizedOptions, force: true }
            : normalizedOptions;
        await gcloud.login(email, gcloudLoginOptions);

        // 4. Set Account
        console.log(ui.bold(`\n4. Setting account to ${email}...`));
        await gcloud.setAccount(email);

        // 5. Login ADC
        console.log(ui.bold('\n5. Setting up Application Default Credentials (ADC)...'));
        await gcloud.loginAdc(email, normalizedOptions);

        // 6. Save ADC in the account profile.
        console.log(ui.bold(`\n6. Saving ADC file for '${name}'...`));
        await gcloud.saveAdc(name);

        // 7. Point gws at the same user credential instead of running another OAuth flow.
        console.log(ui.bold('\n7. Setting up Google Workspace CLI (gws)...'));
        const gwsInstalled = await gws.isInstalled();
        if (gwsInstalled) {
            const adcPath = await gcloud.getAdcPath(name);
            await gws.useAdcCredentials(name, adcPath);
            console.log(ui.success('Google Workspace CLI will reuse this profile\'s ADC.'));
        } else {
            console.log(ui.dim('gws is not installed, skipping Google Workspace CLI setup.'));
        }

        // 8. Re-activate the target config in case auth commands changed it.
        console.log(ui.bold(`\n8. Re-activating configuration '${name}'...`));
        await gcloud.activateConfiguration(name);

        // 9. Restore the active ADC file from the saved config snapshot.
        console.log(ui.bold(`\n9. Restoring ADC for '${name}'...`));
        const adcRestored = await gcloud.updateAdc(name);
        if (!adcRestored) {
            throw new Error(`Failed to restore ADC file for '${name}'`);
        }

        if (gwsInstalled) {
            await gws.updateCredentials(name);
        }

        console.log(ui.success(`\n✅ Configuration '${name}' setup complete!`));
        console.log(ui.dim(`You can now switch to it using: `) + ui.cmd(`gswitch ${name}`));

    } catch (error) {
        if (isUserCancellation(error)) {
            process.exit(0);
        }
        console.error(ui.error(`\n❌ Failed to setup configuration: ${error.message}`));
        process.exit(1);
    }
}

export async function runInAccount(account, command) {
    return accountContext.run(account, command);
}

export async function openAccountShell(account) {
    console.log(ui.info(`Opening an isolated shell for '${account}'. Exit the shell to return.`));
    return accountContext.shell(account);
}

export async function resolveClientIdFile(rawClientIdFile, scopes) {
    const requestedClientIdFile = rawClientIdFile ? expandHome(rawClientIdFile) : undefined;
    if (requestedClientIdFile) {
        if (!fs.existsSync(requestedClientIdFile)) {
            throw new Error(`OAuth client ID file not found: ${requestedClientIdFile}`);
        }

        if (usesWorkspaceScopes(scopes) && !(await gws.hasClientSecret(requestedClientIdFile))) {
            throw new Error(
                `Workspace OAuth scopes require a Desktop OAuth client JSON containing client_secret: ` +
                requestedClientIdFile
            );
        }

        return requestedClientIdFile;
    }

    const defaultClientIdFiles = [
        localGoogleOAuthClientFile,
        productionGoogleOAuthClientFile
    ];

    for (const clientIdFile of defaultClientIdFiles) {
        if (!fs.existsSync(clientIdFile)) {
            continue;
        }

        if (!usesWorkspaceScopes(scopes) || (await gws.hasClientSecret(clientIdFile))) {
            return clientIdFile;
        }
    }

    if (!usesWorkspaceScopes(scopes)) {
        return undefined;
    }

    throw new Error(
        `Workspace OAuth scopes require a Desktop OAuth client JSON containing client_secret. ` +
        `Install it at ${localGoogleOAuthClientFile} or pass --client-id-file <path>.`
    );
}

function expandHome(filePath) {
    if (filePath === '~') {
        return os.homedir();
    }

    if (filePath.startsWith('~/')) {
        return path.join(os.homedir(), filePath.slice(2));
    }

    return filePath;
}

async function selectProject() {
  const spinner = ui.spinner('Loading available projects...').start();
  
  let projects;
  let currentProject;
  try {
    [projects, currentProject] = await Promise.all([
      gcloud.getAvailableProjectsWithOrg(),
      gcloud.getCurrentProject()
    ]);
    spinner.stop();
  } catch (error) {
    spinner.fail('Failed to load projects');
    throw error;
  }

  if (projects.length === 0) {
    console.log(ui.warn('No projects found or failed to list projects.'));
    return;
  }

  let selectedProject;
  try {
    selectedProject = await select({
      message: 'Select a project:',
      choices: projects.map(p => {
        const orgSuffix = p.orgName ? ` ${ui.dim(`(${p.orgName})`)}` : '';
        const currentSuffix = p.projectId === currentProject ? ' (current)' : '';
        return {
          value: p.projectId,
          name: `${p.projectId}${orgSuffix}${currentSuffix}`
        };
      }),
      default: currentProject || undefined,
    });
  } catch (error) {
    if (isUserCancellation(error)) {
      process.exit(0);
    }
    throw error;
  }

  if (selectedProject === currentProject) {
    console.log(ui.dim(`Already using project '${selectedProject}'.`));
    return;
  }

  const setSpinner = ui.spinner(`Setting project to '${selectedProject}'...`).start();
  try {
    await gcloud.setProject(selectedProject);
    setSpinner.succeed(ui.success(`Project set to: ${ui.bold(selectedProject)}`));
  } catch (error) {
    setSpinner.fail(`Failed to set project`);
    throw error;
  }
}

async function switchAccount(account) {
  const spinner = ui.spinner('Loading configurations...').start();
  
  let configs;
  try {
    configs = await gcloud.getConfigurations();
    spinner.stop();
  } catch (error) {
    spinner.fail('Failed to load configurations');
    throw error;
  }

  // If no account provided, ask user to select one
  if (!account) {
    if (configs.length === 0) {
      console.log(ui.warn('No gcloud configurations found.'));
      return;
    }

    const activeConfig = await gcloud.getActiveConfiguration();
    
    try {
      account = await select({
        message: 'Select a gcloud configuration:',
        choices: configs.map(c => ({ 
          value: c, 
          name: c === activeConfig ? `${c} (current)` : c 
        })),
        default: activeConfig || undefined,
      });
    } catch (error) {
      if (isUserCancellation(error)) {
        process.exit(0);
      }
      throw error;
    }
  }

  // Validate account
  if (!configs.includes(account)) {
    throw new Error(`Configuration '${account}' does not exist.\nAvailable configurations: ${configs.join(', ')}`);
  }

  // Activate config
  const switchSpinner = ui.spinner(`Switching to '${account}'...`).start();
  try {
    await gcloud.activateConfiguration(account);
    const email = await gcloud.getCurrentAccount();
    const accountDisplay = email ? `${ui.bold(account)} ${ui.dim(`(${email})`)}` : ui.bold(account);
    switchSpinner.succeed(ui.success(`Switched to account: ${accountDisplay}`));
  } catch (error) {
    switchSpinner.fail(`Failed to switch to '${account}'`);
    throw error;
  }

  // Update ADC
  const adcUpdated = await gcloud.updateAdc(account);
  if (!adcUpdated) {
    console.log(ui.warn(`⚠️  Warning: Application-default credentials file is missing for '${account}'.`));
    console.log(ui.hint('Refresh the account profile:'));
    const currentAccountEmail = await gcloud.getCurrentAccount();
    console.log(ui.cmd(`gswitch new ${account}${currentAccountEmail ? ` ${currentAccountEmail}` : ''}`));
    console.log(ui.dim('Add only the --gmail, --calendar, and --drive flags this profile needs.'));
  }

  const gwsInstalled = await gws.isInstalled();
  if (gwsInstalled) {
    const gwsUpdated = await gws.updateCredentials(account);
    if (gwsUpdated) {
      console.log(ui.success('Google Workspace CLI credentials updated.'));
    } else {
      console.log(ui.warn(`⚠️  Warning: Google Workspace CLI credentials are missing for '${account}'.`));
      console.log(ui.hint('Refresh the shared account credential:'));
      const currentAccountEmail = await gcloud.getCurrentAccount();
      console.log(ui.cmd(
        `gswitch new ${account}${currentAccountEmail ? ` ${currentAccountEmail}` : ''} --gmail --calendar --drive`
      ));
      console.log(ui.dim('Remove any Workspace scope flags the profile does not need.'));
    }
  }

  // Show Project Info
  const projectSpinner = ui.spinner('Fetching project info...').start();
  const currentProject = await gcloud.getCurrentProject();
  projectSpinner.stop();

  console.log(ui.kv('🌍 Current Project', currentProject ? ui.success(currentProject) : ui.dim('None')));
  console.log(ui.dim('To change project, run: ') + ui.cmd('gswitch project'));
}
