/**
 * seed_real.js v9 - Lấy chapter ID trực tiếp từ MangaDex feed
 * node scripts/seed_real.js
 */
const https = require('https');
const mysql = require('mysql2/promise');
const DB = { host:'localhost', user:'root', password:'', database:'truyen_db' };

function get(url, retry=3) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            timeout: 20000,
            headers: { 'User-Agent': 'TruyenHayPhaiDoc/1.0', 'Accept': 'application/json' }
        }, (res) => {
            if ([301,302].includes(res.statusCode) && res.headers.location)
                return resolve(get(res.headers.location, retry));
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
            res.on('error', reject);
        });
        req.on('error', async e => {
            if (retry > 1) { await delay(1500); return resolve(get(url, retry-1)); }
            reject(e);
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// UUID đã xác nhận đúng từ lần trước
const UUID_MAP = {
    1:  'a1c7c817-4e59-43b7-9365-09675a149a6f', // One Piece
    2:  '7f30dfc3-0b80-4dcc-a3b9-0cd746fac005', // Detective Conan
    3:  'c52b2ce3-7f95-469c-96b0-479524fb7a1a', // Jujutsu Kaisen
    4:  '32d76d19-8a05-4db0-9fc2-e0b0648fe9d0', // Kimetsu
    5:  'b7d069cb-4ab9-4c21-a20b-38f7c269be4e', // OPM
    7:  '6b1eb93e-473a-4ab3-9922-1a66d2a29a4a', // Naruto
    8:  '37b87be0-b1f4-4507-affa-06c99ebb27f8', // DBS
    9:  '06a37094-b3ba-4f25-bf2b-54c9751e0e91', // Bleach
    10: '304ceac3-8cdb-4fe7-acf7-2b6ff7a60613', // AoT
    11: '32d76d19-8a05-4db0-9fc2-e0b0648fe9d0', // Solo Leveling (same as kimetsu?)
    12: 'db692d58-4b13-4174-ae8c-30c515c0689c', // HxH
    13: 'efbd7ba4-c65b-49ca-873a-f8fcbdd8a7d3', // Spy x Family
    14: 'fa89b43e-41d0-46a3-8a7d-c8bac5ffbd05', // MHA
    15: 'f9c9614d-0657-44c6-9c33-47fd58cd51b3', // FMA
    17: 'a77742b1-befd-49a4-bff5-1ad4e6b0ef7b', // Chainsaw Man
    18: '5d1fc77e-706a-4fc5-bea8-486c9be0145d', // Vinland
    19: '59b36734-f2d6-46d7-97c0-06cfd2380852', // Tokyo Rev
    20: 'e7eabe96-aa17-476f-b431-2497d5e9d060', // Black Clover
    21: 'bb3b95d3-b741-4131-aa84-67e0d3fd936e', // Slime
    22: '40531354-ee23-4235-84bd-7df34df68648', // ReZero
    23: 'ac4e2459-d995-45ae-8421-4c4cf4a87770', // Overlord
    25: 'f61952ad-63bb-4e81-a03e-9e50b9e23037', // Noblesse
    26: '801513ba-a712-498c-8f57-cae55b38cc92', // Berserk
};

// Lấy 5 chapter IDs đầu tiên của manga (tiếng Anh)
async function getFirstChapters(uuid, limit=5) {
    try {
        const url = `https://api.mangadex.org/manga/${uuid}/feed?limit=${limit}&offset=0&order[chapter]=asc&order[volume]=asc&translatedLanguage[]=en&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&includes[]=scanlation_group`;
        const r = await get(url);
        if (r.status !== 200) return [];
        const j = JSON.parse(r.body);
        // Lọc chapter có pages (externalUrl = null)
        return (j.data || [])
            .filter(c => !c.attributes.externalUrl && c.attributes.pages > 0)
            .slice(0, limit)
            .map(c => ({
                id: c.id,
                num: parseFloat(c.attributes.chapter) || 0,
                pages: c.attributes.pages
            }));
    } catch(e) { console.log('  getFirstChapters error:', e.message); return []; }
}

// Lấy URL ảnh từ chapter ID
async function getPageUrls(chapId) {
    try {
        const r = await get(`https://api.mangadex.org/at-home/server/${chapId}`);
        if (r.status !== 200) return [];
        const j = JSON.parse(r.body);
        const base = j.baseUrl, hash = j.chapter?.hash;
        if (!base || !hash) return [];
        return (j.chapter?.data || []).map(f => `${base}/data/${hash}/${f}`);
    } catch { return []; }
}

async function saveChap(db, comicId, chapNum, imgsJson) {
    const [ex] = await db.execute('SELECT id FROM chapters WHERE comic_id=? AND chapter_number=?', [comicId, chapNum]);
    if (ex.length)
        await db.execute('UPDATE chapters SET content=? WHERE comic_id=? AND chapter_number=?', [imgsJson, comicId, chapNum]);
    else
        await db.execute('INSERT INTO chapters (comic_id,chapter_number,content) VALUES(?,?,?)', [comicId, chapNum, imgsJson]);
}

async function main() {
    console.log('\n🚀 SEED v9 - Lấy chapter ID trực tiếp từ MangaDex\n');
    const db = await mysql.createConnection(DB);
    console.log('✅ MySQL OK\n');

    let okChap = 0;

    for (const [comicId, uuid] of Object.entries(UUID_MAP)) {
        console.log(`\n📚 [${comicId}] UUID: ${uuid}`);

        // Lấy danh sách chapter
        const chapters = await getFirstChapters(uuid, 5);
        if (!chapters.length) {
            console.log('  ⚠️  Không có chapter tiếng Anh');
            await delay(400);
            continue;
        }

        console.log(`  📋 Tìm thấy ${chapters.length} chapters: ${chapters.map(c=>'Ch.'+c.num).join(', ')}`);

        for (let i = 0; i < chapters.length; i++) {
            const ch = chapters[i];
            const chapNum = i + 1; // Lưu theo thứ tự 1,2,3,4,5

            const imgs = await getPageUrls(ch.id);
            if (!imgs.length) {
                console.log(`  ⚠️  Ch.${chapNum} (${ch.num}): 0 trang`);
                await delay(500);
                continue;
            }

            await saveChap(db, parseInt(comicId), chapNum, JSON.stringify(imgs));
            console.log(`  ✅ Ch.${chapNum} (manga ch.${ch.num}): ${imgs.length} trang`);
            okChap++;
            await delay(700); // Tránh rate limit
        }
        await delay(1000);
    }

    console.log(`\n\n✨ Tổng chương: ${okChap}\n`);

    // Kiểm tra chapters trong DB
    const [rows] = await db.execute(`
        SELECT c.id, c.title, COUNT(ch.id) as so_chuong
        FROM comics c LEFT JOIN chapters ch ON c.id = ch.comic_id
        GROUP BY c.id ORDER BY c.id
    `);
    console.log('=== CHAPTERS TRONG DB ===');
    rows.forEach(r => console.log(`[${r.id}] ${String(r.title).substring(0,25).padEnd(25)} | ${r.so_chuong} chương`));

    await db.end();
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });