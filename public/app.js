const $ = (id) => document.getElementById(id);

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

async function loadStats() {
  const data = await api("/api/reminders/stats");

  $("total").textContent = data.total;
  $("scheduled").textContent = data.scheduled;
  $("sent").textContent = data.sent;
  $("failed").textContent = data.failed;
}

async function loadReminders() {
  const status = $("status").value;
  const query = status ? `?status=${encodeURIComponent(status)}` : "";

  const data = await api(`/api/reminders${query}`);
  const tbody = $("reminders");
  tbody.innerHTML = "";

  if (!data.reminders.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">No reminders found.</td></tr>`;
    return;
  }

  for (const reminder of data.reminders) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><strong>${escapeHtml(reminder.reminderId)}</strong></td>
      <td>${escapeHtml(reminder.phone)}</td>
      <td>${escapeHtml(reminder.message)}</td>
      <td>${escapeHtml(formatDate(reminder.scheduledFor))}</td>
      <td><span class="badge ${escapeHtml(reminder.status)}">${escapeHtml(reminder.status)}</span></td>
      <td>
        ${
          reminder.status === "scheduled"
            ? `<button class="cancel" data-id="${escapeHtml(reminder.reminderId)}">Cancel</button>`
            : ""
        }
      </td>
    `;

    tbody.appendChild(tr);
  }

  document.querySelectorAll(".cancel").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm(`Cancel ${button.dataset.id}?`)) return;

      try {
        await api(`/api/reminders/${encodeURIComponent(button.dataset.id)}`, {
          method: "DELETE"
        });
        await refresh();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refresh() {
  $("message").textContent = "Loading...";
  try {
    await Promise.all([loadStats(), loadReminders()]);
    $("message").textContent = "";
  } catch (error) {
    $("message").textContent = error.message;
  }
}

$("refresh").addEventListener("click", refresh);
$("status").addEventListener("change", loadReminders);

refresh();
