const API_URL = "https://ca2-task-manager-backend.onrender.com/api/tasks";

const form = document.getElementById("task-form");
const titleInput = document.getElementById("task-title");
const addButton = document.getElementById("add-btn");
const taskList = document.getElementById("task-list");
const message = document.getElementById("message");
const refreshButton = document.getElementById("refresh-btn");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const progressTrack = document.getElementById("progress-track");
const todayDate = document.getElementById("today-date");

let tasks = [];
let editingId = null;
let focusEditor = false;
let restoreFocusId = null;
let hasLoaded = false;
let loadFailed = false;
let messageTimer = null;

/* ---------- Small UI helpers ---------- */

const svg = paths =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;

const ICONS = {
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>'),
  save: svg('<path d="M20 6 9 17l-5-5"/>'),
  cancel: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  clipboard: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
  alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>')
};

function createButton(label, variant, iconName, ariaLabel, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn btn-sm ${variant}`;
  if (ariaLabel) button.setAttribute("aria-label", ariaLabel);

  const icon = document.createElement("span");
  icon.className = "icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = ICONS[iconName];

  button.append(icon, document.createTextNode(label));
  button.addEventListener("click", onClick);
  return button;
}

function setMessage(text, type = "info") {
  clearTimeout(messageTimer);
  message.textContent = text;
  message.dataset.type = type;
  message.setAttribute("role", type === "error" ? "alert" : "status");

  if (text && type === "success") {
    messageTimer = setTimeout(() => {
      message.textContent = "";
    }, 4000);
  }
}

function friendlyError(error) {
  return error instanceof TypeError
    ? "Could not connect to the backend. Make sure it is running."
    : error.message;
}

function setRefreshing(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.classList.toggle("is-loading", isLoading);
}

/* ---------- Loading ---------- */

async function loadTasks({ quiet = false } = {}) {
  if (!quiet) setMessage("Loading tasks...", "info");
  taskList.setAttribute("aria-busy", "true");
  setRefreshing(true);

  if (!hasLoaded && tasks.length === 0) renderSkeleton();

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Unable to load tasks");

    tasks = await response.json();
    hasLoaded = true;
    loadFailed = false;
    renderTasks();
    if (!quiet) setMessage("");
    return true;
  } catch (error) {
    loadFailed = true;
    setMessage("Could not connect to the backend. Make sure it is running.", "error");
    if (tasks.length === 0) renderTasks();
    return false;
  } finally {
    taskList.setAttribute("aria-busy", "false");
    setRefreshing(false);
  }
}

/* ---------- Rendering ---------- */

function updateSummary() {
  const total = tasks.length;
  const completed = tasks.filter(task => task.completed).length;
  const pending = tasks.filter(task => !task.completed).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  document.getElementById("total-count").textContent = total;
  document.getElementById("completed-count").textContent = completed;
  document.getElementById("pending-count").textContent = pending;

  progressFill.style.width = `${percent}%`;
  progressTrack.setAttribute("aria-valuenow", percent);
  progressLabel.textContent = total
    ? `${percent}% complete (${completed} of ${total})`
    : "No tasks yet";
}

function renderSkeleton() {
  taskList.replaceChildren();
  for (let i = 0; i < 3; i += 1) {
    const placeholder = document.createElement("li");
    placeholder.className = "skeleton";
    placeholder.setAttribute("aria-hidden", "true");
    taskList.appendChild(placeholder);
  }
}

function renderState({ iconName, title, text, isError, actionLabel, onAction }) {
  const item = document.createElement("li");
  item.className = `state${isError ? " is-error" : ""}`;

  const icon = document.createElement("span");
  icon.className = "state-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = ICONS[iconName].replace('width="16" height="16"', 'width="28" height="28"');

  const heading = document.createElement("h3");
  heading.textContent = title;

  const paragraph = document.createElement("p");
  paragraph.textContent = text;

  item.append(icon, heading, paragraph);

  if (actionLabel) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = `btn ${isError ? "btn-secondary" : "btn-primary"}`;
    action.textContent = actionLabel;
    action.addEventListener("click", onAction);
    item.appendChild(action);
  }

  taskList.appendChild(item);
}

function renderTasks() {
  taskList.replaceChildren();
  updateSummary();

  if (tasks.length === 0) {
    if (loadFailed) {
      renderState({
        iconName: "alert",
        title: "Couldn't load your tasks",
        text: "The backend may be starting up or unavailable. Please try again in a moment.",
        isError: true,
        actionLabel: "Try again",
        onAction: () => loadTasks()
      });
    } else {
      renderState({
        iconName: "clipboard",
        title: "No tasks yet",
        text: "Add your first task above to start planning your day.",
        actionLabel: "Add a task",
        onAction: () => titleInput.focus()
      });
    }
    return;
  }

  tasks.forEach(task => taskList.appendChild(buildTaskItem(task)));

  if (focusEditor) {
    const editor = taskList.querySelector(".edit-input");
    if (editor) {
      editor.focus();
      editor.select();
    }
    focusEditor = false;
  }

  if (restoreFocusId) {
    const target = Array.from(taskList.querySelectorAll("[data-edit-id]"))
      .find(button => button.dataset.editId === restoreFocusId);
    if (target) target.focus();
    restoreFocusId = null;
  }
}

function buildTaskItem(task) {
  const isEditing = task._id === editingId;
  const item = document.createElement("li");
  item.className = `task-item${task.completed ? " completed" : ""}${isEditing ? " editing" : ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-check";
  checkbox.checked = task.completed;
  checkbox.setAttribute("aria-label", `Complete ${task.title}`);
  checkbox.addEventListener("change", () =>
    updateTask(
      task,
      { completed: checkbox.checked },
      checkbox.checked ? "Task marked as completed." : "Task moved back to pending."
    )
  );

  const actions = document.createElement("div");
  actions.className = "task-actions";

  if (isEditing) {
    const editInput = document.createElement("input");
    editInput.type = "text";
    editInput.className = "edit-input";
    editInput.value = task.title;
    editInput.setAttribute("aria-label", `Edit title for ${task.title}`);
    editInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveEdit(task, editInput);
      } else if (event.key === "Escape") {
        cancelEditing(task);
      }
    });

    actions.append(
      createButton("Save", "btn-primary", "save", `Save changes to ${task.title}`, () =>
        saveEdit(task, editInput)
      ),
      createButton("Cancel", "btn-secondary", "cancel", "Cancel editing", () =>
        cancelEditing(task)
      )
    );

    item.append(checkbox, editInput, actions);
    return item;
  }

  const title = document.createElement("span");
  title.className = "task-title";
  title.textContent = task.title;

  const editButton = createButton("Edit", "btn-secondary", "edit", `Edit ${task.title}`, () =>
    startEditing(task)
  );
  editButton.dataset.editId = task._id;

  const deleteButton = createButton("Delete", "btn-danger", "trash", `Delete ${task.title}`, () =>
    deleteTask(task._id)
  );

  actions.append(editButton, deleteButton);
  item.append(checkbox, title, actions);
  return item;
}

/* ---------- Inline editing ---------- */

function startEditing(task) {
  editingId = task._id;
  focusEditor = true;
  renderTasks();
}

function cancelEditing(task) {
  editingId = null;
  restoreFocusId = task._id;
  renderTasks();
}

async function saveEdit(task, input) {
  const newTitle = input.value.trim();

  if (!newTitle) {
    setMessage("Task title cannot be empty.", "error");
    input.focus();
    return;
  }

  if (newTitle === task.title) {
    cancelEditing(task);
    return;
  }

  editingId = null;
  restoreFocusId = task._id;
  await updateTask(task, { title: newTitle }, "Task updated successfully!");
}

/* ---------- Create ---------- */

form.addEventListener("submit", async event => {
  event.preventDefault();
  const title = titleInput.value.trim();

  if (!title) {
    setMessage("Please enter a task title.", "error");
    titleInput.focus();
    return;
  }

  addButton.disabled = true;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not add task");

    titleInput.value = "";
    const loaded = await loadTasks({ quiet: true });
    if (loaded) setMessage("Task added successfully!", "success");
  } catch (error) {
    setMessage(friendlyError(error), "error");
  } finally {
    addButton.disabled = false;
    titleInput.focus();
  }
});

/* ---------- Update ---------- */

async function updateTask(task, changes, successText) {
  try {
    const response = await fetch(`${API_URL}/${task._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: changes.title ?? task.title,
        completed: changes.completed ?? task.completed
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not update task");

    const loaded = await loadTasks({ quiet: true });
    if (loaded && successText) setMessage(successText, "success");
  } catch (error) {
    setMessage(friendlyError(error), "error");
    await loadTasks({ quiet: true });
  }
}

/* ---------- Delete ---------- */

async function deleteTask(id) {
  if (!confirm("Are you sure you want to delete this task?")) return;

  try {
    const response = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not delete task");

    const loaded = await loadTasks({ quiet: true });
    if (loaded) setMessage("Task deleted successfully!", "success");
  } catch (error) {
    setMessage(friendlyError(error), "error");
  }
}

/* ---------- Init ---------- */

refreshButton.addEventListener("click", () => loadTasks());

todayDate.textContent = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric"
});

loadTasks();
