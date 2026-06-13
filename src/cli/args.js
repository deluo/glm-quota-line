function takeValue(args, index) {
  const current = args[index];
  const next = args[index + 1];

  if (current.includes("=")) {
    return current.split(/=(.*)/s)[1] ?? "";
  }

  return next ?? "";
}

const FLAGS = [
  { names: ["--style"], dest: "style" },
  { names: ["--display"], dest: "displayMode" },
  { names: ["--theme"], dest: "theme" },
  { names: ["--force"], dest: "force", boolean: true },
  { names: ["--json"], dest: "json", boolean: true },
  { names: ["--yes"], dest: "yes", boolean: true },
  { names: ["--models"], dest: "models", boolean: true },
  { names: ["--help", "-h"], dest: "help", boolean: true },
  { names: ["--version", "-v"], dest: "version", boolean: true }
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }

    let matched = false;
    for (const flag of FLAGS) {
      const isMatch = flag.names.some(
        (name) => arg === name || arg.startsWith(`${name}=`)
      );
      if (!isMatch) {
        continue;
      }

      matched = true;

      if (flag.boolean) {
        options[flag.dest] = true;
        break;
      }

      const rawValue = takeValue(argv, index);
      if (!arg.includes("=")) {
        index += 1;
      }

      if (flag.parse) {
        const result = flag.parse(rawValue);
        if (result.error) {
          process.stderr.write(result.error);
          process.exitCode = 1;
          options.positionals = positionals;
          return options;
        }
        options[flag.dest] = result.value;
      } else {
        options[flag.dest] = rawValue;
      }
      break;
    }

    if (!matched) {
      // Unknown flags are ignored to allow forward-compatibility
    }
  }

  options.positionals = positionals;
  return options;
}
