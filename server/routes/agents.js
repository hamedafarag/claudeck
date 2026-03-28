import { Router } from "express";
import { readFile, writeFile } from "fs/promises";
import { configPath } from "../paths.js";
import { getAllAgentContext } from "../../db.js";

const router = Router();

async function readAgents() {
  const data = await readFile(configPath("agents.json"), "utf-8");
  return JSON.parse(data);
}

async function writeAgents(agents) {
  await writeFile(configPath("agents.json"), JSON.stringify(agents, null, 2) + "\n");
}

async function readChains() {
  try {
    const data = await readFile(configPath("agent-chains.json"), "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeChains(chains) {
  await writeFile(configPath("agent-chains.json"), JSON.stringify(chains, null, 2) + "\n");
}

async function readDags() {
  try {
    const data = await readFile(configPath("agent-dags.json"), "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeDags(dags) {
  await writeFile(configPath("agent-dags.json"), JSON.stringify(dags, null, 2) + "\n");
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Agent Context (shared memory) ──

router.get("/context/:runId", async (req, res) => {
  try {
    const rows = await getAllAgentContext(req.params.runId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Agent Chains CRUD (must come before /:id to avoid route conflict) ──

router.get("/chains", async (req, res) => {
  try {
    res.json(await readChains());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/chains/:id", async (req, res) => {
  try {
    const chains = await readChains();
    const chain = chains.find((c) => c.id === req.params.id);
    if (!chain) return res.status(404).json({ error: "Chain not found" });
    res.json(chain);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/chains", async (req, res) => {
  try {
    const { title, description, agents: agentIds, contextPassing } = req.body;
    if (!title || !agentIds?.length) {
      return res.status(400).json({ error: "title and agents are required" });
    }
    const chains = await readChains();
    const id = slugify(title);
    if (chains.find((c) => c.id === id)) {
      return res.status(409).json({ error: `Chain "${id}" already exists` });
    }
    const chain = {
      id,
      title,
      description: description || "",
      agents: agentIds,
      contextPassing: contextPassing || "summary",
    };
    chains.push(chain);
    await writeChains(chains);
    res.json(chain);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/chains/:id", async (req, res) => {
  try {
    const chains = await readChains();
    const idx = chains.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Chain not found" });
    const { title, description, agents: agentIds, contextPassing } = req.body;
    if (title !== undefined) chains[idx].title = title;
    if (description !== undefined) chains[idx].description = description;
    if (agentIds !== undefined) chains[idx].agents = agentIds;
    if (contextPassing !== undefined) chains[idx].contextPassing = contextPassing;
    await writeChains(chains);
    res.json(chains[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/chains/:id", async (req, res) => {
  try {
    const chains = await readChains();
    const idx = chains.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Chain not found" });
    chains.splice(idx, 1);
    await writeChains(chains);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Agent DAGs CRUD ──

router.get("/dags", async (req, res) => {
  try {
    res.json(await readDags());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dags/:id", async (req, res) => {
  try {
    const dags = await readDags();
    const dag = dags.find((d) => d.id === req.params.id);
    if (!dag) return res.status(404).json({ error: "DAG not found" });
    res.json(dag);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/dags", async (req, res) => {
  try {
    const { title, description, nodes, edges } = req.body;
    if (!title || !nodes?.length) {
      return res.status(400).json({ error: "title and nodes are required" });
    }
    const dags = await readDags();
    const id = slugify(title);
    if (dags.find((d) => d.id === id)) {
      return res.status(409).json({ error: `DAG "${id}" already exists` });
    }
    const dag = { id, title, description: description || "", nodes, edges: edges || [] };
    dags.push(dag);
    await writeDags(dags);
    res.json(dag);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/dags/:id", async (req, res) => {
  try {
    const dags = await readDags();
    const idx = dags.findIndex((d) => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "DAG not found" });
    const { title, description, nodes, edges } = req.body;
    if (title !== undefined) dags[idx].title = title;
    if (description !== undefined) dags[idx].description = description;
    if (nodes !== undefined) dags[idx].nodes = nodes;
    if (edges !== undefined) dags[idx].edges = edges;
    await writeDags(dags);
    res.json(dags[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/dags/:id", async (req, res) => {
  try {
    const dags = await readDags();
    const idx = dags.findIndex((d) => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "DAG not found" });
    dags.splice(idx, 1);
    await writeDags(dags);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Agents CRUD ──

router.get("/", async (req, res) => {
  try {
    res.json(await readAgents());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const agents = await readAgents();
    const agent = agents.find((a) => a.id === req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, description, goal, icon, constraints } = req.body;
    if (!title || !goal) {
      return res.status(400).json({ error: "title and goal are required" });
    }
    const agents = await readAgents();
    const id = req.body.id || slugify(title);
    if (agents.find((a) => a.id === id)) {
      return res.status(409).json({ error: `Agent with id "${id}" already exists` });
    }
    const agent = {
      id,
      title,
      description: description || "",
      icon: icon || "tool",
      goal,
      custom: true,
      constraints: {
        maxTurns: constraints?.maxTurns || 50,
        timeoutMs: constraints?.timeoutMs || 300000,
      },
    };
    agents.push(agent);
    await writeAgents(agents);
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const agents = await readAgents();
    const idx = agents.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Agent not found" });
    const { title, description, goal, icon, constraints } = req.body;
    if (title !== undefined) agents[idx].title = title;
    if (description !== undefined) agents[idx].description = description;
    if (goal !== undefined) agents[idx].goal = goal;
    if (icon !== undefined) agents[idx].icon = icon;
    if (constraints) {
      agents[idx].constraints = {
        ...agents[idx].constraints,
        ...constraints,
      };
    }
    await writeAgents(agents);
    res.json(agents[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const agents = await readAgents();
    const idx = agents.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Agent not found" });
    agents.splice(idx, 1);
    await writeAgents(agents);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
