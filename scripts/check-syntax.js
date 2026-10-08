import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function collect(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return collect(path);
    return path.endsWith(".js") ? [path] : [];
  });
}

const files = ["src", "scripts", "test"].flatMap(collect);
for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
console.log(`syntax ok: ${files.length} files`);
