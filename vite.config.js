import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs/promises";
import path from "node:path";

const cameraTimelineFiles = {
  desk: path.resolve(process.cwd(), "src/cameraTimelines/deskCamera.json"),
};

const sceneObjectFiles = {
  totoro: path.resolve(process.cwd(), "src/sceneObjects/totoroPlacement.json"),
};

const objectTransformFiles = {
  "desk-objects": path.resolve(
    process.cwd(),
    "src/sceneObjects/objectTransforms.json",
  ),
};

export default defineConfig({
  plugins: [tailwindcss(), cameraTimelinePlugin(), react()],
  server: {
    port: 8000,
  },
});

function cameraTimelinePlugin() {
  return {
    name: "camera-timeline-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = url.pathname.match(
          /^\/__camera-timeline\/([a-z0-9_-]+)$/i,
        );
        const objectMatch = url.pathname.match(
          /^\/__scene-object\/([a-z0-9_-]+)$/i,
        );
        const transformsMatch = url.pathname.match(
          /^\/__object-transforms\/([a-z0-9_-]+)$/i,
        );
        if (transformsMatch) {
          await handleObjectTransformsRequest(
            req,
            res,
            transformsMatch[1],
            server,
          );
          return;
        }
        if (objectMatch) {
          await handleSceneObjectRequest(req, res, objectMatch[1], server);
          return;
        }
        if (!match) {
          next();
          return;
        }

        const id = match[1];
        const file = cameraTimelineFiles[id];
        if (!file) {
          sendJson(res, 404, { error: `Unknown camera timeline "${id}"` });
          return;
        }

        if (req.method === "GET") {
          try {
            const json = await fs.readFile(file, "utf8");
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(json);
          } catch (error) {
            sendJson(res, 500, { error: error.message });
          }
          return;
        }

        if (req.method === "POST") {
          try {
            const body = JSON.parse(await readBody(req));
            validateTimeline(body, id);
            await fs.writeFile(file, `${JSON.stringify(body, null, 2)}\n`);
            invalidateTimelineModule(server, file);
            sendJson(res, 200, { ok: true });
          } catch (error) {
            sendJson(res, 400, { error: error.message });
          }
          return;
        }

        sendJson(res, 405, { error: "Method not allowed" });
      });
    },
  };
}

async function handleObjectTransformsRequest(req, res, id, server) {
  const file = objectTransformFiles[id];
  if (!file) {
    sendJson(res, 404, { error: `Unknown object transform set "${id}"` });
    return;
  }

  if (req.method === "GET") {
    try {
      const json = await fs.readFile(file, "utf8");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(json);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      validateObjectTransforms(body, id);
      await fs.writeFile(file, `${JSON.stringify(body, null, 2)}\n`);
      invalidateTimelineModule(server, file);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

async function handleSceneObjectRequest(req, res, id, server) {
  const file = sceneObjectFiles[id];
  if (!file) {
    sendJson(res, 404, { error: `Unknown scene object "${id}"` });
    return;
  }

  if (req.method === "GET") {
    try {
      const json = await fs.readFile(file, "utf8");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(json);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      validateSceneObject(body, id);
      await fs.writeFile(file, `${JSON.stringify(body, null, 2)}\n`);
      invalidateTimelineModule(server, file);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

function invalidateTimelineModule(server, file) {
  const normalized = file.split(path.sep).join("/");
  const modules = [
    server.moduleGraph.getModuleById(normalized),
    server.moduleGraph.getModuleById(`/@fs/${normalized}`),
  ].filter(Boolean);

  for (const mod of modules) {
    server.moduleGraph.invalidateModule(mod);
  }

  server.ws.send({ type: "full-reload", path: "*" });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function validateTimeline(body, id) {
  if (
    !body ||
    body.id !== id ||
    !body.motion ||
    !Array.isArray(body.motion.shots)
  ) {
    throw new Error("Invalid camera timeline payload");
  }

  for (const shot of body.motion.shots) {
    if (!Number.isFinite(shot.at) || shot.at < 0 || shot.at > 1) {
      throw new Error('Every shot needs an "at" value between 0 and 1');
    }
    if (!Number.isFinite(shot.fov) || shot.fov < 10 || shot.fov > 100) {
      throw new Error("Every shot needs a fov between 10 and 100");
    }
    if (
      shot.position &&
      (!Array.isArray(shot.position) || shot.position.length !== 3)
    ) {
      throw new Error("Shot position must be a 3-number array");
    }
    if (
      shot.target &&
      (!Array.isArray(shot.target) || shot.target.length !== 3)
    ) {
      throw new Error("Shot target must be a 3-number array");
    }
  }
}

function validateSceneObject(body, id) {
  if (!body || body.id !== id) {
    throw new Error("Invalid scene object payload");
  }

  if (!Array.isArray(body.rotation) || body.rotation.length !== 3) {
    throw new Error("Scene object rotation must be a 3-number array");
  }

  if (body.anchor) {
    if (
      !body.anchor.node ||
      !Array.isArray(body.anchor.offset) ||
      body.anchor.offset.length !== 3
    ) {
      throw new Error("Scene object anchor needs node and 3-number offset");
    }
  } else if (!Array.isArray(body.position) || body.position.length !== 3) {
    throw new Error("Scene object position must be a 3-number array");
  }
}

function validateObjectTransforms(body, id) {
  if (
    !body ||
    body.id !== id ||
    !body.objects ||
    typeof body.objects !== "object"
  ) {
    throw new Error("Invalid object transforms payload");
  }

  for (const [objectId, transform] of Object.entries(body.objects)) {
    if (!objectId || !transform)
      throw new Error("Invalid object transform entry");
    for (const key of ["position", "rotation", "scale"]) {
      if (!Array.isArray(transform[key]) || transform[key].length !== 3) {
        throw new Error(
          `Transform "${objectId}" needs ${key} as a 3-number array`,
        );
      }
      if (!transform[key].every(Number.isFinite)) {
        throw new Error(
          `Transform "${objectId}" ${key} values must be finite numbers`,
        );
      }
    }
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}
