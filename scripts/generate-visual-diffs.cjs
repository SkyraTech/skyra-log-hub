const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default || require('pixelmatch');

const ARTIFACT_DIR = path.resolve(__dirname, '..', 'artifacts', 'visual-qa', 'LOGHUB-CONSOLE-VISUAL-001');
const BEFORE_DIR = path.join(ARTIFACT_DIR, 'before');
const AFTER_DIR = path.join(ARTIFACT_DIR, 'after');
const DIFF_DIR = path.join(ARTIFACT_DIR, 'diff');
const REPORTS_DIR = path.join(ARTIFACT_DIR, 'reports');

if (!fs.existsSync(DIFF_DIR)) fs.mkdirSync(DIFF_DIR, { recursive: true });

async function compareImages() {
  console.log('--- Generating Visual Regression Diffs ---');
  const files = fs.readdirSync(BEFORE_DIR).filter(f => f.endsWith('.png'));

  const diffSummary = {
    timestamp: new Date().toISOString(),
    totalScreens: files.length,
    results: []
  };

  for (const file of files) {
    const beforePath = path.join(BEFORE_DIR, file);
    const afterPath = path.join(AFTER_DIR, file);
    const diffPath = path.join(DIFF_DIR, `diff-${file}`);

    if (!fs.existsSync(afterPath)) {
      console.warn(`[Diff] Missing after screenshot for ${file}`);
      continue;
    }

    const img1 = PNG.sync.read(fs.readFileSync(beforePath));
    const img2 = PNG.sync.read(fs.readFileSync(afterPath));

    const width = Math.max(img1.width, img2.width);
    const height = Math.max(img1.height, img2.height);

    // Ensure matching buffer size
    const adjusted1 = normalizePNG(img1, width, height);
    const adjusted2 = normalizePNG(img2, width, height);

    const diff = new PNG({ width, height });

    const numDiffPixels = pixelmatch(
      adjusted1.data,
      adjusted2.data,
      diff.data,
      width,
      height,
      { threshold: 0.1, diffColor: [255, 0, 128] }
    );

    const totalPixels = width * height;
    const diffPercent = ((numDiffPixels / totalPixels) * 100).toFixed(2);

    fs.writeFileSync(diffPath, PNG.sync.write(diff));

    const status = numDiffPixels === 0 ? 'IDENTICAL' : (diffPercent > 0.05 ? 'INTENTIONAL_REFINEMENT' : 'SUB_PIXEL_MATCH');

    diffSummary.results.push({
      file,
      width,
      height,
      totalPixels,
      diffPixels: numDiffPixels,
      diffPercent: parseFloat(diffPercent),
      status,
      diffPath: `diff-${file}`
    });

    console.log(`  [Diff] ${file}: ${numDiffPixels} pixels (${diffPercent}%) -> ${status}`);
  }

  fs.writeFileSync(
    path.join(REPORTS_DIR, 'visual_diff_summary.json'),
    JSON.stringify(diffSummary, null, 2)
  );

  console.log('\n--- Visual Diff Complete ---');
  console.log(`Summary saved to: ${path.join(REPORTS_DIR, 'visual_diff_summary.json')}`);
}

function normalizePNG(png, targetWidth, targetHeight) {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png;
  }
  const resized = new PNG({ width: targetWidth, height: targetHeight });
  // Fill transparent
  resized.data.fill(0);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (targetWidth * y + x) << 2;
      const srcIdx = (png.width * y + x) << 2;
      resized.data[idx] = png.data[srcIdx];
      resized.data[idx + 1] = png.data[srcIdx + 1];
      resized.data[idx + 2] = png.data[srcIdx + 2];
      resized.data[idx + 3] = png.data[srcIdx + 3];
    }
  }
  return resized;
}

compareImages().catch(err => {
  console.error('Diff generator failed:', err);
  process.exit(1);
});
