export function createEventHub() {
  const clients = new Set();

  function addClient(res) {
    clients.add(res);
    res.on("close", () => clients.delete(res));
  }

  function send(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(payload);
  }

  return { addClient, send };
}

