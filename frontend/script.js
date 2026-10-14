
const API_URL = "http://localhost:5000/api/tasks";

const form = document.getElementById("task-form");
const titleInput = document.getElementById("task-title");
const taskList = document.getElementById("task-list");
const message = document.getElementById("message");

let tasks = [];

async function loadTasks() {
  message.textContent = "Loading tasks...";

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Unable to load tasks");

    tasks = await response.json();
    renderTasks();
    message.textContent = tasks.length ? "" : "No tasks yet. Add your first task!";
  } catch (error) {
    message.textContent = "Could not connect to the backend. Make sure it is running.";
  }
}

function renderTasks() {
  taskList.replaceChildren();

  document.getElementById("total-count").textContent = tasks.length;
  document.getElementById("completed-count").textContent =
    tasks.filter(task => task.completed).length;
  document.getElementById("pending-count").textContent =
    tasks.filter(task => !task.completed).length;

  tasks.forEach(task => {
    const item = document.createElement("li");
    item.className = `task-item${task.completed ? " completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `Complete ${task.title}`);
    checkbox.addEventListener("change", () => updateTask(task, {
      completed: checkbox.checked
    }));

    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.className = "secondary-btn";
    editButton.addEventListener("click", async () => {
      const newTitle = prompt("Edit task title:", task.title);
      if (newTitle === null) return;
      if (!newTitle.trim()) {
        alert("Task title cannot be empty.");
        return;
      }
      await updateTask(task, { title: newTitle.trim() });
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.className = "delete-btn";
    deleteButton.addEventListener("click", () => deleteTask(task._id));

    actions.append(editButton, deleteButton);
    item.append(checkbox, title, actions);
    taskList.appendChild(item);
  });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not add task");

    titleInput.value = "";
    message.textContent = "Task added successfully!";
    await loadTasks();
  } catch (error) {
    message.textContent = error.message;
  }
});

async function updateTask(task, changes) {
  try {
    const response = await fetch(`${API_URL}/${task._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: changes.title ?? task.title,
        completed: changes.completed ?? task.completed
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not update task");

    await loadTasks();
  } catch (error) {
    message.textContent = error.message;
    await loadTasks();
  }
}

async function deleteTask(id) {
  if (!confirm("Are you sure you want to delete this task?")) return;

  try {
    const response = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not delete task");

    message.textContent = "Task deleted successfully!";
    await loadTasks();
  } catch (error) {
    message.textContent = error.message;
  }
}

document.getElementById("refresh-btn").addEventListener("click", loadTasks);

loadTasks();
