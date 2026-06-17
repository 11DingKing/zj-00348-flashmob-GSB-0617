let allActivities = [];
let editingActivityId = null;
let currentReviewId = null;
let currentPerfId = null;
let currentProgramActivityId = null;
let currentProgramSessionId = null;

function showToast(msg, type = "info") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = "toast show";
  toast.style.background =
    type === "error" ? "rgba(192,57,43,0.95)" : "rgba(50,50,50,0.9)";
  setTimeout(() => {
    toast.className = "toast";
  }, 2500);
}

function openModal(id) {
  document.getElementById(id).classList.add("active");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

document.querySelectorAll(".admin-nav a[data-nav]").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    document
      .querySelectorAll(".admin-nav a")
      .forEach((x) => x.classList.remove("active"));
    document
      .querySelectorAll(".nav-section")
      .forEach((x) => x.classList.remove("active"));
    a.classList.add("active");
    document.getElementById("nav-" + a.dataset.nav).classList.add("active");
    if (a.dataset.nav === "dashboard") loadDashboard();
    if (a.dataset.nav === "activities") loadActivitiesAdmin();
    if (a.dataset.nav === "reviews") loadReviews();
    if (a.dataset.nav === "statistics") loadStatistics();
    if (a.dataset.nav === "program") loadProgramActivities();
  });
});

async function loadDashboard() {
  const res = await fetch("/api/statistics/overview");
  const d = await res.json();
  document.getElementById("dashboardStats").innerHTML = `
    <div class="stat-card"><div class="stat-num">${d.activityCount}</div><div class="stat-label">活动总数</div></div>
    <div class="stat-card"><div class="stat-num">${d.regCount}</div><div class="stat-label">累计报名</div></div>
    <div class="stat-card"><div class="stat-num">${d.selectedCount}</div><div class="stat-label">已选中演员</div></div>
    <div class="stat-card"><div class="stat-num">${d.selectRate}</div><div class="stat-label">综合选中率</div></div>
    <div class="stat-card"><div class="stat-num">${d.finishedCount}</div><div class="stat-label">已举办活动</div></div>
  `;

  const res2 = await fetch("/api/activities");
  const activities = await res2.json();
  const recent = activities.slice(0, 5);
  document.getElementById("dashboardRecent").innerHTML = `
    <h3 style="font-size:16px;color:#555;margin-bottom:12px;padding-left:10px;border-left:3px solid #c0392b;">最新活动</h3>
    <table class="admin-table">
      <thead><tr><th>活动</th><th>主题</th><th>场地</th><th>报名数</th><th>状态</th></tr></thead>
      <tbody>
        ${recent
          .map(
            (a) => `
          <tr>
            <td>${a.title}</td>
            <td><span class="badge badge-yellow">${a.theme}</span></td>
            <td>${a.venue}</td>
            <td>${(a.roles || []).reduce((s, r) => s + r.registered_count, 0)}</td>
            <td>${statusBadge(a.status)}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function statusBadge(s) {
  const map = {
    筹备: "badge-gray",
    报名中: "badge-green",
    名单已定: "badge-blue",
    已举办: "badge-gray",
  };
  return `<span class="badge ${map[s] || ""}">${s}</span>`;
}

async function loadActivitiesAdmin() {
  const res = await fetch("/api/activities");
  allActivities = await res.json();
  document.getElementById("activityTableBody").innerHTML = allActivities
    .map((a) => {
      const regCount = (a.roles || []).reduce(
        (s, r) => s + r.registered_count,
        0,
      );
      return `
      <tr>
        <td>${a.title}</td>
        <td>${a.theme}</td>
        <td>${a.venue}</td>
        <td>${a.sessions.length} 场</td>
        <td>${regCount}</td>
        <td>
          ${statusBadge(a.status)}
          <select onchange="changeActivityStatus(${a.id}, this.value)" style="margin-left:6px;padding:2px 6px;font-size:12px;border-radius:4px;border:1px solid #ddd;">
            <option value="">流转</option>
            <option value="筹备">筹备</option>
            <option value="报名中">报名中</option>
            <option value="名单已定">名单已定</option>
            <option value="已举办">已举办</option>
          </select>
        </td>
        <td class="table-actions">
          <button class="btn btn-sm btn-info" onclick="editActivity(${a.id})">编辑</button>
          <button class="btn btn-sm btn-danger" onclick="deleteActivity(${a.id})">删除</button>
        </td>
      </tr>
    `;
    })
    .join("");
}

async function changeActivityStatus(id, status) {
  if (!status) return;
  if (!confirm(`确定将活动状态改为"${status}"吗？`)) return;
  const res = await fetch(`/api/activities/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (res.ok) {
    showToast("状态更新成功");
    loadActivitiesAdmin();
  } else showToast("更新失败", "error");
}

async function deleteActivity(id) {
  if (!confirm("确定删除此活动吗？相关数据将一并删除。")) return;
  const res = await fetch(`/api/activities/${id}`, { method: "DELETE" });
  if (res.ok) {
    showToast("删除成功");
    loadActivitiesAdmin();
  }
}

function addSessionItem(time = "", venue = "") {
  const list = document.getElementById("sessionList");
  const div = document.createElement("div");
  div.className = "dynamic-item";
  div.innerHTML = `
    <input type="datetime-local" class="sess-time" value="${time}" placeholder="时间">
    <input type="text" class="sess-venue" value="${venue}" placeholder="场地，留空用主场地">
    <button class="remove-btn" onclick="this.parentElement.remove()">×</button>
  `;
  list.appendChild(div);
}

function addRoleItem(name = "", quota = "", desc = "") {
  const list = document.getElementById("roleList");
  const div = document.createElement("div");
  div.className = "dynamic-item";
  div.innerHTML = `
    <input type="text" class="role-name" value="${name}" placeholder="角色名 例：领唱" style="flex:1;">
    <input type="number" class="role-quota" value="${quota}" placeholder="名额" style="width:90px;" min="0">
    <input type="text" class="role-desc" value="${desc}" placeholder="要求说明" style="flex:1.5;">
    <button class="remove-btn" onclick="this.parentElement.remove()">×</button>
  `;
  list.appendChild(div);
}

function openActivityModal() {
  editingActivityId = null;
  document.getElementById("activityModalTitle").textContent = "发起新活动";
  document.getElementById("actTitle").value = "";
  document.getElementById("actTheme").value = "红歌快闪";
  document.getElementById("actVenue").value = "";
  document.getElementById("actDesc").value = "";
  document.getElementById("sessionList").innerHTML = "";
  document.getElementById("roleList").innerHTML = "";
  addSessionItem();
  addRoleItem();
  openModal("activityModal");
}

async function editActivity(id) {
  editingActivityId = id;
  const res = await fetch(`/api/activities/${id}`);
  const a = await res.json();
  document.getElementById("activityModalTitle").textContent = "编辑活动";
  document.getElementById("actTitle").value = a.title;
  document.getElementById("actTheme").value = a.theme;
  document.getElementById("actVenue").value = a.venue;
  document.getElementById("actDesc").value = a.description || "";
  document.getElementById("sessionList").innerHTML = "";
  a.sessions.forEach((s) => {
    const t = s.session_time.replace(" ", "T").substring(0, 16);
    addSessionItem(t, s.venue);
  });
  if (a.sessions.length === 0) addSessionItem();
  document.getElementById("roleList").innerHTML = "";
  a.roles.forEach((r) =>
    addRoleItem(r.role_name, r.quota, r.description || ""),
  );
  if (a.roles.length === 0) addRoleItem();
  openModal("activityModal");
}

async function saveActivity() {
  const title = document.getElementById("actTitle").value.trim();
  const theme = document.getElementById("actTheme").value;
  const venue = document.getElementById("actVenue").value.trim();
  const description = document.getElementById("actDesc").value.trim();
  if (!title || !venue) {
    showToast("请填写活动名称和主场地", "error");
    return;
  }

  const sessions = [...document.querySelectorAll("#sessionList .dynamic-item")]
    .map((d) => ({
      time: d.querySelector(".sess-time").value.replace("T", " ") + ":00",
      venue: d.querySelector(".sess-venue").value.trim(),
    }))
    .filter((s) => s.time && s.time !== ":00");

  const roles = [...document.querySelectorAll("#roleList .dynamic-item")]
    .map((d) => ({
      name: d.querySelector(".role-name").value.trim(),
      quota: parseInt(d.querySelector(".role-quota").value) || 0,
      description: d.querySelector(".role-desc").value.trim(),
    }))
    .filter((r) => r.name);

  if (roles.length === 0) {
    showToast("请至少添加一个招募角色", "error");
    return;
  }

  const url = editingActivityId
    ? `/api/activities/${editingActivityId}`
    : "/api/activities";
  const method = editingActivityId ? "PUT" : "POST";
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, theme, venue, description, sessions, roles }),
  });
  if (res.ok) {
    showToast(editingActivityId ? "更新成功" : "创建成功");
    closeModal("activityModal");
    loadActivitiesAdmin();
  } else {
    const d = await res.json();
    showToast(d.error || "保存失败", "error");
  }
}

async function loadReviews() {
  await loadActivitiesAdmin();
  const sel1 = document.getElementById("reviewActivityFilter");
  sel1.innerHTML =
    '<option value="">全部活动</option>' +
    allActivities
      .map((a) => `<option value="${a.id}">${a.title}</option>`)
      .join("");
  const sel2 = document.getElementById("reviewRoleFilter");
  sel2.innerHTML = '<option value="">全部角色</option>';
  if (sel1.value) {
    const act = allActivities.find((a) => a.id == sel1.value);
    if (act)
      sel2.innerHTML += act.roles
        .map((r) => `<option value="${r.id}">${r.role_name}</option>`)
        .join("");
  }
  loadReviewTable();
}

document
  .getElementById("reviewActivityFilter")
  .addEventListener("change", () => {
    const aid = document.getElementById("reviewActivityFilter").value;
    const sel = document.getElementById("reviewRoleFilter");
    sel.innerHTML = '<option value="">全部角色</option>';
    if (aid) {
      const act = allActivities.find((a) => a.id == aid);
      if (act)
        sel.innerHTML += act.roles
          .map((r) => `<option value="${r.id}">${r.role_name}</option>`)
          .join("");
    }
    loadReviewTable();
  });
document
  .getElementById("reviewStatusFilter")
  .addEventListener("change", loadReviewTable);
document
  .getElementById("reviewRoleFilter")
  .addEventListener("change", loadReviewTable);

async function loadReviewTable() {
  const aid = document.getElementById("reviewActivityFilter").value;
  if (!aid && allActivities.length === 0) {
    document.getElementById("reviewTableBody").innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:40px;color:#999;">暂无数据</td></tr>';
    return;
  }
  let useId = aid;
  if (!useId && allActivities.length > 0) useId = allActivities[0].id;
  if (!useId) return;

  const status = document.getElementById("reviewStatusFilter").value;
  const roleId = document.getElementById("reviewRoleFilter").value;
  let url = `/api/activities/${useId}/registrations`;
  const params = [];
  if (status) params.push("status=" + encodeURIComponent(status));
  if (roleId) params.push("role_id=" + roleId);
  if (params.length) url += "?" + params.join("&");

  const res = await fetch(url);
  const list = await res.json();
  function regStatusBadge(s) {
    const m = {
      待审核: "badge-yellow",
      已选中: "badge-green",
      未选中: "badge-red",
    };
    return `<span class="badge ${m[s] || ""}">${s}</span>`;
  }
  document.getElementById("reviewTableBody").innerHTML = list.length
    ? list
        .map(
          (r) => `
    <tr>
      <td>${r.user_name}</td>
      <td>${r.phone}</td>
      <td>${allActivities.find((a) => a.id == r.activity_id)?.title || "-"}</td>
      <td><span class="badge badge-blue">${r.role_name}</span></td>
      <td>${r.created_at}</td>
      <td>${regStatusBadge(r.status)}</td>
      <td class="table-actions">
        <button class="btn btn-sm btn-success" onclick="quickReview(${r.id}, '已选中', '符合要求，已选中')">通过</button>
        <button class="btn btn-sm btn-danger" onclick="quickReview(${r.id}, '未选中', '名额有限，感谢参与')">拒绝</button>
        <button class="btn btn-sm btn-info" onclick="openReviewModal(${r.id})">详情</button>
      </td>
    </tr>
  `,
        )
        .join("")
    : '<tr><td colspan="7" style="text-align:center;padding:40px;color:#999;">暂无数据</td></tr>';
}

async function quickReview(id, status, remark) {
  const res = await fetch(`/api/registrations/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, remark }),
  });
  if (res.ok) {
    showToast("审核成功");
    loadReviewTable();
  }
}

async function openReviewModal(id) {
  currentReviewId = id;
  const res = await fetch(
    "/api/activities/" + allActivities[0].id + "/registrations",
  );
  const all = await res.json();
  let r = all.find((x) => x.id === id);
  if (!r) {
    for (const a of allActivities) {
      const rr = await fetch(`/api/activities/${a.id}/registrations`).then(
        (x) => x.json(),
      );
      r = rr.find((x) => x.id === id);
      if (r) break;
    }
  }
  if (!r) return;
  const act = allActivities.find((a) => a.id == r.activity_id);
  document.getElementById("reviewInfo").innerHTML = `
    <p><strong>姓名：</strong>${r.user_name}</p>
    <p><strong>手机号：</strong>${r.phone}</p>
    <p><strong>活动：</strong>${act?.title || "-"}</p>
    <p><strong>角色：</strong>${r.role_name}</p>
    <p><strong>报名时间：</strong>${r.created_at}</p>
  `;
  document.getElementById("reviewStatus").value = r.status;
  document.getElementById("reviewRemark").value = r.remark || "";
  openModal("reviewModal");
}

async function submitReview() {
  const status = document.getElementById("reviewStatus").value;
  const remark = document.getElementById("reviewRemark").value;
  const res = await fetch(`/api/registrations/${currentReviewId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, remark }),
  });
  if (res.ok) {
    showToast("审核成功");
    closeModal("reviewModal");
    loadReviewTable();
  }
}

async function loadProgramActivities() {
  if (allActivities.length === 0) {
    const res = await fetch("/api/activities");
    allActivities = await res.json();
  }
  const sel = document.getElementById("programActivityFilter");
  sel.innerHTML =
    '<option value="">请选择活动</option>' +
    allActivities
      .map((a) => `<option value="${a.id}">${a.title} (${a.status})</option>`)
      .join("");
  sel.onchange = () => {
    currentProgramActivityId = sel.value ? parseInt(sel.value) : null;
    currentProgramSessionId = null;
    loadProgramContent();
  };
  loadProgramContent();
}

async function loadProgramContent() {
  const container = document.getElementById("programContent");
  if (!currentProgramActivityId) {
    container.innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">🎭</div>请选择一个活动</div>';
    return;
  }
  const res = await fetch(`/api/activities/${currentProgramActivityId}`);
  const act = await res.json();

  if (act.sessions.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">📅</div>该活动尚未设置场次</div>';
    return;
  }

  if (!currentProgramSessionId) currentProgramSessionId = act.sessions[0].id;

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="font-size:15px;color:#555;margin-bottom:10px;">选择场次</h3>
      <div class="session-tabs">
        ${act.sessions
          .map(
            (s, i) => `
          <button class="session-tab ${s.id === currentProgramSessionId ? "active" : ""}" onclick="selectProgramSession(${s.id})">
            第${i + 1}场 ${s.session_time}
          </button>
        `,
          )
          .join("")}
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="font-size:15px;color:#555;">节目流程</h3>
      <button class="btn btn-sm btn-primary" onclick="openPerfModal()">+ 添加节目</button>
    </div>
    <div id="performanceList"></div>
  `;
  await loadPerformances();
}

function selectProgramSession(id) {
  currentProgramSessionId = id;
  loadProgramContent();
}

async function loadPerformances() {
  const res = await fetch(
    `/api/sessions/${currentProgramSessionId}/performances`,
  );
  const list = await res.json();
  const container = document.getElementById("performanceList");
  if (list.length === 0) {
    container.innerHTML =
      '<div class="empty-state" style="padding:30px;"><div class="empty-state-icon">🎬</div>暂无节目，点击上方按钮添加</div>';
    return;
  }
  container.innerHTML = `<ul class="performance-list">${list
    .map(
      (p) => `
    <li class="performance-item">
      <div class="perf-order">${p.order_index}</div>
      <div class="perf-info">
        <div class="perf-name">${p.performance_name}</div>
        <div class="perf-role">
          ${p.role_name ? `关联角色：<span class="badge badge-blue">${p.role_name}</span>` : "综合节目"}
          ${p.actor_count ? ` · 已选中演员：${p.actor_count}人` : ""}
        </div>
        ${p.actor_count > 0 ? `<div class="actor-avatars" id="actors-${p.id}"><button class="btn btn-sm btn-default" style="font-size:11px;padding:2px 8px;" onclick="showActors(${p.id})">查看演员名单</button></div>` : ""}
      </div>
      <div class="perf-actions">
        <button class="btn btn-sm btn-warn" onclick="movePerf(${p.id}, -1)">↑</button>
        <button class="btn btn-sm btn-warn" onclick="movePerf(${p.id}, 1)">↓</button>
        <button class="btn btn-sm btn-info" onclick="openPerfModal(${p.id})">编辑</button>
        <button class="btn btn-sm btn-danger" onclick="deletePerf(${p.id})">删除</button>
      </div>
    </li>
  `,
    )
    .join("")}</ul>`;
}

async function showActors(perfId) {
  const res = await fetch(`/api/performances/${perfId}/actors`);
  const d = await res.json();
  const container = document.getElementById("actors-" + perfId);
  if (d.actors.length === 0) {
    container.innerHTML =
      '<span style="font-size:12px;color:#999;">暂无选中演员</span>';
    return;
  }
  container.innerHTML = d.actors
    .map((a) => `<span class="actor-chip">${a.user_name}</span>`)
    .join("");
}

async function movePerf(id, dir) {
  const res = await fetch(
    `/api/sessions/${currentProgramSessionId}/performances`,
  );
  const list = await res.json();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= list.length) return;
  [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
  const items = list.map((p, i) => ({ id: p.id, order_index: i + 1 }));
  await fetch("/api/performances/reorder", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  loadPerformances();
}

async function openPerfModal(id) {
  currentPerfId = id || null;
  document.getElementById("perfModalTitle").textContent = id
    ? "编辑节目"
    : "添加节目";
  const act = allActivities.find((a) => a.id === currentProgramActivityId);
  const sel = document.getElementById("perfRole");
  sel.innerHTML =
    '<option value="">不关联</option>' +
    (act?.roles || [])
      .map((r) => `<option value="${r.id}">${r.role_name}</option>`)
      .join("");
  if (!id) {
    document.getElementById("perfName").value = "";
    document.getElementById("perfOrder").value = 1;
    document.getElementById("perfRole").value = "";
    document.getElementById("perfDesc").value = "";
  } else {
    const res = await fetch(
      `/api/sessions/${currentProgramSessionId}/performances`,
    );
    const list = await res.json();
    const p = list.find((x) => x.id === id);
    if (!p) return;
    document.getElementById("perfName").value = p.performance_name;
    document.getElementById("perfOrder").value = p.order_index;
    document.getElementById("perfRole").value = p.role_id || "";
    document.getElementById("perfDesc").value = p.description || "";
  }
  openModal("perfModal");
}

async function savePerformance() {
  const performance_name = document.getElementById("perfName").value.trim();
  if (!performance_name) {
    showToast("请输入节目名称", "error");
    return;
  }
  const order_index = parseInt(document.getElementById("perfOrder").value) || 1;
  const role_id = document.getElementById("perfRole").value || null;
  const description = document.getElementById("perfDesc").value;

  if (currentPerfId) {
    const res = await fetch(`/api/performances/${currentPerfId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        performance_name,
        order_index,
        role_id,
        description,
      }),
    });
    if (res.ok) {
      showToast("更新成功");
      closeModal("perfModal");
      loadPerformances();
    }
  } else {
    const res = await fetch("/api/performances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activity_id: currentProgramActivityId,
        session_id: currentProgramSessionId,
        performance_name,
        order_index,
        role_id,
        description,
      }),
    });
    if (res.ok) {
      showToast("添加成功");
      closeModal("perfModal");
      loadPerformances();
    }
  }
}

async function deletePerf(id) {
  if (!confirm("确定删除此节目？")) return;
  const res = await fetch(`/api/performances/${id}`, { method: "DELETE" });
  if (res.ok) {
    showToast("删除成功");
    loadPerformances();
  }
}

async function loadStatistics() {
  const [r1, r2, r3] = await Promise.all([
    fetch("/api/statistics/activities").then((r) => r.json()),
    fetch("/api/statistics/roles").then((r) => r.json()),
    fetch("/api/statistics/sessions").then((r) => r.json()),
  ]);
  document.getElementById("statActivityBody").innerHTML = r1
    .map(
      (a) => `
    <tr>
      <td>${a.title}</td>
      <td>${a.theme}</td>
      <td>${statusBadge(a.status)}</td>
      <td>${a.session_count}</td>
      <td>${a.reg_count}</td>
      <td>${a.selected_count || 0}</td>
      <td><span class="badge badge-blue">${a.selectRate}</span></td>
    </tr>
  `,
    )
    .join("");
  document.getElementById("statRoleBody").innerHTML = r2
    .map(
      (r) => `
    <tr>
      <td>${r.activity_title}</td>
      <td><span class="badge badge-yellow">${r.role_name}</span></td>
      <td>${r.quota}</td>
      <td>${r.reg_count}</td>
      <td><span class="badge badge-green">${r.fullRate}</span></td>
      <td>${r.selected_count || 0}</td>
      <td><span class="badge badge-blue">${r.selectRate}</span></td>
    </tr>
  `,
    )
    .join("");
  document.getElementById("statSessionBody").innerHTML = r3
    .map(
      (s) => `
    <tr>
      <td>${s.activity_title}</td>
      <td>${s.session_time}</td>
      <td>${s.venue}</td>
      <td>${s.performance_count}</td>
      <td>${s.total_actors || 0}</td>
      <td>${s.attend_count || 0}</td>
      <td><span class="badge ${s.attendanceRate && parseFloat(s.attendanceRate) >= 80 ? "badge-green" : "badge-yellow"}">${s.attendanceRate}</span></td>
    </tr>
  `,
    )
    .join("");
}

document.querySelectorAll(".modal").forEach((m) => {
  m.addEventListener("click", (e) => {
    if (e.target === m) m.classList.remove("active");
  });
});

loadDashboard();
