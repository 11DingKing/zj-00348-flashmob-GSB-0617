let currentActivities = [];
let currentActivityId = null;
let currentRoleId = null;

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

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

function statusTagClass(status) {
  switch (status) {
    case "筹备":
      return "status-prep";
    case "报名中":
      return "status-enrolling";
    case "名单已定":
      return "status-selected";
    case "已举办":
      return "status-finished";
    default:
      return "";
  }
}

async function loadActivities() {
  const status = document.getElementById("statusFilter").value;
  let url = "/api/activities";
  if (status) url += "?status=" + encodeURIComponent(status);
  const res = await fetch(url);
  currentActivities = await res.json();
  renderActivities();
}

function renderActivities() {
  const list = document.getElementById("activityList");
  if (currentActivities.length === 0) {
    list.innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">📋</div>暂无活动</div>';
    return;
  }
  list.innerHTML = currentActivities
    .map((a) => {
      const firstSession = a.sessions[0];
      const roleTags = (a.roles || [])
        .map((r) => {
          const pct = Math.min(
            100,
            Math.round((r.registered_count / r.quota) * 100),
          );
          return `<span class="role-tag ${r.is_full ? "full" : ""}">${r.role_name} ${r.registered_count}/${r.quota}</span>`;
        })
        .join("");
      return `
      <div class="activity-card" onclick="viewActivity(${a.id})">
        <div class="activity-card-header">
          <div class="activity-title">${a.title}</div>
          <div class="activity-tags">
            <span class="tag theme">${a.theme}</span>
            <span class="tag ${statusTagClass(a.status)}">${a.status}</span>
          </div>
        </div>
        <div class="activity-card-body">
          <p>📍 ${a.venue}</p>
          <p>🗓 ${firstSession ? firstSession.session_time : "时间待定"}${a.sessions.length > 1 ? ` 等${a.sessions.length}场` : ""}</p>
          ${a.description ? `<p style="margin-top:8px;color:#888;">${a.description.substring(0, 50)}${a.description.length > 50 ? "..." : ""}</p>` : ""}
          <div class="role-list">${roleTags}</div>
        </div>
        <div class="activity-card-footer">
          <span>共 ${(a.roles || []).reduce((s, r) => s + r.registered_count, 0)} 人报名</span>
          <span>查看详情 →</span>
        </div>
      </div>
    `;
    })
    .join("");
}

async function viewActivity(id) {
  currentActivityId = id;
  const res = await fetch(`/api/activities/${id}`);
  const a = await res.json();
  const html = `
    <div class="detail-header">
      <h2>${a.title}</h2>
      <div class="activity-tags" style="margin-bottom:12px;">
        <span class="tag theme">${a.theme}</span>
        <span class="tag ${statusTagClass(a.status)}">${a.status}</span>
      </div>
      <div class="detail-meta">
        <p>📍 主场地：${a.venue}</p>
        ${a.description ? `<p>📝 ${a.description}</p>` : ""}
      </div>
    </div>

    <div class="detail-section">
      <h3>场次安排</h3>
      <div class="session-list">
        ${
          a.sessions
            .map(
              (s, i) => `
          <div class="session-item">
            <span>第 ${i + 1} 场 · ${s.session_time}</span>
            <span>📍 ${s.venue}</span>
          </div>
        `,
            )
            .join("") || '<p style="color:#999;font-size:13px;">暂无场次</p>'
        }
      </div>
    </div>

    <div class="detail-section">
      <h3>招募角色</h3>
      <div class="role-grid">
        ${
          a.roles
            .map((r) => {
              const pct = Math.min(
                100,
                Math.round((r.registered_count / r.quota) * 100),
              );
              const canApply = a.status === "报名中" && !r.is_full;
              return `
            <div class="role-card">
              <div class="role-card-header">
                <span class="role-card-name">${r.role_name}</span>
                <span class="role-card-quota">${r.registered_count} / ${r.quota}</span>
              </div>
              ${r.description ? `<div class="role-card-desc">${r.description}</div>` : ""}
              <div class="progress-bar">
                <div class="progress-bar-fill ${r.is_full ? "full" : ""}" style="width:${pct}%"></div>
              </div>
              ${
                canApply
                  ? `<button class="btn btn-sm btn-primary" onclick="openRegisterModal(${a.id}, ${r.id}, '${r.role_name}')">报名</button>`
                  : `<span style="font-size:12px;color:${r.is_full ? "#e74c3c" : "#999"};">${r.is_full ? "名额已满" : "暂不接受报名"}</span>`
              }
            </div>
          `;
            })
            .join("") ||
          '<p style="color:#999;font-size:13px;">暂无招募角色</p>'
        }
      </div>
    </div>

    ${
      a.status === "名单已定" || a.status === "已举办"
        ? `
      <div class="detail-section">
        <h3>节目流程单</h3>
        ${renderProgramFlow(a)}
      </div>
    `
        : ""
    }
  `;
  document.getElementById("activityDetail").innerHTML = html;
  openModal("activityModal");
}

function renderProgramFlow(activity) {
  const bySession = {};
  activity.sessions.forEach((s) => {
    bySession[s.id] = { ...s, items: [] };
  });
  activity.performances.forEach((p) => {
    if (bySession[p.session_id]) bySession[p.session_id].items.push(p);
  });
  let html = "";
  Object.values(bySession).forEach((s, si) => {
    html += `
      <div style="margin-bottom:18px;">
        <h4 style="font-size:14px;color:#555;margin-bottom:8px;">第 ${si + 1} 场 · ${s.session_time} · ${s.venue}</h4>
        <div class="performance-list">
          ${
            s.items
              .map(
                (item) => `
            <li class="performance-item">
              <div class="perf-order">${item.order_index}</div>
              <div class="perf-info">
                <div class="perf-name">${item.performance_name}</div>
                <div class="perf-role">${item.role_name || "综合节目"}</div>
              </div>
            </li>
          `,
              )
              .join("") ||
            '<p style="color:#999;font-size:13px;padding:12px;">节目编排中...</p>'
          }
        </div>
      </div>
    `;
  });
  return html;
}

function openRegisterModal(activityId, roleId, roleName) {
  currentActivityId = activityId;
  currentRoleId = roleId;
  document.getElementById("roleDisplay").innerHTML =
    `<span class="badge badge-red">${roleName}</span>`;
  document.getElementById("regName").value = "";
  document.getElementById("regPhone").value = "";
  closeModal("activityModal");
  openModal("registerModal");
}

async function submitRegistration() {
  const user_name = document.getElementById("regName").value.trim();
  const phone = document.getElementById("regPhone").value.trim();
  if (!user_name || !phone) {
    showToast("请填写完整信息", "error");
    return;
  }
  if (!/^1\d{10}$/.test(phone)) {
    showToast("请输入正确的手机号", "error");
    return;
  }

  const res = await fetch("/api/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      activity_id: currentActivityId,
      role_id: currentRoleId,
      user_name,
      phone,
    }),
  });
  const data = await res.json();
  if (res.ok) {
    showToast("报名成功！请等待审核");
    closeModal("registerModal");
    loadActivities();
  } else {
    showToast(data.error || "报名失败", "error");
  }
}

async function queryMyRegistrations() {
  const name = document.getElementById("queryName").value.trim();
  const phone = document.getElementById("queryPhone").value.trim();
  if (!name || !phone) {
    showToast("请输入姓名和手机号", "error");
    return;
  }

  const res = await fetch(
    `/api/registrations/query?user_name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`,
  );
  const list = await res.json();
  const container = document.getElementById("queryResult");
  if (!res.ok) {
    showToast(list.error || "查询失败", "error");
    return;
  }

  if (list.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">🔍</div>没有找到报名记录</div>';
    return;
  }

  function statusClass(s) {
    if (s === "待审核") return "pending";
    if (s === "已选中") return "selected";
    if (s === "未选中") return "rejected";
    return "";
  }

  container.innerHTML = `
    <div class="query-result-list">
      ${list
        .map(
          (r) => `
        <div class="reg-card">
          <div class="reg-card-header">
            <div>
              <div class="reg-card-title">${r.activity_title}</div>
              <div style="font-size:12px;color:#999;margin-top:4px;">${r.theme} · ${r.activity_venue}</div>
            </div>
            <span class="reg-status ${statusClass(r.status)}">${r.status}</span>
          </div>
          <div class="reg-card-body">
            <p><strong>角色：</strong>${r.role_name}</p>
            <p><strong>报名时间：</strong>${r.created_at}</p>
            <p><strong>活动状态：</strong>${r.activity_status}</p>
            ${r.remark ? `<p><strong>备注：</strong>${r.remark}</p>` : ""}
            ${
              r.schedules && r.schedules.length > 0
                ? `
              <div class="schedule-list">
                <h4>🎭 我的演出安排</h4>
                ${r.schedules
                  .map(
                    (s) => `
                  <div class="schedule-item">
                    <strong>第${s.order_index}个节目</strong>：${s.performance_name}<br>
                    🗓 ${s.session_time} · 📍 ${s.session_venue}
                  </div>
                `,
                  )
                  .join("")}
              </div>
            `
                : ""
            }
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

document
  .getElementById("statusFilter")
  .addEventListener("change", loadActivities);

document.querySelectorAll(".modal").forEach((m) => {
  m.addEventListener("click", (e) => {
    if (e.target === m) m.classList.remove("active");
  });
});

loadActivities();
