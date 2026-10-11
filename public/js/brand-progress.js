// Read incremental updates without losing JSON or UTF-8 split across network chunks.
export async function readBrandProgress(response, onProgress) {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Could not start the brand build. Please try again.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const consume = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.error);
    if (event.type === 'progress') onProgress(event);
    if (event.type === 'result') return event.result;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop();
      if (done && pending.trim()) lines.push(pending);
      for (const line of lines) {
        const result = consume(line);
        if (result) return result;
      }
      if (done) throw new Error('The connection ended before your brand was ready. Your brief is kept here; please try again.');
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
