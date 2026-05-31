/**
 * Rendert trainer-praesentation/deck.html zu scharfen PNG-Folien (Puppeteer)
 * und setzt sie per jsPDF zu pulsly-trainer-praesentation.pdf zusammen.
 * Lauf: cd e:/Projekte/ProjektFit/landingpage && node scripts/render-trainer-deck.mjs
 */
import puppeteer from 'puppeteer';
import { jsPDF } from 'jspdf';
import fs from 'fs';

const DECK = 'file:///e:/Projekte/ProjektFit/trainer-praesentation/deck.html';
const OUTDIR = 'e:/Projekte/ProjektFit/trainer-praesentation/preview-v2';
const PDF = 'e:/Projekte/ProjektFit/trainer-praesentation/pulsly-trainer-praesentation.pdf';
fs.mkdirSync(OUTDIR, { recursive: true });

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
await page.goto(DECK, { waitUntil: 'networkidle0', timeout: 60000 });
try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
await new Promise(r => setTimeout(r, 1000));

const slides = await page.$$('.slide');
const imgs = [];
for (let i = 0; i < slides.length; i++) {
  const f = `${OUTDIR}/slide-${String(i + 1).padStart(2, '0')}.jpg`;
  await slides[i].screenshot({ path: f, type: 'jpeg', quality: 88 });
  imgs.push(f);
  console.log('Folie', i + 1, 'gerendert');
}
await browser.close();

const W = 297, H = 167; // 16:9
const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H] });
imgs.forEach((f, i) => {
  if (i > 0) doc.addPage([W, H], 'landscape');
  const b = fs.readFileSync(f).toString('base64');
  doc.addImage('data:image/jpeg;base64,' + b, 'JPEG', 0, 0, W, H);
});
fs.writeFileSync(PDF, Buffer.from(doc.output('arraybuffer')));
console.log('\nFertig:', PDF, '·', imgs.length, 'Folien');
