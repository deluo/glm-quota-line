function takeValue(args, index) {
  const current = args[index];
  const next = args[index + 1];

  if (current.includes("=")) {
    return current.split(/=(.*)/s)[1] ?? "";
  }

  return next ?? "";
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--version" || arg === "-v") {
      options.version = true;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--style" || arg.startsWith("--style=")) {
      options.style = takeValue(argv, index);
      if (!arg.includes("=")) {
        index += 1;
      }
      continue;
    }

    if (arg === "--display" || arg.startsWith("--display=")) {
      options.displayMode = takeValue(argv, index);
      if (!arg.includes("=")) {
        index += 1;
      }
      continue;
    }

    if (arg === "--theme" || arg.startsWith("--theme=")) {
      options.theme = takeValue(argv, index);
      if (!arg.includes("=")) {
        index += 1;
      }
      continue;
    }

    if (arg === "--ctx" || arg.startsWith("--ctx=")) {
      const val = takeValue(argv, index);
      if (val !== "on" && val !== "off") {
        process.stderr.write("Error: --ctx requires on or off\n");
        process.exitCode = 1;
        return options;
      }
      options.ctxEnabled = val === "on";
      if (!arg.includes("=")) {
        index += 1;
      }
      continue;
    }
  }

  options.positionals = positionals;
  return options;
}
