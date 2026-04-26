import { execFileSync } from "node:child_process";
import { closeSync, openSync, rmSync } from "node:fs";
import { resolve } from "node:path";

export default function setup() {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "file:./test.db";
  process.env.WECOM_WEBHOOK_URL = "";

  rmSync(resolve("prisma/test.db"), { force: true });
  rmSync(resolve("prisma/test.db-journal"), { force: true });
  closeSync(openSync(resolve("prisma/test.db"), "w"));

  const prismaCli = resolve("node_modules/prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "db", "push", "--schema", "prisma/schema.test.prisma", "--force-reset", "--skip-generate"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: "file:./test.db"
    }
  });
}
