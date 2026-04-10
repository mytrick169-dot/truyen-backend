/**
 * FILE: scripts/find_slugs.js
 * Chạy: node scripts/find_slugs.js
 * Mục đích: Tìm slug ĐÚNG trên otruyenapi cho từng truyện
 */
const https = require('https');

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120' }
        }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve({ status: res.statusCode, body: d }));
            res.on('error', reject);
        }).on('error', reject).on('timeout', (_, req) => { reject(new Error('timeout')); });
    });
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

const TITLES = [
    [1,  "One Piece"],
    [3,  "Jujutsu Kaisen"],
    [4,  "Demon Slayer"],
    [5,  "One Punch Man"],
    [6,  "Quan Than"],
    [7,  "Naruto"],
    [9,  "Bleach"],
    [10, "Attack on Titan"],
    [12, "Hunter x Hunter"],
    [13, "Spy Family"],
    [14, "My Hero Academia"],
    [15, "Fullmetal Alchemist"],
    [17, "Chainsaw Man"],
    [18, "Vinland Saga"],
    [19, "Tokyo Revengers"],
    [21, "Slime"],
    [23, "Overlord"],
    [24, "Lookism"],
    [25, "Noblesse"],
];

async function main() {
    console.log('🔍 Tìm slug trên otruyenapi...\n');
    for (const [id, kw] of TITLES) {
        try {
            const r = await get(`https://otruyenapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(kw)}&limit=3`);
            const items = JSON.parse(r.body)?.data?.items || [];
            console.log(`[${id}] "${kw}":`);
            items.forEach(it => console.log(`    slug: ${it.slug}  |  name: ${it.name}`));
            if (!items.length) console.log('    (không tìm thấy)');
        } catch(e) {
            console.log(`[${id}] "${kw}": ❌ ${e.message}`);
        }
        await delay(500);
    }
}
main().catch(console.error);