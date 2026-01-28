import ora from 'ora';
import chalk from 'chalk';

export class UI {
  /**
   * Creates and returns a spinner instance.
   * @param {string} text 
   * @returns {import('ora').Ora}
   */
  spinner(text) {
    return ora(text);
  }

  /**
   * Colors text green.
   * @param {string} text 
   * @returns {string}
   */
  success(text) {
    return chalk.green(text);
  }

  /**
   * Colors text red.
   * @param {string} text 
   * @returns {string}
   */
  error(text) {
    return chalk.red(text);
  }

  /**
   * Colors text yellow.
   * @param {string} text 
   * @returns {string}
   */
  warn(text) {
    return chalk.yellow(text);
  }

  /**
   * Colors text blue/cyan for info.
   * @param {string} text 
   * @returns {string}
   */
  info(text) {
    return chalk.cyan(text);
  }

  /**
   * Bold text.
   * @param {string} text 
   * @returns {string}
   */
  bold(text) {
    return chalk.bold(text);
  }
  
  /**
   * Colors text gray.
   * @param {string} text 
   * @returns {string}
   */
  dim(text) {
    return chalk.gray(text);
  }

  /**
   * Formats a hint/tip message
   * @param {string} text 
   * @returns {string}
   */
  hint(text) {
    return chalk.dim(`💡 ${text}`);
  }

  /**
   * Formats a command suggestion
   * @param {string} cmd 
   * @returns {string}
   */
  cmd(cmd) {
    return chalk.cyan.bold(cmd);
  }

  /**
   * Formats a file path
   * @param {string} filePath 
   * @returns {string}
   */
  path(filePath) {
    return chalk.underline(filePath);
  }

  /**
   * Formats a list of available options
   * @param {string[]} items 
   * @returns {string}
   */
  list(items) {
    return items.map(item => chalk.cyan(`  • ${item}`)).join('\n');
  }

  /**
   * Formats a key-value pair
   * @param {string} key 
   * @param {string} value 
   * @returns {string}
   */
  kv(key, value) {
    return `${chalk.dim(key + ':')} ${value}`;
  }
}

export const ui = new UI();
