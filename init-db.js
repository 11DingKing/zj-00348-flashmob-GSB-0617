const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    theme TEXT NOT NULL,
    venue TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT '筹备',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    session_time DATETIME NOT NULL,
    venue TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    role_name TEXT NOT NULL,
    quota INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '待审核',
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS performances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    performance_name TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    role_id INTEGER,
    description TEXT,
    FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    registration_id INTEGER NOT NULL,
    attended INTEGER DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
    UNIQUE(session_id, registration_id)
  );
`);

console.log('数据库初始化完成');

const activities = [
  {
    title: '庆祝建党105周年红歌快闪',
    theme: '红歌快闪',
    venue: '市人民广场',
    description: '庆祝建党105周年大型红歌快闪活动，重温经典红歌，传承红色精神。',
    status: '已举办'
  },
  {
    title: '长征精神情景宣讲会',
    theme: '情景宣讲',
    venue: '市博物馆多功能厅',
    description: '通过情景再现的方式讲述长征故事，弘扬伟大长征精神。',
    status: '名单已定'
  },
  {
    title: '改革开放47周年歌咏会',
    theme: '红歌快闪',
    venue: '文化艺术中心大剧院',
    description: '唱响改革开放主旋律，歌颂新时代美好生活。',
    status: '报名中'
  },
  {
    title: '雷锋精神情景剧巡演',
    theme: '情景宣讲',
    venue: '青少年活动中心剧场',
    description: '以情景剧形式展现雷锋精神，号召学习雷锋好榜样。',
    status: '筹备'
  }
];

const insertActivity = db.prepare(`
  INSERT INTO activities (title, theme, venue, description, status)
  VALUES (?, ?, ?, ?, ?)
`);

const activityIds = [];
activities.forEach(a => {
  const info = insertActivity.run(a.title, a.theme, a.venue, a.description, a.status);
  activityIds.push(info.lastInsertRowid);
});

const sessionsData = [
  { activityIdx: 0, times: ['2026-06-01 19:00', '2026-06-02 19:00'], venue: '市人民广场' },
  { activityIdx: 1, times: ['2026-06-25 14:00', '2026-06-25 19:00'], venue: '市博物馆多功能厅' },
  { activityIdx: 2, times: ['2026-07-10 15:00', '2026-07-11 15:00', '2026-07-12 15:00'], venue: '文化艺术中心大剧院' },
  { activityIdx: 3, times: ['2026-07-20 14:00'], venue: '青少年活动中心剧场' }
];

const insertSession = db.prepare(`
  INSERT INTO sessions (activity_id, session_time, venue, order_index)
  VALUES (?, ?, ?, ?)
`);

const sessionIdsByActivity = {};
sessionsData.forEach(s => {
  const aid = activityIds[s.activityIdx];
  sessionIdsByActivity[aid] = [];
  s.times.forEach((t, i) => {
    const info = insertSession.run(aid, t, s.venue, i + 1);
    sessionIdsByActivity[aid].push(info.lastInsertRowid);
  });
});

const rolesData = [
  { activityIdx: 0, roles: [
    { name: '领唱', quota: 4, desc: '有声乐基础，能独立演唱段落' },
    { name: '合唱', quota: 30, desc: '热爱歌唱，能参加排练' },
    { name: '主持人', quota: 2, desc: '形象气质佳，普通话标准' }
  ]},
  { activityIdx: 1, roles: [
    { name: '情景剧演员', quota: 15, desc: '有表演经验优先' },
    { name: '旁白', quota: 3, desc: '声音有磁性，有感染力' },
    { name: '讲解员', quota: 5, desc: '熟悉长征历史' }
  ]},
  { activityIdx: 2, roles: [
    { name: '领唱', quota: 6, desc: '有声乐基础者优先' },
    { name: '合唱', quota: 40, desc: '热爱歌唱即可' },
    { name: '钢琴伴奏', quota: 2, desc: '有钢琴演奏经验' },
    { name: '舞蹈演员', quota: 12, desc: '有舞蹈基础' }
  ]},
  { activityIdx: 3, roles: [
    { name: '情景剧演员', quota: 20, desc: '青少年优先' },
    { name: '化妆师', quota: 3, desc: '有化妆经验' },
    { name: '道具组', quota: 5, desc: '动手能力强' }
  ]}
];

const insertRole = db.prepare(`
  INSERT INTO roles (activity_id, role_name, quota, description)
  VALUES (?, ?, ?, ?)
`);

const roleIdsByActivity = {};
rolesData.forEach(r => {
  const aid = activityIds[r.activityIdx];
  roleIdsByActivity[aid] = [];
  r.roles.forEach(role => {
    const info = insertRole.run(aid, role.name, role.quota, role.desc);
    roleIdsByActivity[aid].push(info.lastInsertRowid);
  });
});

const names = ['张伟', '王芳', '李明', '刘洋', '陈静', '杨磊', '赵敏', '周杰', '吴娜', '郑浩',
  '孙丽', '马超', '朱琳', '胡军', '郭涛', '何静', '高远', '林峰', '徐静', '黄磊',
  '曹颖', '宋佳', '谢霆', '唐嫣', '韩雪', '冯刚', '董卿', '肖战', '程琳', '曹阳',
  '袁泉', '邓超', '许晴', '傅园', '沈梦', '曾轶', '彭于', '吕良', '苏有', '蒋欣'];

const insertReg = db.prepare(`
  INSERT INTO registrations (activity_id, role_id, user_name, phone, status, remark)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function randomPhone() {
  return '138' + Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
}

function randomStatus(activityStatus) {
  if (activityStatus === '已举办' || activityStatus === '名单已定') {
    const r = Math.random();
    if (r < 0.5) return '已选中';
    if (r < 0.85) return '未选中';
    return '待审核';
  }
  if (activityStatus === '报名中') {
    return Math.random() < 0.1 ? '已选中' : '待审核';
  }
  return '待审核';
}

const regIds = [];
for (let ai = 0; ai < activityIds.length; ai++) {
  const aid = activityIds[ai];
  const aStatus = activities[ai].status;
  const rids = roleIdsByActivity[aid];
  
  rids.forEach(rid => {
    const roleInfo = rolesData[ai].roles.find(r => {
      const idx = rolesData[ai].roles.indexOf(r);
      return roleIdsByActivity[aid][idx] === rid;
    });
    const quota = roleInfo ? roleInfo.quota : 10;
    const regCount = Math.floor(quota * (0.8 + Math.random() * 1.5));
    
    for (let i = 0; i < regCount; i++) {
      const nameIdx = Math.floor(Math.random() * names.length);
      const status = randomStatus(aStatus);
      const info = insertReg.run(
        aid, rid, names[nameIdx], randomPhone(), status,
        status === '已选中' ? '符合要求，已安排排练' : (status === '未选中' ? '名额有限，感谢参与' : '')
      );
      regIds.push(info.lastInsertRowid);
    }
  });
}

const performancesData = [
  { activityIdx: 0, items: [
    { name: '开场：没有共产党就没有新中国', roleIdx: 0, sessions: [0, 1], order: 1 },
    { name: '合唱：歌唱祖国', roleIdx: 1, sessions: [0, 1], order: 2 },
    { name: '领唱：东方红', roleIdx: 0, sessions: [0, 1], order: 3 },
    { name: '大合唱：我和我的祖国', roleIdx: 1, sessions: [0, 1], order: 4 }
  ]},
  { activityIdx: 1, items: [
    { name: '情景一：长征出发', roleIdx: 0, sessions: [0, 1], order: 1 },
    { name: '旁白：过雪山草地', roleIdx: 1, sessions: [0, 1], order: 2 },
    { name: '情景二：遵义会议', roleIdx: 0, sessions: [0, 1], order: 3 },
    { name: '讲解：长征精神永放光芒', roleIdx: 2, sessions: [0, 1], order: 4 }
  ]},
  { activityIdx: 2, items: [
    { name: '合唱：春天的故事', roleIdx: 1, sessions: [0, 1, 2], order: 1 },
    { name: '领唱：走进新时代', roleIdx: 0, sessions: [0, 1, 2], order: 2 },
    { name: '舞蹈：在希望的田野上', roleIdx: 3, sessions: [0, 1, 2], order: 3 },
    { name: '钢琴伴奏独唱：不忘初心', roleIdx: 2, sessions: [0, 1, 2], order: 4 }
  ]}
];

const insertPerf = db.prepare(`
  INSERT INTO performances (activity_id, session_id, performance_name, order_index, role_id, description)
  VALUES (?, ?, ?, ?, ?, ?)
`);

performancesData.forEach(pd => {
  const aid = activityIds[pd.activityIdx];
  const sids = sessionIdsByActivity[aid];
  const rids = roleIdsByActivity[aid];
  
  pd.items.forEach(item => {
    item.sessions.forEach(sIdx => {
      insertPerf.run(
        aid, sids[sIdx], item.name, item.order, rids[item.roleIdx] || null, ''
      );
    });
  });
});

const insertAttendance = db.prepare(`
  INSERT OR IGNORE INTO attendance (session_id, registration_id, attended)
  VALUES (?, ?, ?)
`);

for (let i = 0; i < regIds.length; i++) {
  const regId = regIds[i];
  const regStmt = db.prepare('SELECT activity_id, status FROM registrations WHERE id = ?');
  const reg = regStmt.get(regId);
  if (reg && reg.status === '已选中') {
    const aid = reg.activity_id;
    const actStmt = db.prepare('SELECT status FROM activities WHERE id = ?');
    const act = actStmt.get(aid);
    if (act && act.status === '已举办') {
      const sids = sessionIdsByActivity[aid] || [];
      sids.forEach(sid => {
        insertAttendance.run(sid, regId, Math.random() > 0.15 ? 1 : 0);
      });
    }
  }
}

console.log('示例数据插入完成');
console.log(`活动: ${activityIds.length} 个`);
console.log(`场次: ${db.prepare('SELECT COUNT(*) FROM sessions').get()['COUNT(*)']} 个`);
console.log(`角色: ${db.prepare('SELECT COUNT(*) FROM roles').get()['COUNT(*)']} 个`);
console.log(`报名: ${db.prepare('SELECT COUNT(*) FROM registrations').get()['COUNT(*)']} 条`);
console.log(`节目: ${db.prepare('SELECT COUNT(*) FROM performances').get()['COUNT(*)']} 个`);

db.close();
