import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ui } from '../lib/ui.js';
import { gcloud } from '../lib/gcloud.js';
import { select, input } from '@inquirer/prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json
const pkgPath = path.join(__dirname, '../../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

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
    .action(createAccount);

  program
    .command('list')
    .alias('ls')
    .description('List all available gcloud configurations')
    .action(listConfigurations);

  program.parse(process.argv);
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

async function createAccount(name, email) {
    if (!name) {
        name = await input({ message: 'Enter new configuration name:' });
    }
    
    if (!email) {
        email = await input({ message: 'Enter email for the account:' });
    }

    console.log(ui.info(`\nSetting up new configuration '${name}' for ${email}...\n`));

    try {
        // 1. Login
        console.log(ui.bold('1. Logging in...'));
        await gcloud.login(email);
        
        // 2. Create Configuration
        console.log(ui.bold(`\n2. Creating configuration '${name}'...`));
        try {
            await gcloud.createConfiguration(name);
        } catch (e) {
            console.log(ui.warn(`Configuration '${name}' might already exist, proceeding...`));
        }

        // 3. Activate
        console.log(ui.bold(`\n3. Activating configuration '${name}'...`));
        await gcloud.activateConfiguration(name);

        // 4. Set Account
        console.log(ui.bold(`\n4. Setting account to ${email}...`));
        await gcloud.setAccount(email);

        // 5. Login ADC
        console.log(ui.bold('\n5. Setting up Application Default Credentials (ADC)...'));
        await gcloud.loginAdc(email);

        // 6. Rename ADC file
        console.log(ui.bold(`\n6. Saving ADC file for '${name}'...`));
        await gcloud.saveAdc(name);

        console.log(ui.success(`\n✅ Configuration '${name}' setup complete!`));
        console.log(ui.dim(`You can now switch to it using: `) + ui.cmd(`gswitch ${name}`));

    } catch (error) {
        console.error(ui.error(`\n❌ Failed to setup configuration: ${error.message}`));
        process.exit(1);
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
    
    account = await select({
      message: 'Select a gcloud configuration:',
      choices: configs.map(c => ({ 
        value: c, 
        name: c === activeConfig ? `${c} (current)` : c 
      })),
      default: activeConfig || undefined,
    });
  }

  // Validate account
  if (!configs.includes(account)) {
    throw new Error(`Configuration '${account}' does not exist.\nAvailable configurations: ${configs.join(', ')}`);
  }

  // Activate config
  const switchSpinner = ui.spinner(`Switching to '${account}'...`).start();
  try {
    await gcloud.activateConfiguration(account);
    switchSpinner.succeed(ui.success(`Switched to account: ${ui.bold(account)}`));
  } catch (error) {
    switchSpinner.fail(`Failed to switch to '${account}'`);
    throw error;
  }

  // Update ADC
  const adcUpdated = await gcloud.updateAdc(account);
  if (adcUpdated) {
    console.log(ui.success('✅ Application-default credentials updated.'));
  } else {
    console.log(ui.warn(`⚠️  Warning: Application-default credentials file is missing for '${account}'.`));
    console.log(ui.hint('Run the following command to generate it:'));
    
    // Attempt to get the account email to make the hint more accurate, or just show the generic command
    // The bash script does: gcloud auth application-default login --account=$(gcloud config get-value account)
    // We can just show that literally or pre-evaluate it.
    // Let's pre-evaluate it for better UX.
    const currentAccountEmail = await gcloud.getCurrentAccount();
    const cmd = `gcloud auth application-default login${currentAccountEmail ? ` --account=${currentAccountEmail}` : ''}`;
    
    console.log(ui.cmd(cmd));
    console.log(ui.dim('Then rename the generated file to match your config name:'));
    console.log(ui.cmd(`mv ~/.config/gcloud/application_default_credentials.json ~/.config/gcloud/application_default_credentials_${account}.json`));
  }

  // Show Project Info
  const projectSpinner = ui.spinner('Fetching project info...').start();
  const currentProject = await gcloud.getCurrentProject();
  const projects = await gcloud.getAvailableProjects();
  projectSpinner.stop();

  console.log();
  console.log(ui.kv('🌍 Current Project', currentProject ? ui.success(currentProject) : ui.dim('None')));
  
  if (projects.length > 0) {
    // If too many projects, maybe don't list them all inline
    const projectList = projects.join(', ');
    console.log(ui.kv('📜 Available Projects', projectList));
  } else {
    console.log(ui.dim('No other projects found or failed to list projects.'));
  }
}
