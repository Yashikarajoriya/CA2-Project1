
const express = require("express");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");

const app = express();
app.use(express.json({ limit: "1mb" }));

const API_URL =
  process.env.TASK_API_URL ||
  "https://ca2-task-manager-backend.onrender.com";

const server = new McpServer({
  name: "task-manager-mcp",
  version: "1.0.0",
});

const GITHUB_OWNER = "Yashikarajoriya";
const GITHUB_REPO = "CA2-Project1";
const GITHUB_BRANCH = "main";

const ALLOWED_FRONTEND_FILES = [
  "frontend/index.html",
  "frontend/style.css",
  "frontend/script.js",
];

const FRONTEND_PATH_SCHEMA = z.enum([
  "frontend/index.html",
  "frontend/style.css",
  "frontend/script.js",
]);

function requireAllowedFrontendPath(path) {
  if (!ALLOWED_FRONTEND_FILES.includes(path)) {
    throw new Error("This file is not allowed.");
  }
}

function requireEditBranch(branch) {
  if (
    typeof branch !== "string" ||
    !/^claude\/frontend-[a-z0-9][a-z0-9-]{0,49}$/.test(branch)
  ) {
    throw new Error(
      "Use a branch created by create_frontend_edit_branch, with the claude/frontend- prefix."
    );
  }
}

async function githubApi(endpoint, options = {}) {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("GITHUB_TOKEN is not configured on the server.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${endpoint}`,
    {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("GitHub API error:", response.status);
    throw new Error(
      `GitHub API request failed with status ${response.status}.`
    );
  }

  return data;
}

async function getGitHubFile(path, branch) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const file = await githubApi(
    `/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`
  );

  if (Array.isArray(file) || !file.content || !file.encoding || !file.sha) {
    throw new Error("GitHub did not return a readable file.");
  }

  return {
    sha: file.sha,
    content: Buffer.from(file.content, file.encoding).toString("utf8"),
  };
}

// Task Manager backend helper.
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

// Tool 5: List the approved frontend files.
server.registerTool(
  "list_frontend_files",
  {
    title: "List frontend files",
    description:
      "List the approved frontend files that can be inspected or edited.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: ALLOWED_FRONTEND_FILES.join("\n"),
      },
    ],
  })
);

// Tool 6: Read a frontend file from main.
server.registerTool(
  "get_frontend_file",
  {
    title: "Read frontend file",
    description:
      "Read one approved frontend file from the main GitHub branch. This tool does not change files.",
    inputSchema: {
      path: FRONTEND_PATH_SCHEMA,
    },
  },
  async ({ path }) => {
    requireAllowedFrontendPath(path);
    const file = await getGitHubFile(path, GITHUB_BRANCH);

    return {
      content: [
        {
          type: "text",
          text: `File: ${path}\n\n${file.content}`,
        },
      ],
    };
  }
);

// Tool 7: Create a separate review branch from main.
server.registerTool(
  "create_frontend_edit_branch",
  {
    title: "Create frontend edit branch",
    description:
      "Create a new branch from main for reviewing frontend design changes. Use a short lowercase slug such as redesign-oct24. This does not change main or deploy the website.",
    inputSchema: {
      slug: z
        .string()
        .trim()
        .min(1)
        .max(50)
        .regex(
          /^[a-z0-9][a-z0-9-]*$/,
          "Use lowercase letters, numbers, and hyphens only."
        ),
    },
  },
  async ({ slug }) => {
    const branch = `claude/frontend-${slug}`;

    const mainRef = await githubApi(
      `/git/ref/heads/${GITHUB_BRANCH}`
    );

    const mainSha = mainRef.object && mainRef.object.sha;

    if (!mainSha) {
      throw new Error("Could not determine the latest main commit.");
    }

    // Check whether this branch already exists.
    const encodedBranch = branch
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    const existing = await githubApi(
      `/git/ref/heads/${encodedBranch}`,
      { method: "GET" }
    ).then(
      (data) => ({ exists: true, data }),
      (error) => {
        if (error.message.includes("status 404")) {
          return { exists: false };
        }
        throw error;
      }
    );

    if (existing.exists) {
      throw new Error(
        `Branch ${branch} already exists. Choose a different slug.`
      );
    }

    await githubApi("/git/refs", {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: mainSha,
      }),
    });

    return {
      content: [
        {
          type: "text",
          text:
            `Created branch ${branch} from main.\n` +
            "No files have been changed yet. Review changes on this branch before merging.",
        },
      ],
    };
  }
);

// Tool 8: Replace one approved file on a review branch.

server.registerTool(
  "update_frontend_file",
  {
    title: "Publish frontend file to main",
    description:
      "Update one approved frontend file directly on the main GitHub branch. This triggers Netlify's automatic production deployment. Read the current file first and preserve existing functionality unless the user requests a change.",
    inputSchema: {
      path: FRONTEND_PATH_SCHEMA,
      content: z.string().max(100000),
      commit_message: z.string().trim().min(5).max(120),
    },
  },
  async ({ path, content, commit_message }) => {
    requireAllowedFrontendPath(path);

    if (content.includes("\u0000")) {
      throw new Error("File content contains an invalid null character.");
    }

    const currentFile = await getGitHubFile(path, GITHUB_BRANCH);
    const encodedPath = path
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    const result = await githubApi(`/contents/${encodedPath}`, {
      method: "PUT",
      body: JSON.stringify({
        message: commit_message,
        content: Buffer.from(content, "utf8").toString("base64"),
        sha: currentFile.sha,
        branch: GITHUB_BRANCH,
      }),
    });

    return {
      content: [
        {
          type: "text",
          text:
            `Published ${path} to ${GITHUB_BRANCH}.\n` +
            `Commit: ${
              result.commit && result.commit.sha
                ? result.commit.sha
                : "created"
            }\n` +
            "Netlify should automatically deploy the new commit.",
        },
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
