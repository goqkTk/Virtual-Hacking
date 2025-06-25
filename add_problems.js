require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const db = new sqlite3.Database(process.env.DB_PATH);

// 문제 데이터 (FLAG는 환경변수에서 가져옴)
const problems = [
    {
        title: "소스 보기",
        description: "웹페이지의 소스 코드를 확인해보세요. FLAG가 숨겨져 있을지도?",
        flag: process.env.FLAG_VIEW_SOURCE,
        category: "Web",
        points: 50
    },
    {
        title: "쿠키 조작",
        description: "쿠키를 수정하면 관리자 권한을 얻을 수 있을지도?",
        flag: process.env.FLAG_COOKIE_POWER,
        category: "Web",
        points: 100
    },
    {
        title: "SQL Injection",
        description: "admin 계정으로 로그인하세요",
        flag: process.env.FLAG_SQL_INJECTION,
        category: "Web",
        points: 200
    },
    {
        title: "Base64 디코딩",
        description: "다음 문자열을 Base64로 디코딩하세요: RkxBR3tiYXNlNjRfaXNfZnVufQ==",
        flag: process.env.FLAG_BASE64,
        category: "Crypto",
        points: 50
    },
    {
        title: "시저 암호",
        description: "다음 문자열을 시저 암호로 복호화하세요: khoor zruog",
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

// 문제 추가 함수
function addProblems() {
    db.serialize(() => {
        // 기존 문제 삭제 (선택사항)
        db.run("DELETE FROM problems", (err) => {
            if (err) {
                console.error("기존 문제 삭제 중 오류:", err);
                return;
            }
            console.log("기존 문제가 삭제되었습니다.");
        });

        // 새 문제 추가
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

// 데이터베이스 연결 종료
db.close((err) => {
    if (err) {
        console.error("데이터베이스 연결 종료 중 오류:", err);
    } else {
        console.log("데이터베이스 연결이 종료되었습니다.");
    }
}); 