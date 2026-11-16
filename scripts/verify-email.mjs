// Підтвердити email користувача вручну — для власника з доступом до сервера,
// поки не налаштовано надсилання пошти (RESEND_API_KEY).
//   yarn admin:verify owner@example.com
// Працює з тією ж текою даних, що й сайт (FC_DATA_DIR або .data).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Вкажіть email: yarn admin:verify owner@example.com");
  process.exit(1);
}

const file = join(process.env.FC_DATA_DIR || join(process.cwd(), ".data"), "db.json");
if (!existsSync(file)) {
  console.error(`Базу не знайдено: ${file}`);
  process.exit(1);
}

const db = JSON.parse(readFileSync(file, "utf8"));
const user = db.users?.find((u) => u.email === email);
if (!user) {
  console.error(`Акаунт ${email} не знайдено. Спершу зареєструйтеся на сайті з цією адресою.`);
  process.exit(1);
}
if (user.emailVerifiedAt) {
  console.log(`${email} уже підтверджено (${user.emailVerifiedAt}).`);
  process.exit(0);
}

user.emailVerifiedAt = new Date().toISOString();
delete user.emailVerify;
// Атомарний запис, як і на сайті: тимчасовий файл, потім перейменування
const tmp = `${file}.${process.pid}.tmp`;
writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
renameSync(tmp, file);
console.log(`Готово: ${email} підтверджено.`);
console.log("Права адміністратора діють, якщо адреса є в ADMIN_EMAILS. Оновіть сторінку /admin.");
