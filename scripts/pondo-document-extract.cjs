const { PDFParse } = require("pdf-parse");
const Tesseract = require("tesseract.js");
const {
  createCanvas,
  DOMMatrix,
  ImageData,
  loadImage,
  Path2D,
} = require("@napi-rs/canvas");

if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrix;
if (!globalThis.ImageData) globalThis.ImageData = ImageData;
if (!globalThis.Path2D) globalThis.Path2D = Path2D;

function decodeBase64Data(base64Data) {
  const payload = String(base64Data || "").includes(",")
    ? String(base64Data).slice(String(base64Data).indexOf(",") + 1)
    : String(base64Data || "");
  return Buffer.from(payload, "base64");
}

function scoreText(text) {
  const normalized = String(text || "");
  let score = 0;
  if (/[I1l|]\.?\s*D\.?\s*NO/i.test(normalized)) score += 55;
  if (/(\d\s*){13}/.test(normalized)) score += 40;
  if (/\b\d{6}\s+\d{4}\s+\d{2}\s+\d\b/.test(normalized)) score += 35;
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(normalized)) score += 15;
  if (/SURNAME|VAN|FORENAMES|VOORNAME|CITIZEN/i.test(normalized)) score += 15;
  score += Math.min(20, normalized.trim().length / 60);
  return score;
}

async function rotate(buffer, radians) {
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.height, image.width);
  const ctx = canvas.getContext("2d");
  ctx.translate(image.height / 2, image.width / 2);
  ctx.rotate(radians);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);
  return canvas.toBuffer("image/png");
}

async function crop(buffer, leftRatio, topRatio, widthRatio, heightRatio, scale = 1) {
  const image = await loadImage(buffer);
  const sx = Math.max(0, Math.floor(image.width * leftRatio));
  const sy = Math.max(0, Math.floor(image.height * topRatio));
  const sw = Math.max(1, Math.floor(image.width * widthRatio));
  const sh = Math.max(1, Math.floor(image.height * heightRatio));
  const canvas = createCanvas(Math.max(1, Math.floor(sw * scale)), Math.max(1, Math.floor(sh * scale)));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toBuffer("image/png");
}

async function run() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const mode = payload.mode;
  const file = payload.file || {};
  const buffer = decodeBase64Data(file.base64Data);

  if (mode === "image_ocr") {
    const variants = [buffer];
    try { variants.push(await crop(buffer, 0, 0, 1, 0.42, 2)); } catch {}
    try { variants.push(await crop(buffer, 0, 0, 1, 0.24, 3)); } catch {}
    try { variants.push(await crop(buffer, 0, 0.18, 1, 0.2, 3)); } catch {}

    const ranked = [];
    for (const variant of variants) {
      const result = await Tesseract.recognize(variant, "eng");
      const text = String(result?.data?.text || "").trim();
      if (!text) continue;
      ranked.push({ text, score: scoreText(text) });
    }

    const combined = [];
    for (const item of ranked.sort((left, right) => right.score - left.score)) {
      if (!combined.includes(item.text)) combined.push(item.text);
    }

    process.stdout.write(combined.join("\n").trim());
    return;
  }

  const parser = new PDFParse({ data: buffer });
  try {
    if (mode === "pdf_text") {
      const result = await parser.getText();
      process.stdout.write(String(result.text || "").trim());
      return;
    }

    if (mode === "pdf_ocr") {
      const shot = await parser.getScreenshot({
        first: 2,
        imageDataUrl: false,
        imageBuffer: true,
        desiredWidth: 1800,
      });

      const texts = [];
      for (const page of shot.pages || []) {
        if (!page || !page.data) continue;
        const variants = [page.data];
        try { variants.push(await rotate(page.data, Math.PI / 2)); } catch {}
        try { variants.push(await rotate(page.data, -Math.PI / 2)); } catch {}

        let bestText = "";
        let bestScore = -1;
        for (const variant of variants) {
          const result = await Tesseract.recognize(variant, "eng");
          const text = result?.data?.text?.trim() || "";
          const score = scoreText(text);
          if (score > bestScore) {
            bestScore = score;
            bestText = text;
          }
        }

        if (bestText) texts.push(bestText);
      }

      process.stdout.write(texts.join("\n").trim());
    }
  } finally {
    await parser.destroy().catch(() => {});
  }
}

run().catch(() => {
  process.stdout.write("");
});
