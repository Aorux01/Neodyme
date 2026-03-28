const path = require('path');
const fs = require('fs');
const LoggerService = require('../logger/logger-service');

const FONT_PATH = path.join(__dirname, '../../../public/fonts/burbank-big-condensed-bold.otf');
const SHOP_DATA_PATH = path.join(__dirname, '../../../data/shop.json');
const SHOP_STATE_PATH = path.join(__dirname, '../../../data/shop_state.json');
const SHOP_CONFIG_PATH = path.join(__dirname, '../../../config/shop.json');

const RARITY_GRADIENTS = {
    legendary: ['#c06c2a', '#f5a623'],
    epic:      ['#7d26cd', '#9b4dcc'],
    rare:      ['#2172b8', '#4fc3f7'],
    uncommon:  ['#2d7c3e', '#60aa31'],
    common:    ['#7d7d7d', '#bebebe'],
    marvel:    ['#b91111', '#e53935'],
    dc:        ['#2c4a9e', '#536dbd'],
    icon:      ['#0d8cb4', '#2dbcfd'],
    starwars:  ['#2e5883', '#4a7db5'],
    lava:      ['#b34700', '#ff9b00'],
    shadow:    ['#2b2b3b', '#5c5c8a'],
    frozen:    ['#2b6b8a', '#a8d8ea'],
    slurp:     ['#1a6b5a', '#00d4b4'],
    dark:      ['#1a1a2e', '#4a0e8f'],
};

const CARD_W = 260;
const CARD_H = 350;
const SPACING = 14;
const MARGIN = 44;
const CARDS_PER_ROW = 4;
const HEADER_H = 90;
const SECTION_LABEL_H = 52;
const SECTION_GAP = 28;

let cachedImage = null;
let cachedImageTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

function isAvailable() {
    return true;
}

function invalidateCache() {
    cachedImage = null;
    cachedImageTime = 0;
}

function getRarityColors(rarity) {
    const key = (rarity || '').toLowerCase();
    return RARITY_GRADIENTS[key] || RARITY_GRADIENTS.common;
}

function calcHeight(sections) {
    let h = HEADER_H;
    sections.forEach((sec, i) => {
        const rows = Math.ceil(sec.items.length / CARDS_PER_ROW);
        h += SECTION_LABEL_H + rows * (CARD_H + SPACING) - SPACING;
        if (i < sections.length - 1) h += SECTION_GAP;
    });
    return h + 40;
}

function truncate(str, max) {
    return str.length > max ? str.substring(0, max - 1) + '\u2026' : str;
}

function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function generateShopImage() {
    const now = Date.now();
    if (cachedImage && now - cachedImageTime < CACHE_TTL_MS) {
        return cachedImage;
    }

    const shopData  = JSON.parse(fs.readFileSync(SHOP_DATA_PATH,  'utf-8'));
    const shopState = JSON.parse(fs.readFileSync(SHOP_STATE_PATH, 'utf-8'));
    const shopConfig = JSON.parse(fs.readFileSync(SHOP_CONFIG_PATH, 'utf-8'));

    const categories = shopConfig.shopCategories || {
        daily:    { displayName: 'Daily' },
        featured: { displayName: 'Featured' },
    };

    const catEntries = Object.entries(categories);
    catEntries.sort(([a], [b]) => {
        const aFeat = a.toLowerCase().includes('featured') ? 0 : 1;
        const bFeat = b.toLowerCase().includes('featured') ? 0 : 1;
        return aFeat - bFeat;
    });

    const sections = [];
    for (const [catKey, catConfig] of catEntries) {
        const items = [];
        for (const [key, val] of Object.entries(shopData)) {
            if (key === '//' || !val.itemGrants) continue;
            if (!key.toLowerCase().startsWith(catKey.toLowerCase())) continue;
            items.push({
                key,
                name:   val.meta?.name   || key,
                rarity: val.meta?.rarity || 'Common',
                price:  val.price        || 0,
                image:  val.meta?.image  || shopState[key] || null,
            });
        }
        if (items.length > 0) {
            sections.push({ label: catConfig.displayName || catKey, items });
        }
    }

    if (sections.length === 0) return null;

    const canvasW = MARGIN * 2 + CARDS_PER_ROW * CARD_W + (CARDS_PER_ROW - 1) * SPACING;
    const canvasH = calcHeight(sections);

    let fontStyle = '';
    try {
        if (fs.existsSync(FONT_PATH)) {
            const b64 = fs.readFileSync(FONT_PATH).toString('base64');
            fontStyle = `@font-face{font-family:'Burbank';src:url('data:font/otf;base64,${b64}') format('opentype');font-weight:bold;}`;
        }
    } catch { /* font embedding is optional */ }
    const useFont = fontStyle ? 'Burbank' : 'Arial';

    const cardPositions = [];
    {
        let cy = HEADER_H;
        for (const section of sections) {
            cy += SECTION_LABEL_H;
            for (let i = 0; i < section.items.length; i++) {
                const col = i % CARDS_PER_ROW;
                const row = Math.floor(i / CARDS_PER_ROW);
                cardPositions.push({
                    x: MARGIN + col * (CARD_W + SPACING),
                    y: cy + row * (CARD_H + SPACING),
                });
            }
            const rows = Math.ceil(section.items.length / CARDS_PER_ROW);
            cy += rows * (CARD_H + SPACING) - SPACING + SECTION_GAP;
        }
    }

    const d = []; // defs
    const e = []; // elements

    // Font
    if (fontStyle) d.push(`<style>${fontStyle}</style>`);

    d.push(`<linearGradient id="topgrad" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#6366f1" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>`);

    d.push(`<radialGradient id="vignette" cx="50%" cy="50%" r="85%" gradientUnits="objectBoundingBox">
      <stop offset="15%"  stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.35"/>
    </radialGradient>`);
    for (const [name, [c1, c2]] of Object.entries(RARITY_GRADIENTS)) {
        d.push(`<linearGradient id="grad-${name}" x1="1" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="${c2}"/>
      <stop offset="100%" stop-color="${c1}"/>
    </linearGradient>`);
    }

    // Clip-paths (one per card)
    cardPositions.forEach(({ x, y }, idx) => {
        d.push(`<clipPath id="cp${idx}"><rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="10" ry="10"/></clipPath>`);
    });

    // Background
    e.push(`<rect width="${canvasW}" height="${canvasH}" fill="#0b111e"/>`);
    e.push(`<rect width="${canvasW}" height="${HEADER_H}" fill="url(#topgrad)"/>`);

    e.push(`<text x="${MARGIN}" y="58" font-family="${useFont},Arial" font-weight="bold" font-size="52" fill="#ffffff">ITEM SHOP</text>`);

    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    e.push(`<text x="${MARGIN}" y="82" font-family="${useFont},Arial" font-weight="bold" font-size="22" fill="#ffffff" fill-opacity="0.45">${esc(dateStr)}</text>`);

    e.push(`<text x="${canvasW - MARGIN}" y="58" font-family="${useFont},Arial" font-weight="bold" font-size="20" fill="#ffffff" fill-opacity="0.2" text-anchor="end">NEODYME</text>`);

    let currentY = HEADER_H;
    let cardIdx = 0;

    for (const section of sections) {
        // Section label
        e.push(`<text x="${MARGIN}" y="${currentY + 36}" font-family="${useFont},Arial" font-weight="bold" font-size="30" fill="#ffffff">${esc(section.label.toUpperCase() + ' ITEMS')}</text>`);

        // Separator line
        e.push(`<line x1="${MARGIN}" y1="${currentY + 44}" x2="${canvasW - MARGIN}" y2="${currentY + 44}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1"/>`);

        currentY += SECTION_LABEL_H;

        for (let i = 0; i < section.items.length; i++) {
            const item = section.items[i];
            const col  = i % CARDS_PER_ROW;
            const row  = Math.floor(i / CARDS_PER_ROW);
            const x    = MARGIN + col * (CARD_W + SPACING);
            const y    = currentY + row * (CARD_H + SPACING);
            const imageAreaH = CARD_H - 78;

            const rarityKey = (item.rarity || 'common').toLowerCase();
            const gradId    = RARITY_GRADIENTS[rarityKey] ? `grad-${rarityKey}` : 'grad-common';
            const [, c2]    = getRarityColors(item.rarity);

            // Clipped card interior
            e.push(`<g clip-path="url(#cp${cardIdx})">`);

            // Rarity gradient (image area)
            e.push(`<rect x="${x}" y="${y}" width="${CARD_W}" height="${imageAreaH}" fill="url(#${gradId})"/>`);

            // Vignette overlay
            e.push(`<rect x="${x}" y="${y}" width="${CARD_W}" height="${imageAreaH}" fill="url(#vignette)"/>`);

            // Dark footer strip
            e.push(`<rect x="${x}" y="${y + imageAreaH}" width="${CARD_W}" height="78" fill="#0f1520"/>`);

            // Rarity top border (inside clip -> rounded top corners)
            e.push(`<rect x="${x}" y="${y}" width="${CARD_W}" height="5" fill="${c2}"/>`);

            // Item image
            if (item.image) {
                const size = Math.min(CARD_W - 24, imageAreaH - 16);
                const imgX = Math.round(x + (CARD_W - size) / 2);
                const imgY = Math.round(y + 8 + (imageAreaH - 8 - size) / 2);
                e.push(`<image href="${esc(item.image)}" x="${imgX}" y="${imgY}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`);
            }

            e.push(`</g>`);

            // Item name
            e.push(`<text x="${x + 12}" y="${y + imageAreaH + 26}" font-family="${useFont},Arial" font-weight="bold" font-size="19" fill="#ffffff">${esc(truncate(item.name, 20))}</text>`);

            // Rarity label
            e.push(`<text x="${x + 12}" y="${y + imageAreaH + 44}" font-family="${useFont},Arial" font-weight="bold" font-size="13" fill="${c2}">${esc(item.rarity.toUpperCase())}</text>`);

            // V-Bucks icon
            e.push(`<circle cx="${x + 18}" cy="${y + CARD_H - 18}" r="8" fill="#5bc8f5"/>`);
            e.push(`<text x="${x + 18}" y="${y + CARD_H - 14}" font-family="${useFont},Arial" font-weight="bold" font-size="10" fill="#0b111e" text-anchor="middle">V</text>`);

            // Price
            e.push(`<text x="${x + 32}" y="${y + CARD_H - 12}" font-family="${useFont},Arial" font-weight="bold" font-size="16" fill="#ffffff">${esc(item.price.toLocaleString())}</text>`);

            cardIdx++;
        }

        const rows = Math.ceil(section.items.length / CARDS_PER_ROW);
        currentY += rows * (CARD_H + SPACING) - SPACING + SECTION_GAP;
    }

    const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvasW}" height="${canvasH}">`,
        `<defs>`,
        d.join('\n'),
        `</defs>`,
        e.join('\n'),
        `</svg>`,
    ].join('\n');

    cachedImage = svg;
    cachedImageTime = Date.now();

    LoggerService.log('info', `[ShopImage] Generated shop SVG (${canvasW}x${canvasH}, ${Math.round(Buffer.byteLength(svg, 'utf8') / 1024)}KB)`);
    return svg;
}

module.exports = { generateShopImage, isAvailable, invalidateCache };
