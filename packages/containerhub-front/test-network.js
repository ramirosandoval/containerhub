import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  page.on('request', request => {
    console.log('>>', request.method(), request.url());
  });
  page.on('response', response => {
    console.log('<<', response.status(), response.url());
  });

  await page.goto('http://localhost:5173/crud/user', { waitUntil: 'networkidle0' });

  await browser.close();
})();
