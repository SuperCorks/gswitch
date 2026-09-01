import { gcloud } from '../lib/gcloud.js';
import { ui } from '../lib/ui.js';

const url = process.argv.at(-1);

if (!url?.startsWith('http')) {
  console.error('gswitch OAuth browser helper did not receive a valid URL.');
  process.exitCode = 1;
} else {
  const browserUrl = process.env.GSWITCH_OAUTH_FORCE_CONSENT === '1'
    ? gcloud.addConsentPrompt(url)
    : url;

  try {
    await gcloud.launchChrome(browserUrl, {
      private: process.env.GSWITCH_OAUTH_PRIVATE === '1'
    });
  } catch (error) {
    console.error(ui.warn(`Could not launch Google Chrome: ${error.message}`));
    console.error(ui.hint(`Open this URL in Chrome manually: ${browserUrl}`));
    process.exitCode = 1;
  }
}
