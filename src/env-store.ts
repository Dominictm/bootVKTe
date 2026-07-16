import fs from "fs";
import path from "path";

const ENV_PATH = path.join(process.cwd(), ".env");

export function writePanelCredentials(login: string, password: string): void {
  const lines = fs.existsSync(ENV_PATH)
    ? fs
        .readFileSync(ENV_PATH, "utf-8")
        .split(/\r?\n/)
        .filter((line) => line.length > 0)
    : [];

  const keep = lines.filter(
    (line) => !line.startsWith("WEB_ADMIN_LOGIN=") && !line.startsWith("WEB_ADMIN_PASSWORD=")
  );

  keep.push(`WEB_ADMIN_LOGIN=${login}`);
  keep.push(`WEB_ADMIN_PASSWORD=${password}`);

  fs.writeFileSync(ENV_PATH, keep.join("\n") + "\n", "utf-8");
}
