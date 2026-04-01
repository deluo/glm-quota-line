async function readStdinText(stream) {
  let text = "";

  for await (const chunk of stream) {
    text += chunk;
  }

  return text;
}

export async function readStatusLineInput(stdin = process.stdin) {
  if (!stdin || stdin.isTTY) {
    return null;
  }

  try {
    const raw = await readStdinText(stdin);
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

