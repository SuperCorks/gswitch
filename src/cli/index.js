import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ui } from '../lib/ui.js';
import { gcloud } from '../lib/gcloud.js';
import { select } from '@inquirer/prompts';

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

${chalk.bold('HOW TO ADD AN ACCOUNT')}
  1. Login with new account:
     ${chalk.cyan('gcloud auth login --account=user@example.com')}
  2. Create new configuration:
     ${chalk.cyan('gcloud config configurations create <name>')}
  3. Activate it:
     ${chalk.cyan('gcloud config configurations activate <name>')}
  4. Set account:
     ${chalk.cyan('gcloud config set account user@example.com')}
  5. Login for application default credentials:
     ${chalk.cyan('gcloud auth application-default login --account=user@example.com')}
  6. Rename the credentials file to match your config:
     ${chalk.cyan('mv ~/.config/gcloud/application_default_credentials.json ~/.config/gcloud/application_default_credentials_<name>.json')}
  7. Now you can switch:
     ${chalk.cyan('gswitch <name>')}
`);

  program.parse(process.argv);
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

    // Get current active config (not implemented in gcloud.js yet, but helpful to highlight default)
    // For now just list them
    
    account = await select({
      message: 'Select a gcloud configuration:',
      choices: configs.map(c => ({ value: c, name: c })),
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
