const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: "new"});
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));
  
  console.log("Loading index.html...");
  await page.goto('http://localhost:8000/index.html');
  await page.waitForTimeout(2000);
  
  console.log("Loading admin.html...");
  await page.goto('http://localhost:8000/admin.html');
  await page.waitForTimeout(2000);
  
  await browser.close();
})();
