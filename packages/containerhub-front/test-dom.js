import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/crud/user');
  await new Promise(r => setTimeout(r, 2000));

  const html = await page.evaluate(() => document.querySelector('main').innerHTML);
  console.log('--- DOM ---');
  console.log(html);

  await browser.close();
})();
