const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = new Database(path.join(__dirname, "data.db"));

const OCCUPIED_STATUSES = ["待审核", "已选中"];
const OCCUPIED_STATUS_SQL = "reg.status IN ('待审核', '已选中')";

function getRoleStats(activityId) {
  const roles = db
    .prepare(
      `
    SELECT r.*,
      COUNT(reg.id) AS registered_count,
      SUM(CASE WHEN ${OCCUPIED_STATUS_SQL} THEN 1 ELSE 0 END) AS occupied_count,
      SUM(CASE WHEN reg.status = '已选中' THEN 1 ELSE 0 END) AS selected_count
    FROM roles r
    LEFT JOIN registrations reg ON r.id = reg.role_id
    WHERE r.activity_id = ?
    GROUP BY r.id
    ORDER BY r.id
  `,
    )
    .all(activityId);
  return roles.map((r) => ({
    ...r,
    is_full: r.occupied_count >= r.quota,
  }));
}

function getOccupiedCount(roleId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM registrations WHERE role_id = ? AND status IN (${OCCUPIED_STATUSES.map(() => "?").join(",")})`,
    )
    .get(roleId, ...OCCUPIED_STATUSES).c;
}

app.get("/api/activities", (req, res) => {
  const { status } = req.query;
  let sql = "SELECT * FROM activities ORDER BY created_at DESC";
  let params = [];
  if (status) {
    sql = "SELECT * FROM activities WHERE status = ? ORDER BY created_at DESC";
    params = [status];
  }
  const activities = db.prepare(sql).all(...params);
  const result = activities.map((a) => {
    const roles = getRoleStats(a.id);
    const sessions = db
      .prepare(
        "SELECT * FROM sessions WHERE activity_id = ? ORDER BY order_index",
      )
      .all(a.id);
    return { ...a, roles, sessions };
  });
  res.json(result);
});

app.get("/api/activities/:id", (req, res) => {
  const activity = db
    .prepare("SELECT * FROM activities WHERE id = ?")
    .get(req.params.id);
  if (!activity) return res.status(404).json({ error: "活动不存在" });
  activity.roles = getRoleStats(activity.id);
  activity.sessions = db
    .prepare(
      "SELECT * FROM sessions WHERE activity_id = ? ORDER BY order_index",
    )
    .all(activity.id);
  activity.performances = db
    .prepare(
      `
    SELECT p.*, r.role_name FROM performances p
    LEFT JOIN roles r ON p.role_id = r.id
    WHERE p.activity_id = ?
    ORDER BY p.session_id, p.order_index
  `,
    )
    .all(activity.id);
  res.json(activity);
});

app.post("/api/activities", (req, res) => {
  const { title, theme, venue, description, sessions, roles } = req.body;
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `
      INSERT INTO activities (title, theme, venue, description, status)
      VALUES (?, ?, ?, ?, '筹备')
    `,
      )
      .run(title, theme, venue, description || "");
    const activityId = info.lastInsertRowid;
    if (sessions && sessions.length) {
      sessions.forEach((s, i) => {
        db.prepare(
          `
          INSERT INTO sessions (activity_id, session_time, venue, order_index)
          VALUES (?, ?, ?, ?)
        `,
        ).run(activityId, s.time, s.venue || venue, i + 1);
      });
    }
    if (roles && roles.length) {
      roles.forEach((r) => {
        db.prepare(
          `
          INSERT INTO roles (activity_id, role_name, quota, description)
          VALUES (?, ?, ?, ?)
        `,
        ).run(activityId, r.name, r.quota, r.description || "");
      });
    }
    return activityId;
  });
  try {
    const id = tx();
    res.json({ id, message: "创建成功" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/activities/:id", (req, res) => {
  const { title, theme, venue, description, sessions, roles } = req.body;
  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE activities SET title=?, theme=?, venue=?, description=? WHERE id=?
    `,
    ).run(title, theme, venue, description || "", req.params.id);
    db.prepare("DELETE FROM sessions WHERE activity_id = ?").run(req.params.id);
    if (sessions && sessions.length) {
      sessions.forEach((s, i) => {
        db.prepare(
          `
          INSERT INTO sessions (activity_id, session_time, venue, order_index)
          VALUES (?, ?, ?, ?)
        `,
        ).run(req.params.id, s.time, s.venue || venue, i + 1);
      });
    }
    db.prepare("DELETE FROM roles WHERE activity_id = ?").run(req.params.id);
    if (roles && roles.length) {
      roles.forEach((r) => {
        db.prepare(
          `
          INSERT INTO roles (activity_id, role_name, quota, description)
          VALUES (?, ?, ?, ?)
        `,
        ).run(req.params.id, r.name, r.quota, r.description || "");
      });
    }
  });
  try {
    tx();
    res.json({ message: "更新成功" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/activities/:id/status", (req, res) => {
  const { status } = req.body;
  const validStatus = ["筹备", "报名中", "名单已定", "已举办"];
  if (!validStatus.includes(status)) {
    return res.status(400).json({ error: "无效状态" });
  }
  db.prepare("UPDATE activities SET status = ? WHERE id = ?").run(
    status,
    req.params.id,
  );
  res.json({ message: "状态更新成功" });
});

app.delete("/api/activities/:id", (req, res) => {
  db.prepare("DELETE FROM activities WHERE id = ?").run(req.params.id);
  res.json({ message: "删除成功" });
});

app.get("/api/activities/:id/registrations", (req, res) => {
  const { status, role_id } = req.query;
  let sql = `
    SELECT reg.*, r.role_name FROM registrations reg
    JOIN roles r ON reg.role_id = r.id
    WHERE reg.activity_id = ?
  `;
  let params = [req.params.id];
  if (status) {
    sql += " AND reg.status = ?";
    params.push(status);
  }
  if (role_id) {
    sql += " AND reg.role_id = ?";
    params.push(role_id);
  }
  sql += " ORDER BY reg.created_at DESC";
  const list = db.prepare(sql).all(...params);
  res.json(list);
});

app.post("/api/registrations", (req, res) => {
  const { activity_id, role_id, user_name, phone } = req.body;
  if (!activity_id || !role_id || !user_name || !phone) {
    return res.status(400).json({ error: "参数不完整" });
  }
  const activity = db
    .prepare("SELECT status FROM activities WHERE id = ?")
    .get(activity_id);
  if (!activity) return res.status(404).json({ error: "活动不存在" });
  if (activity.status !== "报名中") {
    return res.status(400).json({ error: "该活动不在报名中" });
  }
  const role = db
    .prepare("SELECT * FROM roles WHERE id = ? AND activity_id = ?")
    .get(role_id, activity_id);
  if (!role) return res.status(404).json({ error: "角色不存在" });
  const occupiedCount = getOccupiedCount(role_id);
  if (occupiedCount >= role.quota) {
    return res.status(400).json({ error: "该角色名额已满" });
  }
  const exist = db
    .prepare(
      "SELECT * FROM registrations WHERE activity_id = ? AND role_id = ? AND phone = ?",
    )
    .get(activity_id, role_id, phone);
  if (exist) {
    return res.status(400).json({ error: "您已报名该角色" });
  }
  const info = db
    .prepare(
      `
    INSERT INTO registrations (activity_id, role_id, user_name, phone, status)
    VALUES (?, ?, ?, ?, '待审核')
  `,
    )
    .run(activity_id, role_id, user_name, phone);
  res.json({ id: info.lastInsertRowid, message: "报名成功" });
});

app.get("/api/registrations/query", (req, res) => {
  const { user_name, phone } = req.query;
  if (!user_name || !phone) {
    return res.status(400).json({ error: "请输入姓名和手机号" });
  }
  const list = db
    .prepare(
      `
    SELECT reg.*, a.title AS activity_title, a.theme, a.venue AS activity_venue,
      a.status AS activity_status, r.role_name, s.session_time, s.venue AS session_venue,
      p.performance_name, p.order_index
    FROM registrations reg
    JOIN activities a ON reg.activity_id = a.id
    JOIN roles r ON reg.role_id = r.id
    LEFT JOIN performances p ON p.role_id = r.id AND p.activity_id = a.id
    LEFT JOIN sessions s ON p.session_id = s.id
    WHERE reg.user_name = ? AND reg.phone = ?
    ORDER BY reg.created_at DESC
  `,
    )
    .all(user_name, phone);
  const grouped = {};
  list.forEach((item) => {
    if (!grouped[item.id]) {
      grouped[item.id] = {
        id: item.id,
        activity_id: item.activity_id,
        activity_title: item.activity_title,
        theme: item.theme,
        activity_venue: item.activity_venue,
        activity_status: item.activity_status,
        role_name: item.role_name,
        role_id: item.role_id,
        status: item.status,
        remark: item.remark,
        created_at: item.created_at,
        schedules: [],
      };
    }
    if (item.performance_name) {
      grouped[item.id].schedules.push({
        session_time: item.session_time,
        session_venue: item.session_venue,
        performance_name: item.performance_name,
        order_index: item.order_index,
      });
    }
  });
  const result = Object.values(grouped).map((g) => ({
    ...g,
    schedules: g.schedules
      .filter(
        (v, i, a) =>
          a.findIndex(
            (x) =>
              x.performance_name === v.performance_name &&
              x.session_time === v.session_time,
          ) === i,
      )
      .sort(
        (a, b) =>
          new Date(a.session_time) - new Date(b.session_time) ||
          a.order_index - b.order_index,
      ),
  }));
  res.json(result);
});

app.put("/api/registrations/:id/status", (req, res) => {
  const { status, remark } = req.body;
  const validStatus = ["待审核", "已选中", "未选中"];
  if (!validStatus.includes(status)) {
    return res.status(400).json({ error: "无效状态" });
  }
  db.prepare(
    "UPDATE registrations SET status = ?, remark = ? WHERE id = ?",
  ).run(status, remark || "", req.params.id);
  res.json({ message: "审核完成" });
});

app.get("/api/sessions/:id/performances", (req, res) => {
  const list = db
    .prepare(
      `
    SELECT p.*, r.role_name,
      COUNT(reg.id) AS actor_count
    FROM performances p
    LEFT JOIN roles r ON p.role_id = r.id
    LEFT JOIN registrations reg ON p.role_id = reg.role_id AND reg.status = '已选中'
    WHERE p.session_id = ?
    GROUP BY p.id
    ORDER BY p.order_index
  `,
    )
    .all(req.params.id);
  res.json(list);
});

app.get("/api/performances/:id/actors", (req, res) => {
  const perf = db
    .prepare("SELECT * FROM performances WHERE id = ?")
    .get(req.params.id);
  if (!perf) return res.status(404).json({ error: "节目不存在" });
  const actors = db
    .prepare(
      `
    SELECT reg.* FROM registrations reg
    WHERE reg.role_id = ? AND reg.status = '已选中'
    ORDER BY reg.user_name
  `,
    )
    .all(perf.role_id);
  res.json({ performance: perf, actors });
});

app.post("/api/performances", (req, res) => {
  const {
    activity_id,
    session_id,
    performance_name,
    order_index,
    role_id,
    description,
  } = req.body;
  const info = db
    .prepare(
      `
    INSERT INTO performances (activity_id, session_id, performance_name, order_index, role_id, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      activity_id,
      session_id,
      performance_name,
      order_index || 0,
      role_id || null,
      description || "",
    );
  res.json({ id: info.lastInsertRowid, message: "节目添加成功" });
});

app.put("/api/performances/:id", (req, res) => {
  const { performance_name, order_index, role_id, description } = req.body;
  db.prepare(
    `
    UPDATE performances SET performance_name=?, order_index=?, role_id=?, description=?
    WHERE id=?
  `,
  ).run(
    performance_name,
    order_index || 0,
    role_id || null,
    description || "",
    req.params.id,
  );
  res.json({ message: "节目更新成功" });
});

app.delete("/api/performances/:id", (req, res) => {
  db.prepare("DELETE FROM performances WHERE id = ?").run(req.params.id);
  res.json({ message: "删除成功" });
});

app.put("/api/performances/reorder", (req, res) => {
  const { items } = req.body;
  const tx = db.transaction(() => {
    items.forEach((item) => {
      db.prepare("UPDATE performances SET order_index = ? WHERE id = ?").run(
        item.order_index,
        item.id,
      );
    });
  });
  tx();
  res.json({ message: "排序成功" });
});

app.get("/api/statistics/overview", (req, res) => {
  const activityCount = db
    .prepare("SELECT COUNT(*) AS c FROM activities")
    .get().c;
  const regCount = db
    .prepare("SELECT COUNT(*) AS c FROM registrations")
    .get().c;
  const selectedCount = db
    .prepare("SELECT COUNT(*) AS c FROM registrations WHERE status='已选中'")
    .get().c;
  const finishedCount = db
    .prepare("SELECT COUNT(*) AS c FROM activities WHERE status='已举办'")
    .get().c;
  res.json({
    activityCount,
    regCount,
    selectedCount,
    finishedCount,
    selectRate:
      regCount > 0 ? ((selectedCount / regCount) * 100).toFixed(1) + "%" : "0%",
  });
});

app.get("/api/statistics/activities", (req, res) => {
  const list = db
    .prepare(
      `
    SELECT a.*,
      COUNT(DISTINCT reg.id) AS reg_count,
      SUM(CASE WHEN reg.status='已选中' THEN 1 ELSE 0 END) AS selected_count,
      COUNT(DISTINCT s.id) AS session_count
    FROM activities a
    LEFT JOIN registrations reg ON a.id = reg.activity_id
    LEFT JOIN sessions s ON a.id = s.activity_id
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `,
    )
    .all();
  res.json(
    list.map((a) => ({
      ...a,
      selectRate:
        a.reg_count > 0
          ? ((a.selected_count / a.reg_count) * 100).toFixed(1) + "%"
          : "0%",
    })),
  );
});

app.get("/api/statistics/roles", (req, res) => {
  const list = db
    .prepare(
      `
    SELECT r.*, a.title AS activity_title,
      COUNT(reg.id) AS reg_count,
      SUM(CASE WHEN ${OCCUPIED_STATUS_SQL} THEN 1 ELSE 0 END) AS occupied_count,
      SUM(CASE WHEN reg.status='已选中' THEN 1 ELSE 0 END) AS selected_count
    FROM roles r
    JOIN activities a ON r.activity_id = a.id
    LEFT JOIN registrations reg ON r.id = reg.role_id
    GROUP BY r.id
    ORDER BY a.created_at DESC, r.id
  `,
    )
    .all();
  res.json(
    list.map((r) => ({
      ...r,
      selectRate:
        r.reg_count > 0
          ? ((r.selected_count / r.reg_count) * 100).toFixed(1) + "%"
          : "0%",
      fullRate:
        r.quota > 0
          ? ((Math.min(r.occupied_count, r.quota) / r.quota) * 100).toFixed(1) +
            "%"
          : "0%",
    })),
  );
});

app.get("/api/statistics/sessions", (req, res) => {
  const list = db
    .prepare(
      `
    SELECT s.*, a.title AS activity_title,
      COUNT(DISTINCT p.id) AS performance_count,
      SUM(CASE WHEN att.attended=1 THEN 1 ELSE 0 END) AS attend_count,
      COUNT(DISTINCT att.registration_id) AS total_actors
    FROM sessions s
    JOIN activities a ON s.activity_id = a.id
    LEFT JOIN performances p ON s.id = p.session_id
    LEFT JOIN attendance att ON s.id = att.session_id
    GROUP BY s.id
    ORDER BY a.created_at DESC, s.order_index
  `,
    )
    .all();
  res.json(
    list.map((s) => ({
      ...s,
      attendanceRate:
        s.total_actors > 0
          ? ((s.attend_count / s.total_actors) * 100).toFixed(1) + "%"
          : "-",
    })),
  );
});

app.put("/api/attendance", (req, res) => {
  const { session_id, registration_id, attended } = req.body;
  db.prepare(
    `
    INSERT INTO attendance (session_id, registration_id, attended)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id, registration_id) DO UPDATE SET attended = excluded.attended
  `,
  ).run(session_id, registration_id, attended ? 1 : 0);
  res.json({ message: "签到更新成功" });
});

app.listen(PORT, () => {
  console.log(`红歌快闪活动系统已启动: http://localhost:${PORT}`);
  console.log(`群众端: http://localhost:${PORT}/`);
  console.log(`后台管理: http://localhost:${PORT}/admin.html`);
});
