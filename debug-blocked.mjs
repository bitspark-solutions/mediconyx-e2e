import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text().slice(0, 300)); });
page.on('pageerror', e => console.log('PAGE ERROR:', String(e).slice(0, 300)));
await page.goto('http://localhost:9674/login');
await page.locator('input[type="email"]').first().fill('karim.hassan@patient.local');
await page.locator('input[type="password"]').first().fill('Patient@123');
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(3000);
console.log('after login URL:', page.url());
await page.goto('http://localhost:9674/portal/doctor');
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(2000);
  const text = (await page.locator('body').innerText()).replace(/\n/g, ' | ').slice(0, 150);
  console.log(`t=${(i+1)*2}s URL:`, page.url(), ' BODY:', text || '(empty)');
}
await browser.close();
