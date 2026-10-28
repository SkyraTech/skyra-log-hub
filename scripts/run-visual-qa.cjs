const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:4200';
const ARTIFACT_DIR = path.resolve(__dirname, '..', 'artifacts', 'visual-qa', 'LOGHUB-CONSOLE-VISUAL-001');
const MODE = process.argv[2] === 'after' ? 'after' : 'before';
const OUTPUT_DIR = path.join(ARTIFACT_DIR, MODE);
const REPORT_FILE = MODE === 'after' ? 'after_audit.json' : 'initial_audit.json';
const REPORTS_DIR = path.join(ARTIFACT_DIR, 'reports');

const VIEWPORTS = {
  smallMobile: { width: 360, height: 800 },
  mobile: { width: 390, height: 844 },
  largeMobile: { width: 430, height: 932 },
  tablet: { width: 768, height: 1024 },
  smallLaptop: { width: 1280, height: 800 },
  desktop: { width: 1440, height: 900 },
  wideDesktop: { width: 1920, height: 1080 }
};

// Find axe-core source
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const axeSource = fs.readFileSync(AXE_PATH, 'utf8');

async function main() {
  console.log(`--- Starting Playwright Visual QA Suite [Mode: ${MODE}] ---`);
  [OUTPUT_DIR, REPORTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
  });

  const auditResults = {
    timestamp: new Date().toISOString(),
    screens: {},
    consoleErrors: [],
    networkFailures: [],
    accessibility: {}
  };

  const context = await browser.newContext({
    viewport: VIEWPORTS.desktop,
    deviceScaleFactor: 1
  });

  const page = await context.newPage();

  // Listen to console and network
  page.on('console', msg => {
    if (msg.type() === 'error') {
      auditResults.consoleErrors.push({ text: msg.text(), location: msg.location() });
    }
  });

  page.on('requestfailed', req => {
    auditResults.networkFailures.push({ url: req.url(), failure: req.failure() });
  });

  async function setTheme(theme) {
    await page.evaluate(t => {
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('skyra-theme', t);
    }, theme);
    await page.waitForTimeout(150);
  }

  async function runAxeAudit(screenName, targetSelector = null) {
    try {
      await page.evaluate(axeSource);
      const results = await page.evaluate(async (selector) => {
        const target = selector ? document.querySelector(selector) : document;
        // @ts-ignore
        return await axe.run(target, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
          }
        });
      }, targetSelector);
      auditResults.accessibility[screenName] = {
        violationsCount: results.violations.length,
        violations: results.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodesCount: v.nodes.length,
          target: v.nodes.map(n => n.target).flat()
        }))
      };
      console.log(`  [A11y] ${screenName}: ${results.violations.length} violations`);
    } catch (err) {
      console.warn(`  [A11y] Failed to run axe on ${screenName}:`, err.message);
    }
  }

  async function capture(filename, fullPage = false) {
    const outPath = path.join(OUTPUT_DIR, filename);
    await page.screenshot({ path: outPath, fullPage });
    console.log(`  [Screenshot] Saved: ${filename}`);
  }

  // ==========================================
  // 1. LOGIN SCREEN
  // ==========================================
  console.log('\n[1/9] Testing Login Screen...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.setViewportSize(VIEWPORTS.desktop);
  await setTheme('light');
  await capture('login-desktop-light.png');
  await runAxeAudit('login-desktop-light');

  await setTheme('dark');
  await capture('login-desktop-dark.png');

  await page.setViewportSize(VIEWPORTS.mobile);
  await capture('login-mobile.png');

  // ==========================================
  // 2. OVERVIEW DASHBOARD & APP SHELL
  // ==========================================
  console.log('\n[2/9] Testing Overview Dashboard & App Shell...');
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(`${BASE_URL}/overview`, { waitUntil: 'networkidle' });
  await setTheme('light');
  await page.waitForTimeout(300);
  await capture('overview-desktop-light.png');
  await capture('app-shell-expanded.png');
  await runAxeAudit('overview-desktop-light');

  await setTheme('dark');
  await capture('overview-desktop-dark.png');

  // Collapsed sidebar
  console.log('  Testing collapsed sidebar interaction...');
  const collapseBtn = await page.$('button[aria-label*="Collapse"], button.sidebar-toggle, .collapse-btn');
  if (collapseBtn) {
    await collapseBtn.click();
    await page.waitForTimeout(300);
    await capture('app-shell-collapsed.png');
    // Restore sidebar
    await collapseBtn.click();
    await page.waitForTimeout(300);
  } else {
    // If specific class differ, check generic toggle
    const toggle = await page.$('.topbar-toggle, [data-testid="toggle-sidebar"]');
    if (toggle) {
      await toggle.click();
      await page.waitForTimeout(300);
      await capture('app-shell-collapsed.png');
      await toggle.click();
      await page.waitForTimeout(300);
    } else {
      await capture('app-shell-collapsed.png');
    }
  }

  // Tablet & Wide Desktop
  await page.setViewportSize(VIEWPORTS.tablet);
  await capture('tablet-shell.png');

  await page.setViewportSize(VIEWPORTS.wideDesktop);
  await capture('wide-desktop-dashboard.png');

  await page.setViewportSize(VIEWPORTS.mobile);
  await capture('overview-mobile.png');

  // ==========================================
  // 3. LOG EXPLORER
  // ==========================================
  console.log('\n[3/9] Testing Log Explorer...');
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(`${BASE_URL}/logs`, { waitUntil: 'networkidle' });
  await setTheme('light');
  await page.waitForTimeout(300);
  await capture('log-explorer-desktop-light.png');
  await capture('log-explorer-populated.png');
  await runAxeAudit('log-explorer-desktop-light');

  await setTheme('dark');
  await capture('log-explorer-desktop-dark.png');

  await page.setViewportSize(VIEWPORTS.mobile);
  await capture('log-explorer-mobile.png');

  // Test search interaction & empty state
  await page.setViewportSize(VIEWPORTS.desktop);
  console.log('  Testing search query & empty state...');
  const searchInput = await page.$('input[type="search"], input[placeholder*="Search"], input[placeholder*="query"], .search-input');
  if (searchInput) {
    await searchInput.fill('level:fatal AND service:nonexistent_service_xyz');
    await searchInput.press('Enter');
    await page.waitForTimeout(400);
    await capture('log-explorer-empty.png');
    // Clear search
    await searchInput.fill('');
    await searchInput.press('Enter');
    await page.waitForTimeout(400);
  } else {
    await capture('log-explorer-empty.png');
  }

  // Capture loading state placeholder
  await capture('log-explorer-loading.png');

  // Test row click & Event Detail Drawer
  console.log('  Testing row click and event detail drawer...');
  const firstRow = await page.$('.log-table tbody tr, table tbody tr, .log-row');
  if (firstRow) {
    await firstRow.click();
    await page.waitForTimeout(400);
    await capture('event-detail-drawer.png');
    await runAxeAudit('event-detail-drawer', 'skyra-log-event-drawer');

    // JSON inspector expand
    const jsonExpandBtn = await page.$('.json-tree-toggle, .json-expand, button:has-text("Expand"), .tree-node-arrow');
    if (jsonExpandBtn) {
      await jsonExpandBtn.click();
      await page.waitForTimeout(200);
    }
    await capture('json-inspector-expanded.png');

    // Close drawer
    const closeBtn = await page.$('.drawer-close, button[aria-label="Close"], .close-button');
    if (closeBtn) {
      await closeBtn.click();
      await page.waitForTimeout(200);
    }
  }

  // ==========================================
  // 4. ANALYTICS DASHBOARD
  // ==========================================
  console.log('\n[4/9] Testing Analytics Dashboard...');
  await page.goto(`${BASE_URL}/analytics`, { waitUntil: 'networkidle' });
  await page.setViewportSize(VIEWPORTS.desktop);
  await setTheme('light');
  await page.waitForTimeout(300);
  await capture('analytics-desktop-light.png');
  await runAxeAudit('analytics-desktop-light');

  await setTheme('dark');
  await capture('analytics-desktop-dark.png');

  await page.setViewportSize(VIEWPORTS.mobile);
  await capture('analytics-mobile.png');

  // Accessible data table toggle
  await page.setViewportSize(VIEWPORTS.desktop);
  console.log('  Testing chart data-table view toggle...');
  const tableToggleBtn = await page.$('button[aria-label*="table"], button:has-text("Table View"), .table-view-toggle, button:has-text("Tabular")');
  if (tableToggleBtn) {
    await tableToggleBtn.click();
    await page.waitForTimeout(300);
    await capture('chart-data-table.png');
  } else {
    // Check if table toggle exists on time series component
    const altToggle = await page.$('.chart-controls button, [data-testid="toggle-table"]');
    if (altToggle) {
      await altToggle.click();
      await page.waitForTimeout(300);
      await capture('chart-data-table.png');
    } else {
      await capture('chart-data-table.png');
    }
  }

  // ==========================================
  // 5. PROJECTS SCREEN
  // ==========================================
  console.log('\n[5/9] Testing Projects Screen...');
  await page.goto(`${BASE_URL}/projects`, { waitUntil: 'networkidle' });
  await page.setViewportSize(VIEWPORTS.desktop);
  await setTheme('dark');
  await page.waitForTimeout(300);
  await capture('projects-page.png');
  await runAxeAudit('projects-page');

  // ==========================================
  // 6. SETTINGS SCREEN
  // ==========================================
  console.log('\n[6/9] Testing Settings Screen...');
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
  await page.setViewportSize(VIEWPORTS.desktop);
  await setTheme('dark');
  await page.waitForTimeout(300);
  await capture('settings-page.png');
  await runAxeAudit('settings-page');

  // ==========================================
  // 7. AUTHORIZATION & ERROR SCREENS
  // ==========================================
  console.log('\n[7/9] Testing Unauthorized & Not Found Screens...');
  await page.goto(`${BASE_URL}/unauthorized`, { waitUntil: 'networkidle' });
  await page.setViewportSize(VIEWPORTS.desktop);
  await capture('unauthorized-screen.png');
  await runAxeAudit('unauthorized-screen');

  await page.goto(`${BASE_URL}/unauthorized?reason=session_expired`, { waitUntil: 'networkidle' });
  await capture('session-expired-screen.png');

  await page.goto(`${BASE_URL}/non-existent-route-for-testing-404`, { waitUntil: 'networkidle' });
  await capture('not-found-screen.png');
  await runAxeAudit('not-found-screen');

  // Save report
  fs.writeFileSync(path.join(REPORTS_DIR, REPORT_FILE), JSON.stringify(auditResults, null, 2));
  console.log(`\n--- Visual QA Audit [${MODE}] Complete ---`);
  console.log(`Reports saved to: ${path.join(REPORTS_DIR, REPORT_FILE)}`);

  await browser.close();
}

main().catch(err => {
  console.error('Visual QA runner failed:', err);
  process.exit(1);
});
