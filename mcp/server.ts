import { MCPServer } from "@modelcontextprotocol/sdk";
import axios from "axios";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = "nuriygold/task-pool";

async function createTask({ title, description, priority }: any) {
  const res = await axios.post(
    `https://api.github.com/repos/${REPO}/issues`,
    {
      title,
      body: description || "",
      labels: priority ? [`priority:${priority}`] : []
    },
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json"
      }
    }
  );

  return { id: res.data.number, url: res.data.html_url };
}

async function updateTask({ id, status }: any) {
  const state = status === "closed" ? "closed" : "open";

  const res = await axios.patch(
    `https://api.github.com/repos/${REPO}/issues/${id}`,
    { state },
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json"
      }
    }
  );

  return { id: res.data.number, state: res.data.state };
}

const server = new MCPServer({
  name: "mothership",
  version: "1.0.0"
});

server.tool(
  "create_task",
  {
    title: "Create task in Mothership",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string" }
      },
      required: ["title"]
    }
  },
  async (input: any) => createTask(input)
);

server.tool(
  "update_task",
  {
    title: "Update task status",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        status: { type: "string" }
      },
      required: ["id"]
    }
  },
  async (input: any) => updateTask(input)
);

server.start();
