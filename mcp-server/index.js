
const express = require("express");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");

const app = express();
app.use(express.json());

const API_URL =
  process.env.TASK_API_URL ||
  "https://ca2-task-manager-backend.onrender.com";

const server = new McpServer({
  name: "task-manager-mcp",
  version: "1.0.0",
});

// Send requests to the Task Manager backend.
async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Backend returned an invalid response");
  }

  if (!response.ok) {
    throw new Error(data.error || `Backend error: ${response.status}`);
  }

  return data;
}

// Tool 1: Get all tasks.
server.registerTool(
  "get_tasks",
  {
    title: "Get tasks",
    description: "List tasks in the Task Manager.",
    inputSchema: {},
  },
  async () => {
    const tasks = await apiRequest("/api/tasks");

    return {
      content: [
        { type: "text", text: JSON.stringify(tasks, null, 2) },
      ],
    };
  }
);

// Tool 2: Add a task.
server.registerTool(
  "add_task",
  {
    title: "Add task",
    description: "Create a task with a title.",
    inputSchema: {
      title: z.string().trim().min(1).max(200),
    },
  },
  async ({ title }) => {
    const task = await apiRequest("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title }),
    });

    return {
      content: [
        { type: "text", text: JSON.stringify(task, null, 2) },
      ],
    };
  }
);

// Tool 3: Update a task.
server.registerTool(
  "update_task",
  {
    title: "Update task",
    description:
      "Update a task using its MongoDB ID. Supply its title and completion status.",
    inputSchema: {
      id: z.string().min(1),
      title: z.string().trim().min(1).max(200),
      completed: z.boolean(),
    },
  },
  async ({ id, title, completed }) => {
    const task = await apiRequest(
      `/api/tasks/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify({ title, completed }),
      }
    );

    return {
      content: [
        { type: "text", text: JSON.stringify(task, null, 2) },
      ],
    };
  }
);

// Tool 4: Delete a task.
server.registerTool(
  "delete_task",
  {
    title: "Delete task",
    description:
      "Permanently delete a task using its MongoDB ID. Ask the user for confirmation before deleting.",
    inputSchema: {
      id: z.string().min(1),
    },
  },
  async ({ id }) => {
    const result = await apiRequest(
      `/api/tasks/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );

    return {
      content: [
        { type: "text", text: JSON.stringify(result, null, 2) },
      ],
    };
  }
);

// Health check.
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "task-manager-mcp",
  });
});

// MCP endpoint. Authentication is disabled for this demo.
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);

    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed" });
    }
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Task Manager MCP server listening on port ${PORT}`);
});
