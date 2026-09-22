import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/crud/user');
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'screenshot_user.png' });
  await browser.close();
})();
