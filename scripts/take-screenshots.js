// Screenshot-Script: Erstellt Desktop + Mobile Screenshots der Landingpage-Dateien
// Nutzt Puppeteer mit Headless Chrome

const puppeteer = require('puppeteer');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const OUTPUT = path.join(BASE, 'output');

const DESKTOP = { width: 1440, height: 900 };
const MOBILE  = { width: 390, height: 844 };

// Pages to screenshot
const pages = [
  {
    file: path.join(BASE, 'index.html'),
    name: 'landingpage-buchung',
    label: 'Landingpage – Buchungs-Sektion',
    // We'll scroll to the booking-flow section
    scrollTo: '.booking-flow',
    fullPage: false,
  },
  {
    file: path.join(BASE, 'trainer', 'index.html'),
    name: 'trainer-bewerbung',
    label: 'Trainer-Bewerbungsseite',
    fullPage: true,
  },
  {
    file: path.join(BASE, 'trainer-portal', 'onboarding.html'),
    name: 'trainer-onboarding',
    label: 'Trainer-Portal Onboarding',
    fullPage: true,
  },
  {
    file: path.join(BASE, 'sitemap.xml'),
    name: 'sitemap',
    label: 'Sitemap XML',
    fullPage: true,
    desktopOnly: true, // XML looks the same on mobile
  },
];

async function takeScreenshot(page, config, viewport, suffix) {
  const fileUrl = `file:///${config.file.replace(/\\/g, '/')}`;

  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: suffix === 'mobile' ? 2 : 1,
  });

  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });

  // Force all .reveal elements to be visible (they rely on IntersectionObserver)
  await page.evaluate(() => {
    document.querySelectorAll('.reveal').forEach(el => {
      el.classList.add('visible');
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  });

  // Wait a bit for fonts and animations
  await new Promise(r => setTimeout(r, 1500));

  // If we need to scroll to a specific section, screenshot that section's bounding box
  if (config.scrollTo && !config.fullPage) {
    const clipRect = await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      // Add some padding above/below
      const pad = 40;
      return {
        x: 0,
        y: Math.max(0, rect.top + window.scrollY - pad),
        width: document.documentElement.clientWidth,
        height: rect.height + pad * 2,
      };
    }, config.scrollTo);

    if (!clipRect) {
      console.warn(`  ⚠ Selector "${config.scrollTo}" not found, taking full page`);
      config.fullPage = true;
    } else {
      // Use clip to capture just this section
      config._clip = clipRect;
    }
  }

  const filename = `${config.name}-${suffix}.png`;
  const filepath = path.join(OUTPUT, filename);

  const screenshotOpts = {
    path: filepath,
    fullPage: config.fullPage,
  };
  if (config._clip) {
    screenshotOpts.clip = config._clip;
    screenshotOpts.fullPage = false;
  }
  await page.screenshot(screenshotOpts);

  console.log(`  ✓ ${filename}`);
  return filepath;
}

async function main() {
  console.log('Starting Puppeteer...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const results = [];

  for (const config of pages) {
    console.log(`📸 ${config.label}`);

    // Desktop
    const desktop = await takeScreenshot(page, config, DESKTOP, 'desktop');
    results.push(desktop);

    // Mobile (unless desktop-only)
    if (!config.desktopOnly) {
      const mobile = await takeScreenshot(page, config, MOBILE, 'mobile');
      results.push(mobile);
    }

    console.log('');
  }

  await browser.close();

  console.log(`\n✅ ${results.length} Screenshots gespeichert in: ${OUTPUT}`);
  results.forEach(f => console.log(`   ${path.basename(f)}`));
}

main().catch(err => {
  console.error('Screenshot-Script fehlgeschlagen:', err);
  process.exit(1);
});
