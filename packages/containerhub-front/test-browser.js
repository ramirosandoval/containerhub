import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('http://localhost:5173/settings');
  await new Promise(r => setTimeout(r, 2000));
  console.log('--- BROWSER ERRORS ---');
  console.log(errors.join('\n'));
  console.log('--- URL ---');
  console.log(page.url());
  await browser.close();
})();
