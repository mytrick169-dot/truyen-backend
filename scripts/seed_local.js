require('dotenv').config();
const mysql = require('mysql2/promise');

const comics = [
    { id:1,  title:'Đảo Hải Tặc (One Piece)',    author:'Eiichiro Oda',      genre:'Action',    cover:'/uploads/comics/daohaitac.jpg',       is_hot:1, latest_chapter:1105, views:150000 },
    { id:2,  title:'Thám Tử Conan',               author:'Gosho Aoyama',      genre:'Trinh thám',cover:'/uploads/comics/conan.jpg',           is_hot:1, latest_chapter:1090, views:120000 },
    { id:3,  title:'Chú Thuật Hồi Chiến',         author:'Gege Akutami',      genre:'Action',    cover:'/uploads/comics/chuthuat.jpg',         is_hot:1, latest_chapter:240,  views:90000  },
    { id:4,  title:'Thanh Gươm Diệt Quỷ',         author:'Koyoharu Gotouge',  genre:'Action',    cover:'/uploads/comics/kny.jpg',             is_hot:1, latest_chapter:205,  views:88000  },
    { id:5,  title:'One Punch Man',                author:'ONE',               genre:'Action',    cover:'/uploads/comics/onepuch.jpg',         is_hot:1, latest_chapter:201,  views:95000  },
    { id:6,  title:'Toàn Chức Pháp Sư',           author:'Loang Fang',        genre:'Tiên hiệp', cover:'/uploads/comics/toanchucphapsu.jpg',  is_hot:1, latest_chapter:758,  views:75000  },
    { id:7,  title:'Solo Leveling',                author:'Chugong',           genre:'Action',    cover:'/uploads/comics/solo.jpg',            is_hot:0, latest_chapter:179,  views:110000 },
    { id:8,  title:'Nguyên Tôn',                   author:'Thiên Tằm Thổ Đậu', genre:'Tiên hiệp',cover:'/uploads/comics/nguyenton.jpg',       is_hot:0, latest_chapter:580,  views:60000  },
    { id:9,  title:'Bách Luyện Thành Thần',        author:'Ngọc Tiêu',         genre:'Tiên hiệp', cover:'/uploads/comics/bachluyen.jpg',        is_hot:0, latest_chapter:320,  views:45000  },
    { id:10, title:'Yêu Thần Ký',                  author:'Dục Thủy Thành Hà', genre:'Tiên hiệp',cover:'/uploads/comics/yeuthanky.jpg',       is_hot:0, latest_chapter:415,  views:55000  },
    { id:11, title:'Đấu Phá Thương Khung',         author:'Thiên Tằm Thổ Đậu', genre:'Tiên hiệp',cover:'/uploads/comics/dauphathuong.jpg',    is_hot:0, latest_chapter:500,  views:70000  },
];

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT),
        ssl: { rejectUnauthorized: false }
    });

    for (const c of comics) {
        await conn.execute(
            `INSERT INTO comics (id, title, author, genre, cover, is_hot, latest_chapter, views, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Đang tiến hành')
             ON DUPLICATE KEY UPDATE title=VALUES(title), cover=VALUES(cover), is_hot=VALUES(is_hot), latest_chapter=VALUES(latest_chapter)`,
            [c.id, c.title, c.author, c.genre, c.cover, c.is_hot, c.latest_chapter, c.views]
        );
        console.log('✅', c.title);
    }

    console.log('\n🎉 Seed xong!');
    await conn.end();
})().catch(console.error);
