const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { Pool } = require("pg");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const databaseUrl = process.env.DATABASE_URL || "";
const adminToken = process.env.ADMIN_TOKEN || "";
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
    })
  : null;

const publicFiles = new Map([
  ["/", "fitness-meal-planner.html"],
  ["/fitness-meal-planner.html", "fitness-meal-planner.html"],
  ["/douyin.html", "抖音15秒试用招募素材.html"]
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(text);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 64) {
      throw new Error("request body too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonFile(filePath, fallback) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : fallback;
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function initDatabase() {
  if (!pool) return;
  await pool.query(`
    create table if not exists trial_leads (
      id uuid primary key,
      name text not null,
      contact text not null,
      need text not null,
      plan_goal text not null,
      created_at timestamptz not null,
      user_agent text not null default '',
      ip text not null default ''
    )
  `);
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function buildLead(input, request) {
  const name = cleanText(input.name, 40) || "未填写称呼";
  const contact = cleanText(input.contact, 80);
  const need = cleanText(input.need, 80) || "未填写需求";
  const planGoal = cleanText(input.planGoal, 40) || "未生成方案";

  if (!contact) {
    return { error: "请填写联系方式。" };
  }

  return {
    id: crypto.randomUUID(),
    name,
    contact,
    need,
    planGoal,
    createdAt: new Date().toISOString(),
    userAgent: request.headers["user-agent"] || "",
    ip: request.socket.remoteAddress || ""
  };
}

async function saveLead(request, response) {
  let input;
  try {
    input = JSON.parse(await readBody(request) || "{}");
  } catch (error) {
    sendJson(response, 400, { ok: false, error: "提交内容格式不正确。" });
    return;
  }

  const lead = buildLead(input, request);
  if (lead.error) {
    sendJson(response, 400, { ok: false, error: lead.error });
    return;
  }

  if (pool) {
    await pool.query(
      `insert into trial_leads
        (id, name, contact, need, plan_goal, created_at, user_agent, ip)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [lead.id, lead.name, lead.contact, lead.need, lead.planGoal, lead.createdAt, lead.userAgent, lead.ip]
    );
  } else {
    const filePath = path.join(dataDir, "leads.json");
    const leads = await readJsonFile(filePath, []);
    leads.push(lead);
    await writeJsonFile(filePath, leads);
  }

  sendJson(response, 201, { ok: true, lead: { id: lead.id, name: lead.name, need: lead.need } });
}

async function listLeads(request, response, url) {
  if (!adminToken) {
    sendJson(response, 403, { ok: false, error: "后台查看密码未配置。" });
    return;
  }

  if (url.searchParams.get("token") !== adminToken) {
    sendJson(response, 403, { ok: false, error: "没有权限查看。" });
    return;
  }

  if (pool) {
    const result = await pool.query(
      `select id, name, contact, need, plan_goal as "planGoal", created_at as "createdAt", user_agent as "userAgent", ip
       from trial_leads
       order by created_at desc`
    );
    sendJson(response, 200, { ok: true, count: result.rowCount, leads: result.rows });
    return;
  }

  const filePath = path.join(dataDir, "leads.json");
  const leads = await readJsonFile(filePath, []);
  sendJson(response, 200, { ok: true, count: leads.length, leads });
}

async function serveFile(request, response, url) {
  const pathname = decodeURIComponent(url.pathname);
  const mapped = publicFiles.get(pathname);
  const fileName = mapped || pathname.replace(/^\/+/, "");
  const filePath = path.resolve(rootDir, fileName);

  if (!filePath.startsWith(rootDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream"
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, database: pool ? "postgresql" : "json-file" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/leads") {
      await saveLead(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/leads") {
      await listLeads(request, response, url);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveFile(request, response, url);
      return;
    }

    sendJson(response, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { ok: false, error: "服务器出错，请稍后再试。" });
  }
});

const port = Number(process.env.PORT) || 3000;

async function start() {
  try {
    await initDatabase();
  } catch (error) {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  }

  server.listen(port, () => {
    console.log(`Fitness meal planner running at http://localhost:${port}`);
    console.log(`Storage: ${pool ? "PostgreSQL" : "JSON file fallback"}`);
  });
}

start();
