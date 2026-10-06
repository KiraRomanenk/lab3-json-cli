import { Command } from "commander";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const program = new Command();

program
  .name("foldercli")
  .description("CLI-програма для перегляду вмісту каталогу диска, збереженого у форматі JSON")
  .version("1.0.0")
  .option("-f, --file <path>", "шлях до JSON-файлу з даними каталогу", "data1.json");

function loadData(filePath) {
  let raw;
  try {
    raw = readFileSync(resolve(filePath), "utf-8");
  } catch {
    console.error(`Помилка: файл "${filePath}" не знайдено.`);
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch {
    console.error(`Помилка: файл "${filePath}" не є коректним JSON.`);
    process.exit(1);
  }
}

// рекурсивний пошук елемента (файлу або папки) за точною назвою у всьому дереві
function findByName(node, name, pathSoFar = node.name) {
  if (node.name === name) return { node, path: pathSoFar };
  if (node.type === "folder" && Array.isArray(node.contents)) {
    for (const child of node.contents) {
      const found = findByName(child, name, `${pathSoFar}/${child.name}`);
      if (found) return found;
    }
  }
  return null;
}

// рекурсивний пошук за частиною назви (повертає всі збіги)
function findAllByQuery(node, query, pathSoFar = node.name, results = []) {
  if (node.name.toLowerCase().includes(query.toLowerCase())) {
    results.push({ path: pathSoFar, type: node.type });
  }
  if (node.type === "folder" && Array.isArray(node.contents)) {
    for (const child of node.contents) {
      findAllByQuery(child, query, `${pathSoFar}/${child.name}`, results);
    }
  }
  return results;
}

// сумарний розмір папки з урахуванням усіх вкладених файлів
function totalSize(node) {
  if (node.type === "file") return node.sizeBytes;
  if (node.type === "folder" && Array.isArray(node.contents)) {
    return node.contents.reduce((sum, child) => sum + totalSize(child), 0);
  }
  return 0;
}

// отримати значення поля за шляхом типу "sizeBytes" або "contents[0].name"
function getFieldByPath(obj, path) {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

program
  .command("list")
  .description("показати стислий список елементів верхнього рівня кореневої папки")
  .option("-l, --limit <number>", "обмежити кількість елементів у списку")
  .action((options) => {
    const data = loadData(program.opts().file);
    let items = data.contents || [];
    if (options.limit) {
      const n = Number(options.limit);
      if (Number.isNaN(n)) {
        console.error("Помилка: опція --limit має бути числом.");
        process.exit(1);
      }
      items = items.slice(0, n);
    }
    items.forEach((item) => {
      console.log(`${item.type === "folder" ? "[папка]" : "[файл] "} ${item.name}`);
    });
  });

program
  .command("item <name>")
  .description("показати один елемент даних (файл або папку) цілком за його назвою")
  .action((name) => {
    const data = loadData(program.opts().file);
    const found = findByName(data, name);
    if (!found) {
      console.error(`Помилка: елемент із назвою "${name}" не знайдено.`);
      process.exit(1);
    }
    console.log(JSON.stringify(found.node, null, 2));
  });

program
  .command("field <name> <path>")
  .description("показати значення окремого поля елемента, зокрема вкладеного (напр. contents[0].name)")
  .action((name, path) => {
    const data = loadData(program.opts().file);
    const found = findByName(data, name);
    if (!found) {
      console.error(`Помилка: елемент із назвою "${name}" не знайдено.`);
      process.exit(1);
    }
    const value = getFieldByPath(found.node, path);
    if (value === undefined) {
      console.error(`Помилка: поля "${path}" не існує в цьому елементі.`);
      process.exit(1);
    }
    if (value === null) {
      console.log("null");
    } else if (typeof value === "object") {
      console.log(JSON.stringify(value, null, 2));
    } else {
      console.log(value);
    }
  });

program
  .command("contents <folderName>")
  .description("показати вміст вкладеної папки за її назвою")
  .option("-H, --hidden", "показувати також приховані елементи", false)
  .action((folderName, options) => {
    const data = loadData(program.opts().file);
    const found = findByName(data, folderName);
    if (!found) {
      console.error(`Помилка: папку "${folderName}" не знайдено.`);
      process.exit(1);
    }
    if (found.node.type !== "folder") {
      console.error(`Помилка: елемент "${folderName}" є файлом, а не папкою.`);
      process.exit(1);
    }
    let items = found.node.contents || [];
    if (!options.hidden) {
      items = items.filter((i) => !i.isHidden);
    }
    if (items.length === 0) {
      console.log("Папка порожня (або всі елементи приховані).");
      return;
    }
    items.forEach((item) => {
      const hiddenMark = item.isHidden ? " (прихований)" : "";
      console.log(`${item.type === "folder" ? "[папка]" : "[файл] "} ${item.name}${hiddenMark}`);
    });
  });

program
  .command("size [folderName]")
  .description("показати сумарний розмір папки з урахуванням усіх вкладених файлів")
  .action((folderName) => {
    const data = loadData(program.opts().file);
    let target = data;
    if (folderName) {
      const found = findByName(data, folderName);
      if (!found) {
        console.error(`Помилка: папку "${folderName}" не знайдено.`);
        process.exit(1);
      }
      if (found.node.type !== "folder") {
        console.error(`Помилка: елемент "${folderName}" є файлом, а не папкою.`);
        process.exit(1);
      }
      target = found.node;
    }
    const bytes = totalSize(target);
    console.log(`Сумарний розмір "${target.name}": ${bytes} байт`);
  });


program
  .command("find <query>")
  .description("пошук файлу чи папки за частиною назви в усьому дереві")
  .action((query) => {
    const data = loadData(program.opts().file);
    const results = findAllByQuery(data, query);
    if (results.length === 0) {
      console.log(`Нічого не знайдено за запитом "${query}".`);
      return;
    }
    results.forEach((r) => {
      console.log(`${r.type === "folder" ? "[папка]" : "[файл] "} ${r.path}`);
    });
  });

program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (
    err.code === "commander.help" ||
    err.code === "commander.helpDisplayed" ||
    err.code === "commander.version"
  ) {
    process.exit(0);
  }
  if (err.code === "commander.missingArgument") {
    console.error("Помилка: не вказано обов'язковий аргумент команди.");
  } else if (err.code === "commander.unknownOption") {
    console.error("Помилка: невідома опція.");
  } else if (err.code) {
    console.error("Помилка: некоректний виклик програми. Використайте --help для довідки.");
  } else {
    console.error(`Помилка: ${err.message}`);
  }
  process.exit(1);
}