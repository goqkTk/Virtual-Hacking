const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const port = 3000;

// 미들웨어 설정
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 세션 설정
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

// 데이터베이스 연결
const db = new sqlite3.Database('database.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('데이터베이스에 연결되었습니다.');
});

// 데이터베이스 테이블 생성
db.serialize(() => {
    // 사용자 테이블
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        score INTEGER DEFAULT 0
    )`);

    // 문제 테이블
    db.run(`CREATE TABLE IF NOT EXISTS problems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        description TEXT,
        flag TEXT,
        category TEXT,
        points INTEGER
    )`);

    // 사용자 문제 해결 기록 테이블
    db.run(`CREATE TABLE IF NOT EXISTS solved_problems (
        user_id INTEGER,
        problem_id INTEGER,
        solved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (problem_id) REFERENCES problems(id)
    )`);
});

// 라우트 설정
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            return res.status(500).send('서버 오류');
        }
        if (!user) {
            return res.status(400).send('사용자를 찾을 수 없습니다');
        }
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            req.session.user = { id: user.id, username: user.username };
            res.redirect('/problems');
        } else {
            res.status(400).send('비밀번호가 일치하지 않습니다');
        }
    });
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run('INSERT INTO users (username, password) VALUES (?, ?)',
        [username, hashedPassword],
        function(err) {
            if (err) {
                return res.status(400).send('이미 존재하는 사용자명입니다');
            }
            res.redirect('/login');
        });
});

app.get('/problems', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    db.all('SELECT * FROM problems', [], (err, problems) => {
        if (err) {
            return res.status(500).send('서버 오류');
        }
        res.render('problems', { problems, user: req.session.user });
    });
});

app.post('/submit', (req, res) => {
    if (!req.session.user) {
        return res.status(401).send('로그인이 필요합니다');
    }
    const { problemId, flag } = req.body;
    
    db.get('SELECT * FROM problems WHERE id = ?', [problemId], (err, problem) => {
        if (err) {
            return res.status(500).send('서버 오류');
        }
        if (problem.flag === flag) {
            db.run('INSERT INTO solved_problems (user_id, problem_id) VALUES (?, ?)',
                [req.session.user.id, problemId]);
            res.json({ success: true, message: '정답입니다!' });
        } else {
            res.json({ success: false, message: '틀렸습니다.' });
        }
    });
});

app.get('/ranking', (req, res) => {
    db.all(`
        SELECT u.username, COUNT(sp.problem_id) as solved_count, SUM(p.points) as total_points
        FROM users u
        LEFT JOIN solved_problems sp ON u.id = sp.user_id
        LEFT JOIN problems p ON sp.problem_id = p.id
        GROUP BY u.id
        ORDER BY total_points DESC
    `, [], (err, rankings) => {
        if (err) {
            return res.status(500).send('서버 오류');
        }
        res.render('ranking', { rankings });
    });
});

// 서버 시작
app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
}); 