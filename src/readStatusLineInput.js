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

export function getSessionId(statusLineInput, env = process.env) {
  if (statusLineInput && typeof statusLineInput.session_id === "string" && statusLineInput.session_id) {
    return statusLineInput.session_id;
  }

  if (typeof env.CODEX_THREAD_ID === "string" && env.CODEX_THREAD_ID) {
    return env.CODEX_THREAD_ID;
  }

  return "";
}
