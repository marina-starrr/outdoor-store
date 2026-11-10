// Запускає `next dev` і відкриває сайт у браузері, щойно сервер готовий.
// Додаткові аргументи передаються далі: `yarn dev -p 4000`.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  stdio: ["inherit", "pipe", "inherit"],
  // Зберігаємо кольоровий вивід Next, хоча stdout іде через pipe
  env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
});

let opened = false;

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (opened) return;
  // Next друкує, наприклад: "- Local:   http://localhost:3000"
  const match = chunk.toString().match(/Local:\s+(https?:\/\/\S+)/);
  if (match) {
    opened = true;
    openBrowser(match[1]);
  }
});

function openBrowser(url) {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

// Ctrl+C зупиняє і Next
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
