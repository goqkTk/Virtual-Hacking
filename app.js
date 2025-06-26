require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT;

// 보안 미들웨어 설정
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// Rate limiting 설정
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100, // IP당 최대 요청 수
    message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.'
});
app.use(limiter);

// 미들웨어 설정
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 세션 설정
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24시간
    }
}));

// CSRF 토큰 미들웨어
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
});

// 데이터베이스 연결
const db = new sqlite3.Database(process.env.DB_PATH, (err) => {
    if (err) {
        console.error('데이터베이스 연결 오류:', err.message);
    } else {
        console.log('데이터베이스에 연결되었습니다.');
    }
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

    // 기본 사용자 추가
    db.run(`INSERT OR IGNORE INTO users (username, password, score) VALUES (?, ?, ?)`, 
        ['guest', 'guest', 0]);
    db.run(`INSERT OR IGNORE INTO users (username, password, score) VALUES (?, ?, ?)`, 
        ['admin', 'Admin1234!', 10000]);
});

// 입력 검증 함수
function validateInput(input, maxLength = 100) {
    if (!input || typeof input !== 'string') return false;
    if (input.length > maxLength) return false;
    const dangerousChars = /[<>\"&]/;
    return !dangerousChars.test(input);
}

// 라우트 설정
app.get('/', (req, res) => {
    if (!req.session.user) {
        return res.render('index', { user: null, problemGroups: null, categories: null, adminFlag: null, solvedProblems: [] });
    }

    if (req.session.user.username === 'admin') {
        return res.render('index', { user: req.session.user, problemGroups: {}, categories: [], adminFlag: req.session.adminFlag, solvedProblems: [] });
    }

    // 문제 목록과 사용자가 해결한 문제 목록을 함께 가져오기
    db.all('SELECT * FROM problems ORDER BY points', [], (err, problems) => {
        if (err) {
            console.error('문제 조회 오류:', err);
            return res.status(500).render('error', { message: '서버 오류가 발생했습니다.' });
        }

        if (!problems || problems.length === 0) {
            return res.render('index', { user: req.session.user, problemGroups: {}, categories: [], adminFlag: req.session.adminFlag, solvedProblems: [] });
        }

        // 사용자가 해결한 문제 목록 가져오기
        db.all('SELECT problem_id FROM solved_problems WHERE user_id = ?', [req.session.user.id], (err, solvedProblems) => {
            if (err) {
                console.error('해결한 문제 조회 오류:', err);
                return res.status(500).render('error', { message: '서버 오류가 발생했습니다.' });
            }

            // 카테고리별로 문제 그룹화
            const problemGroups = problems.reduce((acc, problem) => {
                const category = problem.category;
                if (!acc[category]) {
                    acc[category] = [];
                }
                acc[category].push(problem);
                return acc;
            }, {});
            
            const categories = Object.keys(problemGroups);
            const solvedProblemIds = solvedProblems.map(sp => sp.problem_id);

            res.render('index', { 
                user: req.session.user, 
                problemGroups, 
                categories, 
                adminFlag: req.session.adminFlag,
                solvedProblems: solvedProblemIds
            });
        });
    });
});

app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    
    db.get(query, (err, user) => {
        if (err) {
            console.error('로그인 오류:', err);
            return res.status(500).send('로그인 중 오류가 발생했습니다.');
        }
        
        if (user) {
            req.session.user = {
                id: user.id,
                username: user.username,
                score: user.score
            };
            
            if (user.username === 'admin') {
                req.session.adminFlag = process.env.FLAG_SQL_INJECTION;
            }
            
            return res.redirect('/');
        } else {
            return res.status(401).send('사용자명 또는 비밀번호가 잘못되었습니다.');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('로그아웃 오류:', err);
        }
        res.redirect('/');
    });
});

app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        // 평문 비밀번호를 저장 (Flask 코드처럼)
        db.run('INSERT INTO users (username, password) VALUES (?, ?)',
            [username, password],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).send('이미 존재하는 사용자명입니다');
                    }
                    console.error('회원가입 오류:', err);
                    return res.status(500).send('회원가입 중 오류가 발생했습니다.');
                }
                res.redirect('/login');
            });
    } catch (error) {
        console.error('회원가입 오류:', error);
        res.status(500).send('회원가입 중 오류가 발생했습니다.');
    }
});

app.post('/submit', (req, res) => {
    if (!req.session.user) {
        return res.status(401).send('로그인이 필요합니다');
    }
    
    const { problemId, flag } = req.body;
    
    if (!validateInput(flag, 200)) {
        return res.status(400).json({ success: false, message: '잘못된 입력입니다.' });
    }
    
    // 먼저 문제가 존재하는지 확인
    db.get('SELECT * FROM problems WHERE id = ?', [problemId], (err, problem) => {
        if (err) {
            console.error('문제 조회 오류:', err);
            return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
        }
        if (!problem) {
            return res.status(404).json({ success: false, message: '문제를 찾을 수 없습니다.' });
        }
        
        // 이미 해결한 문제인지 확인
        db.get('SELECT * FROM solved_problems WHERE user_id = ? AND problem_id = ?', 
            [req.session.user.id, problemId], (err, solved) => {
                if (err) {
                    console.error('해결 기록 조회 오류:', err);
                    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
                }
                
                if (solved) {
                    return res.json({ success: false, message: '이미 해결한 문제입니다.' });
                }
                
                // flag 검증
                if (problem.flag === flag) {
                    // 해결 기록 저장
                    db.run('INSERT INTO solved_problems (user_id, problem_id) VALUES (?, ?)',
                        [req.session.user.id, problemId], (err) => {
                            if (err) {
                                console.error('해결 기록 저장 오류:', err);
                                return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
                            }
                            
                            // 사용자 점수 업데이트
                            db.run('UPDATE users SET score = score + ? WHERE id = ?',
                                [problem.points, req.session.user.id], (err) => {
                                    if (err) {
                                        console.error('점수 업데이트 오류:', err);
                                    } else {
                                        // 세션의 점수도 업데이트
                                        req.session.user.score += problem.points;
                                    }
                                    
                                    res.json({ 
                                        success: true, 
                                        message: `정답입니다! +${problem.points}점 획득!`,
                                        points: problem.points
                                    });
                                });
                        });
                } else {
                    res.json({ success: false, message: '틀렸습니다.' });
                }
            });
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
            console.error('랭킹 조회 오류:', err);
            return res.status(500).render('error', { message: '서버 오류가 발생했습니다.' });
        }
        res.render('ranking', { rankings });
    });
});

// 숨겨진 이미지 문제를 위한 라우트
app.get('/hidden-image', (req, res) => {
    res.render('hidden-image', { 
        user: req.session.user,
        flag: process.env.FLAG_HIDDEN_IMAGE 
    });
});

// 숨겨진 이미지 다운로드
app.get('/download-image', (req, res) => {
    res.download('./public/images/flag.txt', 'innocent_image.jpg', (err) => {
        if (err) {
            res.status(404).send('이미지를 찾을 수 없습니다.');
        }
    });
});

app.use((req, res) => {
    res.status(404).render('error', { message: '페이지를 찾을 수 없습니다.' });
});

app.use((err, req, res, next) => {
    console.error('서버 오류:', err);
    res.status(500).render('error', { message: '서버 오류가 발생했습니다.' });
});

app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});