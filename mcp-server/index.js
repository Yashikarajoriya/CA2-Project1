
const express = require("express");
const { randomUUID } = require("node:crypto");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");

const app = express();
app.use(express.json());
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;


  

  const authHeader = req.headers.authorization;

  if (authHeader !== `Bearer ${MCP_AUTH_TOKEN}`) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  next();

const API_URL =
  process.env.TASK_API_URL ||
  "https://ca2-task-manager-backend.onrender.com";

const server = new McpServer({
  name: "task-manager-mcp",
  version: "1.0.0",
});

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
      content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
    };
  }
);

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
      content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
    };
  }
);

server.registerTool(
  "update_task",
  {
    title: "Update task",
    description: "Update a task using its MongoDB ID. Supply its title and completion status.",
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
      content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
    };
  }
);

server.registerTool(
  "delete_task",
  {
    title: "Delete task",
    description: "Permanently delete a task using its MongoDB ID. Ask the user for confirmation before deleting.",
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
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "task-manager-mcp" });
});

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
