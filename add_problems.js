require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const db = new sqlite3.Database(process.env.DB_PATH);

const problems = [
    {
        title: "소스 보기",
        description: "웹페이지의 소스 코드를 확인해보세요. FLAG가 숨겨져 있을지도?",
        flag: process.env.FLAG_VIEW_SOURCE,
        category: "Web",
        points: 50
    },
    {
        title: "SQL Injection",
        description: "admin 계정으로 로그인하세요",
        flag: process.env.FLAG_SQL_INJECTION,
        category: "Web",
        points: 200
    },
    {
        title: "Base64",
        description: "RkxBR3s2YXNlNkFfMXNfZnVufQ==",
        flag: process.env.FLAG_BASE64,
        category: "Crypto",
        points: 50
    },
    {
        title: "시저 암호",
        description: "CIXD{e21iL_t0o1a}",
        flag: process.env.FLAG_CAESAR,
        category: "Crypto",
        points: 75
    },
    {
        title: "숨겨진 이미지",
        description: "이미지 파일에 FLAG가 숨겨져 있습니다. 찾아보세요!",
        flag: process.env.FLAG_HIDDEN_IMAGE,
        category: "Forensic",
        points: 150
    }
];

function addProblems() {
    db.serialize(() => {
        db.run("DELETE FROM problems", (err) => {
            if (err) {
                console.error("기존 문제 삭제 중 오류:", err);
                return;
            }
            console.log("기존 문제가 삭제되었습니다.");
        });

        const stmt = db.prepare("INSERT INTO problems (title, description, flag, category, points) VALUES (?, ?, ?, ?, ?)");
        
        problems.forEach(problem => {
            stmt.run(
                problem.title,
                problem.description,
                problem.flag,
                problem.category,
                problem.points,
                function(err) {
                    if (err) {
                        console.error("문제 추가 중 오류:", err);
                    } else {
                        console.log(`문제 추가됨: ${problem.title}`);
                    }
                }
            );
        });

        stmt.finalize();
    });
}

addProblems();

db.close((err) => {
    if (err) {
        console.error("데이터베이스 연결 종료 중 오류:", err);
    } else {
        console.log("데이터베이스 연결이 종료되었습니다.");
    }
}); 