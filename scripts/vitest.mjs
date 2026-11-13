// Запускає Vitest. Аргументи передаються далі: `yarn test search`.
//
// Навіщо обгортка: на Windows термінал (зокрема у VS Code) часто відкриває
// проєкт як «e:\...» з малою літерою диска. Тоді Vitest завантажує сам себе
// двічі під різними шляхами, і ВСІ тести падають з помилкою
// «Vitest failed to find the current suite». Запускаємо його з тієї ж теки,
// але з великою літерою диска.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const fixDrive = (p) => (process.platform === "win32" && /^[a-z]:/.test(p) ? p[0].toUpperCase() + p.slice(1) : p);

// vitest.mjs не входить у "exports" пакета — шукаємо через package.json
const vitestDir = dirname(createRequire(import.meta.url).resolve("vitest/package.json"));
const vitestBin = fixDrive(join(vitestDir, "vitest.mjs"));
const child = spawn(process.execPath, [vitestBin, ...process.argv.slice(2)], {
  cwd: fixDrive(process.cwd()),
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 1));
